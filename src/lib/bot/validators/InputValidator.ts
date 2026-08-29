/**
 * InputValidator — Validadores dependientes del contexto.
 *
 * Cada campo tiene su propio validador. Los cálculos financieros
 * usan ENTEROS (centavos / pesos colombianos) para evitar errores de float.
 *
 * Regla fundamental: El usuario NUNCA puede modificar precios, totales
 * ni estados mediante texto. Todos los valores críticos provienen de la DB.
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

export const MAX_QUANTITY          = 30;    // máximo por producto
export const MIN_QUANTITY          = 1;
export const MAX_AMOUNT_COP        = 5_000_000; // 5 millones COP máximo
export const MIN_AMOUNT_COP        = 100;        // 100 pesos mínimo
export const MAX_ADDRESS_LENGTH    = 200;
export const MAX_NOTE_LENGTH       = 300;
export const MAX_REFERENCE_LENGTH  = 80;

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type ValidationResult<T = void> =
  | { valid: true; value: T }
  | { valid: false; errorMessage: string };

// ─── Mapa de palabras numéricas (lenguaje natural) ────────────────────────────

const WORD_TO_NUMBER: Record<string, number> = {
  // español
  uno: 1, una: 1, un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciséis: 16, dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  // inglés (por si acaso)
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// ─── Validadores ──────────────────────────────────────────────────────────────

/**
 * Valida y parsea una cantidad de producto.
 * Acepta: números positivos (1-30) y lenguaje natural ("dos", "three").
 */
export function validateQuantity(text: string): ValidationResult<number> {
  const normalized = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Intentar lenguaje natural primero
  if (WORD_TO_NUMBER[normalized] !== undefined) {
    const qty = WORD_TO_NUMBER[normalized];
    return { valid: true, value: qty };
  }

  // Intentar número
  const parsed = parseInt(normalized, 10);

  if (isNaN(parsed)) {
    return {
      valid: false,
      errorMessage: `⚠️ No entendí esa cantidad.\n\nPor favor, escribe un número como *1*, *2*, *3*... o palabras como *"dos"*, *"tres"*.`,
    };
  }

  if (parsed <= 0) {
    return {
      valid: false,
      errorMessage: `⚠️ La cantidad debe ser mayor a cero.\n\nEscribe un número entre ${MIN_QUANTITY} y ${MAX_QUANTITY}.`,
    };
  }

  if (parsed > MAX_QUANTITY) {
    return {
      valid: false,
      errorMessage: `⚠️ La cantidad máxima por producto es *${MAX_QUANTITY} unidades*.\n\nSi necesitas más, contáctanos directamente.`,
    };
  }

  return { valid: true, value: parsed };
}

/**
 * Normaliza y valida un monto monetario colombiano.
 *
 * Acepta múltiples formatos:
 *   "$78.500" → 78500
 *   "78.500"  → 78500
 *   "78,500"  → 78500
 *   "78500"   → 78500
 *   "78 500"  → 78500
 *   "78.5"    → INVÁLIDO (no se permiten decimales en COP)
 *
 * Retorna entero (pesos colombianos, sin decimales).
 * NUNCA usa parseFloat para cálculos financieros.
 */
export function normalizeAmount(text: string): number | null {
  // Eliminar símbolo $, espacios, y separadores de miles comunes en CO
  let cleaned = text
    .replace(/[$\s]/g, '')   // quitar $ y espacios
    .replace(/\./g, '')       // quitar puntos (separador de miles en CO)
    .replace(/,/g, '');       // quitar comas (también separador)

  // Verificar que solo queden dígitos
  if (!/^\d+$/.test(cleaned)) return null;

  const amount = parseInt(cleaned, 10);
  return isNaN(amount) ? null : amount;
}

/**
 * Valida un billete de pago en efectivo contra el total requerido.
 * Usa enteros para evitar errores de punto flotante.
 */
export function validateAmount(text: string, expectedTotal: number): ValidationResult<{ amount: number; change: number }> {
  const amount = normalizeAmount(text);

  if (amount === null) {
    return {
      valid: false,
      errorMessage: `⚠️ No reconozco ese valor.\n\nPor favor escribe el monto sin puntos decimales. Ej: *50000* o *100000*.`,
    };
  }

  if (amount < MIN_AMOUNT_COP) {
    return {
      valid: false,
      errorMessage: `⚠️ El monto ingresado es demasiado bajo.\n\nEl valor mínimo aceptado es *$${MIN_AMOUNT_COP.toLocaleString('es-CO')}*.`,
    };
  }

  if (amount > MAX_AMOUNT_COP) {
    return {
      valid: false,
      errorMessage: `⚠️ El valor ingresado supera el límite permitido.\n\nSi necesitas ayuda, contáctanos.`,
    };
  }

  if (amount < expectedTotal) {
    return {
      valid: false,
      errorMessage: `⚠️ El billete de *$${amount.toLocaleString('es-CO')}* no alcanza para cubrir el total.\n\n💰 *Total a pagar: $${expectedTotal.toLocaleString('es-CO')}*\n\n✏️ Escribe un valor mayor o igual al total:`,
    };
  }

  // Usar aritmética entera
  const change = amount - expectedTotal;
  return { valid: true, value: { amount, change } };
}

