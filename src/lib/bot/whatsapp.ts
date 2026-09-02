/**
 * WhatsApp message sender via YCloud REST API.
 * Mirror of the Telegram sendReply() function but for WhatsApp/YCloud.
 *
 * Docs: https://docs.ycloud.com/reference/whatsapp_message_send
 */

const YCLOUD_BASE = 'https://api.ycloud.com/v2';

export interface WhatsAppButton {
  text: string;
  callback_data: string; // stored as button payload (max 200 chars)
}

/**
 * Sends a plain text message (or with up to 3 quick-reply buttons) via YCloud.
 */
export async function sendWhatsAppMessage({
  to,
  text,
  buttons,
  apiKey,
}: {
  to: string;           // Phone number in E.164 format: +573001234567
  text: string;
  buttons?: WhatsAppButton[];  // Max 3 for WhatsApp interactive buttons
  apiKey: string;
}): Promise<void> {
  if (!apiKey || !to) {
    console.warn('[ycloud] Missing apiKey or recipient number — message not sent');
    return;
  }

  // Strip Markdown formatting that Telegram uses but WhatsApp doesn't support
  const cleanText = text
    .replace(/\*([^*]+)\*/g, '*$1*')  // bold stays as-is in WA
    .replace(/_([^_]+)_/g, '_$1_')   // italic stays
    .replace(/`([^`]+)`/g, '$1');     // remove code blocks

  let body: Record<string, unknown>;

  if (buttons && buttons.length > 0) {
    // Interactive message with quick-reply buttons (max 3)
    const waBtns = buttons.slice(0, 3).map((b, i) => ({
      type: 'reply',
      reply: {
        id: b.callback_data.slice(0, 256),
        title: b.text.slice(0, 20), // WhatsApp button title max 20 chars
      },
    }));

    body = {
      from: to, // will be overridden by YCloud with the registered number
      to,
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
      to,
      type: 'text',
      text: { body: cleanText },
    };
  }

  try {
    const res = await fetch(`${YCLOUD_BASE}/whatsapp/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[ycloud] Failed to send message:', res.status, errText);
    }
  } catch (err) {
    console.error('[ycloud] Network error sending message:', (err as Error).message);
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
