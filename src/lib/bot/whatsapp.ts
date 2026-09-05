/**
 * WhatsApp message sender via YCloud REST API.
 * Mirror of the Telegram sendReply() function but for WhatsApp/YCloud.
 *
 * Docs: https://docs.ycloud.com/reference/whatsapp_message_send
 */

import { createClient } from '@supabase/supabase-js';

const YCLOUD_BASE = 'https://api.ycloud.com/v2';

const getSupabaseClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// Cache tenant credentials: tenantId → { apiKey, phone, webhookSecret }
const tenantCredCache = new Map<string, { apiKey: string; phone: string | null; webhookSecret: string | null; at: number }>();
const CACHE_TTL = 60_000;

export async function getTenantCreds(tenantId: string) {
  const cached = tenantCredCache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const supabase = getSupabaseClient();

  // 1. Try exact tenant query
  const { data } = await supabase
    .from('tenant_settings')
    .select('ycloud_api_key, ycloud_phone_number, ycloud_webhook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (data?.ycloud_api_key) {
    const entry = {
      apiKey: data.ycloud_api_key,
      phone: data.ycloud_phone_number || null,
      webhookSecret: data.ycloud_webhook_secret || null,
      at: Date.now(),
    };
    tenantCredCache.set(tenantId, entry);
    return entry;
  }

  // 2. Fallback: Query first configured tenant with non-null ycloud_api_key
  const { data: fallback } = await supabase
    .from('tenant_settings')
    .select('ycloud_api_key, ycloud_phone_number, ycloud_webhook_secret')
    .not('ycloud_api_key', 'is', null)
    .limit(1)
    .maybeSingle();

  if (fallback?.ycloud_api_key) {
    const entry = {
      apiKey: fallback.ycloud_api_key,
      phone: fallback.ycloud_phone_number || null,
      webhookSecret: fallback.ycloud_webhook_secret || null,
      at: Date.now(),
    };
    tenantCredCache.set(tenantId, entry);
    return entry;
  }

  console.warn('[bot/whatsapp] No YCloud API Key found in DB for tenant:', tenantId);
  return null;
}

export interface WhatsAppButton {
  text: string;
  callback_data: string; // stored as button payload (max 200 chars)
}

/**
 * Detects whether the identifier is a WhatsApp Business-Scoped User ID (BSUID) or username-based ID
 * rather than a traditional phone number.
 * Format: 2-letter ISO country code, dot, then alphanumeric string (e.g. CO.1101892408959093, US.13491208655302741918).
 */
export function isBSUID(val?: string): boolean {
  if (!val) return false;
  const clean = val.replace(/^whatsapp:/i, '').trim();
  if (/^[A-Za-z]{2}\.[0-9A-Za-z_-]+$/.test(clean)) return true;
  if (/[a-zA-Z]/.test(clean)) return true;
  return false;
}

export function getCleanRecipient(val?: string): string {
  if (!val) return '';
  return val.replace(/^whatsapp:/i, '').trim();
}

/**
 * Normalizes phone numbers to international E.164 format (+[country_code][number]).
 * Automatically formats Colombian 10-digit mobile numbers (starting with 3) as +57XXXXXXXXXX.
 */
