/**
 * PaymentProofValidator — Validación automática de comprobantes de pago.
 *
 * Modo fallback activo: Sin GOOGLE_AI_API_KEY, todos los comprobantes
 * van a MANUAL_REVIEW (revisión humana en el dashboard).
 *
 * Cuando la API está disponible: extrae datos estructurados del comprobante,
 * calcula un score antifraude y determina el estado automáticamente.
 *
 * REGLA FUNDAMENTAL:
 * El score de IA NO confirma que el dinero llegó al banco.
 * Solo el admin puede marcar un pago como VERIFIED.
 *
 * Estados de pago:
 *   PENDING           → Esperando comprobante
 *   PROOF_RECEIVED    → Imagen recibida, pendiente de análisis
 *   AI_REVIEW         → Siendo analizada por IA
 *   AI_VERIFIED       → IA aprueba (score ≥ 90), requiere confirmación humana final
 *   MANUAL_REVIEW     → IA dudosa (score 70-89) o sin API, necesita admin
 *   REJECTED          → Rechazado automáticamente (score < 70 o fraude detectado)
 *   VERIFIED          → Admin confirmó manualmente el pago
 */

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'PENDING'
  | 'PROOF_RECEIVED'
  | 'AI_REVIEW'
  | 'AI_VERIFIED'
  | 'MANUAL_REVIEW'
  | 'REJECTED'
  | 'VERIFIED';

export interface ExtractedPaymentData {
  /** Monto detectado en el comprobante (pesos COP, entero) */
  amount: number | null;
  /** Moneda detectada */
  currency: string | null;
  /** Método de pago detectado */
  payment_method: string | null;
  /** ID de transacción / referencia */
  transaction_id: string | null;
  /** Fecha del comprobante */
  date: string | null;
  /** Hora del comprobante */
  time: string | null;
  /** Destinatario / beneficiario */
  recipient: string | null;
  /** Estado de la transacción según el comprobante */
  transaction_status: 'approved' | 'rejected' | 'pending' | 'unknown';
  /** Nivel de confianza del OCR 0-1 */
  ocr_confidence: number;
}

export interface ProofValidationResult {
  /** Estado de pago resultante */
  status: PaymentStatus;
  /** Score antifraude 0-100 */
  score: number;
  /** Datos extraídos por IA/OCR */
  extracted: ExtractedPaymentData | null;
  /** Razón del resultado */
  reason: string;
  /** Hash de la imagen para deduplicación */
  image_hash: string;
  /** Si es un comprobante reutilizado */
  is_reused: boolean;
  /** Mensaje amigable para el usuario */
  user_message: string;
}

