/**
 * MessageGuard — Capa de seguridad central para todo mensaje entrante de Telegram.
 *
 * Todo mensaje DEBE pasar por esta capa antes de llegar al agente.
 * Controla: longitud, spam, flood, prompt injection, comandos inesperados.
 *
 * El texto del usuario SIEMPRE es tratado como USER INPUT y nunca puede
 * modificar instrucciones internas, precios, estados o permisos.
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; userMessage: string };

// ─── Configuración ─────────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 600;         // chars máximos por mensaje
const MAX_NOTE_LENGTH    = 300;         // para notas de producto / contacto
const RATE_WINDOW_MS     = 10_000;      // ventana de 10 segundos
const RATE_MAX_MESSAGES  = 8;           // máx mensajes en la ventana
const FLOOD_COOLDOWN_MS  = 30_000;      // bloqueo de 30s si excede flood

// ─── Estado en memoria (por instancia de servidor) ────────────────────────────

interface RateBucket {
  timestamps: number[];
  blockedUntil?: number;
}

const rateBuckets = new Map<number, RateBucket>();
const processedUpdateIds = new Set<number>();

// Limpiar update IDs antiguos cada 5 minutos para no crecer indefinidamente
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    // Mantener solo los últimos 2000 update IDs
    if (processedUpdateIds.size > 2000) {
      const arr = Array.from(processedUpdateIds);
      arr.slice(0, arr.length - 1000).forEach(id => processedUpdateIds.delete(id));
    }
    // Limpiar buckets con última actividad > 5 min
    const cutoff = Date.now() - 5 * 60_000;
    for (const [chatId, bucket] of rateBuckets.entries()) {
      const last = bucket.timestamps[bucket.timestamps.length - 1] ?? 0;
      if (last < cutoff) rateBuckets.delete(chatId);
    }
  }, 5 * 60_000);
}

// ─── Patrones de Prompt Injection ─────────────────────────────────────────────

/**
 * Patrones que intentan manipular el comportamiento del sistema.
 * IMPORTANTE: Si un mensaje coincide, se responde de forma segura y NO
 * se ejecuta ninguna acción administrativa.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Comandos directos de anulación
  /ignora(r)?\s+(todas?\s+)?(las?\s+)?instrucciones/i,
  /ignore\s+(all\s+)?instructions/i,
  /olvida\s+(todo|tus\s+instrucciones)/i,
  /forget\s+(everything|your\s+instructions)/i,

  // Intentos de marcado de estado
  /marca\s+(mi\s+)?pedido\s+como\s+(pagado|entregado|confirmado)/i,
  /mark\s+(my\s+)?order\s+as\s+(paid|delivered|confirmed)/i,
  /cambia\s+el\s+(estado|precio|total)\s+(a|de)/i,
  /change\s+(the\s+)?(price|status|total)/i,

  // Intentos de extracción de información interna
  /dame\s+el\s+(prompt|system\s*prompt|instrucciones?\s+del\s+sistema)/i,
  /show\s+me\s+(the\s+)?(prompt|system\s*prompt|internal)/i,
  /repite\s+(tus\s+)?instrucciones/i,
  /print\s+(your\s+)?instructions/i,
  /what\s+are\s+your\s+instructions/i,
  /cu[aá]les\s+son\s+tus\s+instrucciones/i,

  // Intentos de ejecución de código
  /```[\s\S]*?```/,                         // bloques de código
  /<script[\s\S]*?>/i,                       // script tags
  /\beval\s*\(/i,
  /\bexec\s*\(/i,

  // Intentos de cambiar precios / stock
  /cambia\s+(el\s+)?precio\s+(a|de)/i,
  /cambia\s+(el\s+)?stock/i,
  /set\s+price\s+to/i,
  /make\s+(it|the\s+price)\s+(free|gratis|\$?0)/i,

  // Rol / permisos
  /actúa\s+como\s+(admin|sistema|root)/i,
  /act\s+as\s+(admin|system|root)/i,
  /eres\s+(ahora\s+)?(un\s+)?(admin|sistema)/i,
  /you\s+are\s+(now\s+)?(an?\s+)?(admin|system)/i,

  // SQL / NoSQL injection patterns
  /'\s*(or|and)\s*'?\s*[0-9]/i,
  /union\s+select/i,
  /drop\s+table/i,
  /delete\s+from/i,
];

// ─── Funciones Públicas ────────────────────────────────────────────────────────

/**
 * Verifica idempotencia: retorna true si ya procesamos este update_id.
 * Úsalo ANTES de procesar cualquier webhook.
 */
export function isProcessedUpdate(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) return true;
  processedUpdateIds.add(updateId);
  return false;
}

/**
 * Verifica si un mensaje de texto pasa la capa de seguridad.
 * Llamar ANTES de cualquier lógica de negocio.
 */