export function formatE164(phone?: string): string | undefined {
  if (!phone) return undefined;
  // If it's a BSUID (e.g. CO.1101892408959093), do not format as phone number
  if (isBSUID(phone)) return undefined;

  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;
  // If 10 digits starting with 3 (e.g. Colombian mobile 3116215266), prepend +57
  if (digits.length === 10 && digits.startsWith('3')) {
    return `+57${digits}`;
  }
  // If 12 digits starting with 57 (Colombia with country code but no +)
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

/**
 * Sends a plain text message (or with up to 3 quick-reply buttons) via YCloud.
 */
export async function sendWhatsAppMessage({
  from,
  to,
  text,
  buttons,
  apiKey,
}: {
  from?: string;        // Sender phone number in E.164 (e.g. +573116215266)
  to: string;           // Recipient phone number in E.164 OR Meta BSUID (e.g. CO.1101892408959093)
  text: string;
  buttons?: WhatsAppButton[];  // Max 3 for WhatsApp interactive buttons
  apiKey: string;
}): Promise<boolean> {
  if (!apiKey || !to) {
    console.warn('[ycloud] Missing apiKey or recipient identifier — message not sent', { apiKey: !!apiKey, to });
    return false;
  }

  const cleanFrom = formatE164(from);
  const isBsuid = isBSUID(to);
  // YCloud API: BSUID must be sent under `recipient`, standard phone under `to`
  const recipientTarget = isBsuid
    ? { recipient: getCleanRecipient(to) }
    : { to: formatE164(to) || to.trim() };

  // Strip Markdown formatting that Telegram uses but WhatsApp doesn't support
  const cleanText = text
    .replace(/\*([^*]+)\*/g, '*$1*')  // bold stays as-is in WA
    .replace(/_([^_]+)_/g, '_$1_')   // italic stays
    .replace(/`([^`]+)`/g, '$1');     // remove code blocks

  let body: Record<string, unknown>;

  if (buttons && buttons.length > 0) {
    // Interactive message with quick-reply buttons (max 3)
    const waBtns = buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: {
        id: (b.callback_data || '').slice(0, 256),
        title: (b.text || '').slice(0, 20), // WhatsApp button title max 20 chars
      },
    }));

    body = {
      ...(cleanFrom ? { from: cleanFrom } : {}),
      ...recipientTarget,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cleanText },
        action: { buttons: waBtns },
      },
    };
  } else {
    // Plain text message
    body = {
      ...(cleanFrom ? { from: cleanFrom } : {}),
      ...recipientTarget,
      type: 'text',
      text: { body: cleanText },
    };
  }

  try {
    let res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    // If sending with 'from' failed (e.g. sender mismatch or invalid phone format),
    // retry without 'from' so YCloud automatically routes through the account's registered number
    if (!res.ok && cleanFrom) {
      const resErr = await res.text().catch(() => '');
      console.warn('[ycloud] Message send failed with from, retrying without from...', res.status, resErr);
      const bodyNoFrom = { ...body };
      delete (bodyNoFrom as any).from;
      res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(bodyNoFrom),
      });
    }

    if (!res.ok) {
      const resText = await res.text().catch(() => '');
      console.error('[ycloud] Failed to send message:', res.status, resText);
      // Fallback: if interactive message failed, retry as plain text without buttons and without 'from'
      if (buttons && buttons.length > 0) {
        console.log('[ycloud] Retrying as plain text without buttons...');
        return await sendWhatsAppMessage({ to, text, apiKey });
      }
      return false;
    }

    return true;
  } catch (err) {
    console.error('[ycloud] Network error sending message:', (err as Error).message);
    return false;
  }
}

/**
 * Sends a document file (e.g. PDF Menu) via YCloud WhatsApp REST API.
 */
export async function sendWhatsAppDocument({
  from,
  to,
  documentUrl,
  filename = 'Carta_Menu.pdf',
  caption,
  apiKey,
}: {
  from?: string;
  to: string;
  documentUrl: string;
  filename?: string;
  caption?: string;
  apiKey: string;
}): Promise<boolean> {
  if (!apiKey || !to || !documentUrl) {
    console.warn('[ycloud] Missing apiKey, recipient identifier, or documentUrl', { hasKey: !!apiKey, to, documentUrl });
    return false;
  }

  const cleanFrom = formatE164(from);
  const isBsuid = isBSUID(to);
  // YCloud API: BSUID must be sent under `recipient`, standard phone under `to`
  const recipientTarget = isBsuid
    ? { recipient: getCleanRecipient(to) }
    : { to: formatE164(to) || to.trim() };

  const buildBody = (includeFrom: boolean) => ({
    ...(includeFrom && cleanFrom ? { from: cleanFrom } : {}),
    ...recipientTarget,
    type: 'document',
    document: {
      link: documentUrl,
      filename: filename || 'Carta_Menu.pdf',
      ...(caption ? { caption } : {}),
    },
  });

  try {
    let res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(buildBody(true)),
    });

    // If failed and 'from' was passed, retry WITHOUT 'from' so YCloud routes through account's default number
    if (!res.ok && cleanFrom) {
      const resErr = await res.text().catch(() => '');
      console.warn('[ycloud] Document send failed with from, retrying without from...', res.status, resErr);
      res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(buildBody(false)),
      });
    }

    if (!res.ok) {
      const resText = await res.text().catch(() => '');
      console.error('[ycloud] Failed to send document:', res.status, resText);
      return false;
    }

    console.log('[ycloud] Document sent successfully to', isBsuid ? recipientTarget.recipient : recipientTarget.to);
    return true;
  } catch (err) {
    console.error('[ycloud] Network error sending document:', (err as Error).message);
    return false;
  }
}

/**
 * Verifies the YCloud webhook signature.
 * YCloud header format: YCloud-Signature: t=<timestamp>,s=<signature>
 * Signed payload format: <timestamp>.<raw_body>
 */
export async function verifyYCloudSignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!secret) return true; // If no secret configured, skip verification
  if (!signatureHeader) return false;

  try {
    const encoder = new TextEncoder();
    let timestamp = '';
    let targetSig = '';

    // Check if header follows YCloud format: t=...,s=...
    if (signatureHeader.includes('t=') && signatureHeader.includes('s=')) {
      const parts = signatureHeader.split(',');
      for (const part of parts) {
        const [k, v] = part.trim().split('=');
        if (k === 't') timestamp = v;
        if (k === 's') targetSig = v;
      }
    } else {
      // Fallback if header is plain hex or prefixed with sha256=
      targetSig = signatureHeader.replace('sha256=', '').trim();
    }

    const payloadToSign = timestamp ? `${timestamp}.${body}` : body;

    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(payloadToSign);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const sigHex = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return sigHex.toLowerCase() === targetSig.toLowerCase();
  } catch {
    return false;
  }
}