interface ValidateProofOptions {
  /** URL pública de la imagen ya subida a Supabase Storage */
  imageUrl: string;
  /** Total esperado en pesos COP (entero) */
  expectedAmountCop: number;
  /** Método de pago seleccionado */
  paymentMethod: 'transfer' | 'cash' | 'ondelivery';
  /** ID del pedido para guardar en auditoría */
  orderId?: string;
  /** Número de cuenta Nequi configurado */
  nequiNumber?: string;
  /** Número de cuenta Bancolombia configurado */
  bancolombiaNumber?: string;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Sistema de Score ─────────────────────────────────────────────────────────

/**
 * Calcula el score antifraude con base en los datos extraídos vs esperados.
 *
 * Componentes:
 *   Valor coincide              +25
 *   Estado aprobado             +20
 *   Referencia válida           +20
 *   Fecha válida                +10
 *   Imagen legible (OCR conf)   +10
 *   Método correcto             +10
 *   Destinatario reconocido     +5
 */
function calculateScore(
  extracted: ExtractedPaymentData,
  options: ValidateProofOptions
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // 1. Valor coincide (±5% tolerancia por posibles comisiones)
  if (extracted.amount !== null) {
    const tolerance = Math.round(options.expectedAmountCop * 0.05);
    const diff = Math.abs(extracted.amount - options.expectedAmountCop);
    if (diff <= tolerance) {
      breakdown['Valor coincide'] = 25;
    } else if (diff <= tolerance * 3) {
      breakdown['Valor aproximado'] = 10;
    } else {
      breakdown['Valor incorrecto'] = 0;
    }
  }

  // 2. Estado aprobado
  if (extracted.transaction_status === 'approved') {
    breakdown['Estado aprobado'] = 20;
  } else if (extracted.transaction_status === 'pending') {
    breakdown['Estado pendiente'] = 5;
  } else if (extracted.transaction_status === 'rejected') {
    breakdown['Estado rechazado'] = -20; // penalización
  }

  // 3. Referencia válida (no vacía, formato alfanumérico)
  if (extracted.transaction_id && /^[A-Z0-9\-]{4,}$/i.test(extracted.transaction_id)) {
    breakdown['Referencia válida'] = 20;
  }

  // 4. Fecha válida (dentro de las últimas 24h)
  if (extracted.date) {
    try {
      const proofDate = new Date(extracted.date);
      const now = new Date();
      const diffHours = (now.getTime() - proofDate.getTime()) / (1000 * 3600);
      if (diffHours >= 0 && diffHours <= 24) {
        breakdown['Fecha válida'] = 10;
      } else if (diffHours > 24 && diffHours <= 72) {
        breakdown['Fecha antigua'] = 3;
      }
    } catch {
      // fecha no parseable
    }
  }

  // 5. Legibilidad (OCR confidence)
  const ocrConf = extracted.ocr_confidence ?? 0;
  if (ocrConf >= 0.85) breakdown['Imagen legible'] = 10;
  else if (ocrConf >= 0.6) breakdown['Imagen parcialmente legible'] = 5;
  else breakdown['Imagen ilegible'] = 0;

  // 6. Método de pago correcto
  if (extracted.payment_method) {
    const method = extracted.payment_method.toLowerCase();
    const isTransfer = options.paymentMethod === 'transfer';
    if (
      (isTransfer && (method.includes('nequi') || method.includes('bancolombia') || method.includes('daviplata') || method.includes('transfer')))
    ) {
      breakdown['Método correcto'] = 10;
    }
  }

  // 7. Destinatario reconocido
  if (extracted.recipient) {
    const rec = extracted.recipient.toLowerCase();
    if (
      (options.nequiNumber && rec.includes(options.nequiNumber.replace(/\s/g, '').slice(-4))) ||
      (options.bancolombiaNumber && rec.includes(options.bancolombiaNumber.replace(/[\s\-]/g, '').slice(-4)))
    ) {
      breakdown['Destinatario reconocido'] = 5;
    }
  }

  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((s, v) => s + v, 0)));
  return { score, breakdown };
}

// ─── Deduplicación ────────────────────────────────────────────────────────────

/**
 * Genera un hash MD5 de la URL de la imagen (proxy para hash de contenido).
 * En producción con Vision API se usaría el hash del binario real.
 */
function generateImageHash(imageUrl: string): string {
  return crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 32);
}

/**
 * Verifica si este comprobante (por hash de imagen o transaction_id) ya fue usado.
 */
async function isReusedProof(
  imageHash: string,
  transactionId: string | null
): Promise<boolean> {
  try {
    // Verificar hash de imagen
    const { data: byHash } = await supabase
      .from('payment_proofs')
      .select('id, order_id')
      .eq('image_hash', imageHash)
      .limit(1);

    if (byHash && byHash.length > 0) return true;

    // Verificar transaction_id si existe
    if (transactionId && transactionId.length >= 4) {
      const { data: byRef } = await supabase
        .from('payment_proofs')
        .select('id, order_id')
        .eq('transaction_id', transactionId)
        .limit(1);

      if (byRef && byRef.length > 0) return true;
    }
  } catch {
    // Tabla puede no existir todavía — tratar como no duplicado
  }

  return false;
}

/**
 * Guarda el registro del comprobante en la tabla payment_proofs.
 */