/**
 * Valida una dirección de domicilio.
 * Permite: letras, números, espacios, #, -, /, comas, puntos.
 * Longitud razonable.
 */
export function validateAddress(text: string): ValidationResult<string> {
  const cleaned = text.trim();

  if (cleaned.length < 5) {
    return {
      valid: false,
      errorMessage: `⚠️ La dirección es muy corta.\n\nEscribe la dirección completa. Ej: *Cra 19 #18-44 Barrio Centro*`,
    };
  }

  if (cleaned.length > MAX_ADDRESS_LENGTH) {
    return {
      valid: false,
      errorMessage: `⚠️ La dirección es demasiado larga (máx. ${MAX_ADDRESS_LENGTH} caracteres).\n\nResume la información esencial.`,
    };
  }

  // Bloquear caracteres que no tienen sentido en una dirección
  if (/[<>{}|\\^~`"]/.test(cleaned)) {
    return {
      valid: false,
      errorMessage: `⚠️ La dirección contiene caracteres no permitidos.\n\nEscribe solo letras, números y signos como #, -, /.`,
    };
  }

  return { valid: true, value: cleaned };
}

/**
 * Valida una nota/instrucción especial para un producto o mensaje al encargado.
 * Más permisiva que la dirección, pero con límite de longitud.
 */
export function validateNote(text: string): ValidationResult<string> {
  const cleaned = text.trim();

  if (cleaned.length > MAX_NOTE_LENGTH) {
    return {
      valid: false,
      errorMessage: `⚠️ La nota es muy larga (máx. ${MAX_NOTE_LENGTH} caracteres).\n\nSe ha truncado automáticamente.`,
    };
  }

  // Eliminar caracteres de control pero permitir emojis
  const sanitized = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  return { valid: true, value: sanitized };
}

/**
 * Valida una referencia de transacción/pago.
 * Permite alfanumérico, guiones, espacios. Normaliza a mayúsculas.
 */
export function validateReference(text: string): ValidationResult<string> {
  const cleaned = text.trim();

  if (!cleaned) {
    return {
      valid: false,
      errorMessage: `⚠️ La referencia no puede estar vacía.`,
    };
  }

  if (cleaned.length > MAX_REFERENCE_LENGTH) {
    return {
      valid: false,
      errorMessage: `⚠️ La referencia es demasiado larga.`,
    };
  }

  // Normalizar: quitar espacios extras, guiones al inicio/fin
  const normalized = cleaned
    .toUpperCase()
    .replace(/\s+/g, '')     // quitar espacios
    .replace(/^-+|-+$/g, '') // quitar guiones al inicio/fin
    .replace(/[^A-Z0-9\-]/g, ''); // solo alfanumérico y guiones

  if (!normalized) {
    return {
      valid: false,
      errorMessage: `⚠️ La referencia contiene solo caracteres inválidos.\n\nUsa solo letras, números o guiones.`,
    };
  }

  return { valid: true, value: normalized };
}

/**
 * Valida y normaliza un comando de Telegram (/start, /menu, etc.).
 * Bloquea comandos que no existen en el bot.
 */
export function validateCommand(text: string): ValidationResult<string> {
  const validCommands = ['/start', '/menu', '/carrito', '/pedidos', '/ayuda', '/help', '/cancelar'];
  const cmd = text.toLowerCase().split(' ')[0];

  if (!validCommands.includes(cmd)) {
    return {
      valid: false,
      errorMessage: `ℹ️ Comando no reconocido.\n\nUsa los botones del menú o escribe */start* para comenzar.`,
    };
  }

  return { valid: true, value: cmd };
}

/**
 * Normalización general de texto para comparaciones internas.
 * NO usa para mostrar al usuario.
 */
export function normalizeInput(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[\u00A1\u00BF.,\/#!$%\^&\*;:{}=\-_`~()¿?¡]/g, '') // puntuación extendida incl. ¿¡
    .replace(/\s+/g, ' ') // colapsar espacios múltiples
    .trim();
}