export function guardMessage(chatId: number, text: string): GuardResult {
  // 1. Verificar rate limit / flood
  const rateResult = checkRateLimit(chatId);
  if (!rateResult.allowed) return rateResult;

  // 2. Verificar longitud
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      allowed: false,
      reason: `Message too long: ${text.length} chars from chatId ${chatId}`,
      userMessage: `⚠️ Tu mensaje es demasiado largo.\n\nPor favor, envía un mensaje más corto (máximo ${MAX_MESSAGE_LENGTH} caracteres).`,
    };
  }

  // 3. Verificar caracteres anormales (solo permite texto UTF-8 normal + emojis)
  if (containsAbnormalChars(text)) {
    return {
      allowed: false,
      reason: `Abnormal characters in message from chatId ${chatId}`,
      userMessage: `⚠️ El mensaje contiene caracteres no permitidos.\n\nPor favor, escribe tu mensaje normalmente.`,
    };
  }

  // 4. Verificar prompt injection
  const injectionResult = detectInjection(text);
  if (!injectionResult.allowed) return injectionResult;

  return { allowed: true };
}

/**
 * Verifica solo rate limit (útil para callbacks sin texto).
 */
export function guardCallback(chatId: number): GuardResult {
  return checkRateLimit(chatId);
}

/**
 * Sanitiza el texto para uso seguro en respuestas y logs.
 * No modifica la lógica — solo elimina caracteres peligrosos.
 */
export function sanitizeForLog(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, '') // caracteres de control
    .slice(0, 200);                          // truncar para logs
}

/**
 * Sanitiza el nombre de usuario para mostrarlo en mensajes.
 */
export function sanitizeUsername(username: string): string {
  return username
    .replace(/[<>'"&]/g, '')    // html entities
    .replace(/\*/g, '')          // markdown bold
    .replace(/[_~`]/g, '')       // markdown italic/code
    .slice(0, 50)
    .trim() || 'Cliente';
}

/**
 * Trunca una nota de producto/contacto a la longitud máxima permitida.
 */
export function sanitizeNote(note: string): string {
  return note
    .replace(/[<>]/g, '')                    // html
    .replace(/\*/g, '\\*')                   // escape markdown
    .slice(0, MAX_NOTE_LENGTH)
    .trim();
}

// ─── Funciones Internas ────────────────────────────────────────────────────────

function checkRateLimit(chatId: number): GuardResult {
  const now = Date.now();

  if (!rateBuckets.has(chatId)) {
    rateBuckets.set(chatId, { timestamps: [] });
  }

  const bucket = rateBuckets.get(chatId)!;

  // Si está bloqueado por flood
  if (bucket.blockedUntil && now < bucket.blockedUntil) {
    const secsLeft = Math.ceil((bucket.blockedUntil - now) / 1000);
    return {
      allowed: false,
      reason: `ChatId ${chatId} is flood-blocked for ${secsLeft}s`,
      userMessage: `⏳ Estás enviando mensajes muy rápido.\n\nPor favor, espera ${secsLeft} segundos antes de continuar.`,
    };
  }

  // Limpiar timestamps fuera de la ventana
  bucket.timestamps = bucket.timestamps.filter(ts => now - ts < RATE_WINDOW_MS);

  // Verificar si excede el límite
  if (bucket.timestamps.length >= RATE_MAX_MESSAGES) {
    bucket.blockedUntil = now + FLOOD_COOLDOWN_MS;
    bucket.timestamps = [];
    console.warn(`[MessageGuard] Flood detected from chatId ${chatId}`);
    return {
      allowed: false,
      reason: `Flood from chatId ${chatId}`,
      userMessage: `🚫 Demasiados mensajes en poco tiempo.\n\nPor favor, espera 30 segundos antes de continuar.`,
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

function detectInjection(text: string): GuardResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(`[MessageGuard] Prompt injection attempt blocked: "${text.slice(0, 80)}..."`);
      return {
        allowed: false,
        reason: `Prompt injection pattern matched: ${pattern.toString()}`,
        userMessage: [
          `ℹ️ Ese tipo de mensaje no corresponde a una acción disponible.`,
          ``,
          `Para realizar tu pedido, usa el menú interactivo:`,
        ].join('\n'),
      };
    }
  }
  return { allowed: true };
}

function containsAbnormalChars(text: string): boolean {
  // Permite: letras, números, espacios, puntuación normal, emojis (todos en UTF-16 > 0x20)
  // Bloquea: caracteres de control U+0000–U+001F excepto \n y \t
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x0009) return true;           // control antes de \t
    if (code === 0x000B || code === 0x000C) return true; // \v \f
    if (code >= 0x000E && code <= 0x001F) return true;   // control chars
    if (code === 0x007F) return true;          // DEL
  }
  return false;
}