async function saveProofRecord(
  orderId: string | undefined,
  imageHash: string,
  transactionId: string | null,
  status: PaymentStatus,
  score: number,
  imageUrl: string
): Promise<void> {
  if (!orderId) return;

  try {
    await supabase.from('payment_proofs').upsert(
      {
        order_id: orderId,
        image_hash: imageHash,
        transaction_id: transactionId,
        status,
        score,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'order_id' }
    );
  } catch {
    // No crítico — log silencioso
    console.warn('[PaymentProofValidator] Could not save proof record');
  }
}

// ─── OCR / Vision (Fallback) ──────────────────────────────────────────────────

/**
 * Intenta extraer datos del comprobante con Google Vision / Gemini.
 * Si no hay API key configurada, retorna null (modo fallback).
 */
async function extractWithVision(imageUrl: string): Promise<ExtractedPaymentData | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null; // Modo fallback — sin Vision API

  try {
    const prompt = `Analiza esta imagen de comprobante de pago bancario o transferencia electrónica de Colombia.
Extrae ÚNICAMENTE la información que puedas leer con certeza. Si no puedes leer un campo claramente, devuelve null para ese campo.
NUNCA inventes datos.

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "amount": <número entero en pesos colombianos o null>,
  "currency": <"COP" o null>,
  "payment_method": <"Nequi" | "Bancolombia" | "Daviplata" | "PSE" | "Efecty" | null>,
  "transaction_id": <referencia alfanumérica o null>,
  "date": <"YYYY-MM-DD" o null>,
  "time": <"HH:MM" o null>,
  "recipient": <nombre o número del destinatario o null>,
  "transaction_status": <"approved" | "rejected" | "pending" | "unknown">,
  "ocr_confidence": <número entre 0 y 1 indicando claridad de la imagen>
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: await fetchImageAsBase64(imageUrl),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      }
    );

    if (!response.ok) return null;

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extraer JSON de la respuesta
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedPaymentData;
    return parsed;
  } catch (err) {
    console.warn('[PaymentProofValidator] Vision API error:', err);
    return null;
  }
}

async function fetchImageAsBase64(url: string): Promise<string> {
  if (url.startsWith('data:image')) {
    const parts = url.split(',');
    return parts[1] || '';
  }
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// ─── Función Principal ────────────────────────────────────────────────────────

/**
 * Valida un comprobante de pago.
 *
 * Flujo:
 * 1. Generar hash de imagen
 * 2. Verificar si ya fue usado (deduplicación)
 * 3. Intentar OCR con Vision API (o fallback)
 * 4. Calcular score antifraude
 * 5. Determinar estado final
 * 6. Guardar registro de auditoría
 * 7. Retornar resultado con mensaje al usuario
 */
export async function validatePaymentProof(
  options: ValidateProofOptions
): Promise<ProofValidationResult> {
  const { imageUrl, expectedAmountCop, paymentMethod, orderId } = options;

  // ── Paso 1: Hash de imagen ────────────────────────────────────────────────
  const imageHash = generateImageHash(imageUrl);

  // ── Paso 2: Deduplicación ─────────────────────────────────────────────────
  const isReused = await isReusedProof(imageHash, null);

  if (isReused) {
    const result: ProofValidationResult = {
      status: 'REJECTED',
      score: 0,
      extracted: null,
      reason: 'PAYMENT_REUSED: Image hash already exists in payment_proofs',
      image_hash: imageHash,
      is_reused: true,
      user_message: [
        `⚠️ *Comprobante ya registrado*`,
        ``,
        `Este comprobante ya fue utilizado en un pedido anterior.`,
        `Por favor, envía el comprobante correspondiente a *este* pedido.`,
        ``,
        `Si crees que es un error, contacta al encargado.`,
      ].join('\n'),
    };

    await saveProofRecord(orderId, imageHash, null, 'REJECTED', 0, imageUrl);
    return result;
  }

  // ── Paso 3: OCR / Vision ──────────────────────────────────────────────────
  const extracted = await extractWithVision(imageUrl);

  // ── Paso 4: Score ─────────────────────────────────────────────────────────
  let score = 0;
  let status: PaymentStatus;
  let reason: string;

  if (!extracted) {
    // Modo fallback (sin Vision API o error)
    status = 'MANUAL_REVIEW';
    score = 50;
    reason = 'No Vision API configured — fallback to manual review';
  } else {
    // Verificar deduplicación por transaction_id ahora que lo tenemos
    if (extracted.transaction_id) {
      const isReusedById = await isReusedProof('__skip_hash__', extracted.transaction_id);
      if (isReusedById) {
        const result: ProofValidationResult = {
          status: 'REJECTED',
          score: 0,
          extracted,
          reason: `PAYMENT_REUSED: transaction_id ${extracted.transaction_id} already exists`,
          image_hash: imageHash,
          is_reused: true,
          user_message: [
            `⚠️ *Transacción ya registrada*`,
            ``,
            `La referencia *${extracted.transaction_id}* ya fue usada en otro pedido.`,
            `Cada pedido requiere un comprobante diferente.`,
            ``,
            `Si crees que es un error, contáctanos.`,
          ].join('\n'),
        };
        await saveProofRecord(orderId, imageHash, extracted.transaction_id, 'REJECTED', 0, imageUrl);
        return result;
      }
    }

    // Verificar estado rechazado explícito
    if (extracted.transaction_status === 'rejected') {
      status = 'REJECTED';
      score = 0;
      reason = 'Transaction status is REJECTED in the proof';
    } else {
      const { score: calculatedScore } = calculateScore(extracted, options);
      score = calculatedScore;

      if (score >= 90) {
        status = 'AI_VERIFIED';
        reason = `High confidence score: ${score}/100`;
      } else if (score >= 70) {
        status = 'MANUAL_REVIEW';
        reason = `Medium confidence score: ${score}/100 — requires manual review`;
      } else {
        status = 'REJECTED';
        reason = `Low confidence score: ${score}/100`;
      }
    }
  }

  // ── Paso 5: Guardar auditoría ─────────────────────────────────────────────
  await saveProofRecord(orderId, imageHash, extracted?.transaction_id ?? null, status, score, imageUrl);

  // ── Paso 6: Mensaje al usuario ────────────────────────────────────────────
  const userMessage = buildUserMessage(status, score, extracted, expectedAmountCop);

  return {
    status,
    score,
    extracted,
    reason,
    image_hash: imageHash,
    is_reused: false,
    user_message: userMessage,
  };
}

// ─── Mensajes al Usuario ──────────────────────────────────────────────────────

function buildUserMessage(
  status: PaymentStatus,
  score: number,
  extracted: ExtractedPaymentData | null,
  expectedAmount: number
): string {
  const fmtAmount = (n: number) => `$${n.toLocaleString('es-CO')}`;

  switch (status) {
    case 'AI_VERIFIED':
    case 'MANUAL_REVIEW':
      return [
        `📸 *¡Comprobante recibido con éxito!*`,
        ``,
        extracted?.transaction_id ? `🔖 Referencia detectada: \`${extracted.transaction_id}\`` : '',
        `📋 Tu comprobante ha sido enviado al restaurante para su validación.`,
        `🍳 En cuanto el encargado apruebe el pago, tu pedido pasará a cocina inmediatamente.`,
        ``,
        `⏳ *Estado:* Pendiente de confirmación.`,
      ].filter(Boolean).join('\n');

    case 'REJECTED':
      return [
        `❌ *Comprobante no válido*`,
        ``,
        extracted?.transaction_status === 'rejected'
          ? `El comprobante muestra una transacción *RECHAZADA* o *CANCELADA*.`
          : `No pudimos verificar el comprobante enviado.`,
        ``,
        `Asegúrate de enviar:`,
        `• Una captura clara del comprobante *APROBADO*`,
        `• Monto correcto: *${fmtAmount(expectedAmount)}*`,
        `• Comprobante de *este* pedido, no de uno anterior`,
        ``,
        `📸 Envía nuevamente el comprobante o contacta al encargado:`,
      ].join('\n');

    default:
      return `📋 Comprobante recibido. El encargado lo validará pronto.`;
  }
}
