/**
 * Dynamic WhatsApp/YCloud webhook route — one URL per tenant.
 * URL: /api/bots/whatsapp/[tenantId]
 *
 * Configure this URL in YCloud's dashboard as the webhook endpoint.
 * Format: https://your-app.vercel.app/api/bots/whatsapp/<tenant_id>
 *
 * Supports:
 * - Text messages → processMessage
 * - Button reply callbacks → processCallback
 * - Image messages → handlePaymentReceipt flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processMessage, processCallback } from '@/lib/bot/agent';
import { sendWhatsAppMessage, verifyYCloudSignature } from '@/lib/bot/whatsapp';
import { sanitizeUsername } from '@/lib/bot/guards/MessageGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache tenant credentials: tenantId → { apiKey, webhookSecret }
const tenantCredCache = new Map<string, { apiKey: string; webhookSecret: string | null; at: number }>();
const CACHE_TTL = 60_000;

async function getTenantCreds(tenantId: string) {
  const cached = tenantCredCache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const { data } = await supabase
    .from('tenant_settings')
    .select('ycloud_api_key, ycloud_webhook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data?.ycloud_api_key) return null;

  const entry = {
    apiKey: data.ycloud_api_key,
    webhookSecret: data.ycloud_webhook_secret || null,
    at: Date.now(),
  };
  tenantCredCache.set(tenantId, entry);
  return entry;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  // YCloud webhook verification — returns challenge token
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('challenge');
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  const creds = await getTenantCreds(tenantId);
  if (!creds) {
    console.warn('[bot/whatsapp] No YCloud credentials for tenant:', tenantId);
    return NextResponse.json({ ok: true }); // Always 200 to avoid YCloud retries
  }

  const rawBody = await req.text();

  // Verify YCloud signature if secret is configured
  if (creds.webhookSecret) {
    const signature = req.headers.get('x-ycloud-signature-256') || '';
    const valid = await verifyYCloudSignature(rawBody, signature, creds.webhookSecret);
    if (!valid) {
      console.warn('[bot/whatsapp] Invalid signature for tenant:', tenantId);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // YCloud payload structure: body.type = 'whatsapp.message.received'
  const type = body.type as string;
  if (!type?.startsWith('whatsapp.message')) {
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = (body as any).message || (body as any).data?.message;
  if (!message) return NextResponse.json({ ok: true });

  const from: string = message.from || message.whatsapp?.from || '';
  if (!from) return NextResponse.json({ ok: true });

  // YCloud uses E.164 numbers as chat IDs — convert to number for session key
  // We prefix with 'wa_' to avoid collision with Telegram IDs
  const chatIdStr = `wa_${from.replace(/\D/g, '')}`;
  const chatId = parseInt(chatIdStr.replace('wa_', ''), 10);
  const username = sanitizeUsername(message.customerName || message.from || 'Cliente WhatsApp');

  const msgType = message.type as string;
  let text = '';
  let isPhoto = false;
  let photoId: string | undefined;

  if (msgType === 'text') {
    text = message.text?.body || '';
  } else if (msgType === 'interactive') {
    // Button reply from our interactive message
    const btnReply = message.interactive?.button_reply;
    if (btnReply?.id) {
      // Treat as a callback
      try {
        const response = await processCallback(chatId, btnReply.id, username, tenantId);
        if (response.text) {
          await sendWhatsAppMessage({
            to: from,
            text: response.text,
            buttons: response.reply_markup ? extractWAButtons(response.reply_markup) : undefined,
            apiKey: creds.apiKey,
          });
        }
      } catch (err) {
        console.error('[bot/whatsapp] processCallback error:', (err as Error).message);
      }
      return NextResponse.json({ ok: true });
    }
  } else if (msgType === 'image') {
    isPhoto = true;
    photoId = message.image?.id || message.image?.url;
    text = message.image?.caption || '';
  }

  if (!text && !isPhoto) return NextResponse.json({ ok: true });

  try {
    const response = await processMessage(
      chatId,
      text,
      username,
      tenantId,
      { isPhoto, photoId }
    );

    if (response.text) {
      await sendWhatsAppMessage({
        to: from,
        text: response.text,
        buttons: response.reply_markup ? extractWAButtons(response.reply_markup) : undefined,
        apiKey: creds.apiKey,
      });
    }
  } catch (err) {
    console.error('[bot/whatsapp] processMessage error:', (err as Error).message);
    await sendWhatsAppMessage({
      to: from,
      text: '⚠️ Ocurrió un error. Escribe *hola* para reiniciar.',
      apiKey: creds.apiKey,
    });
  }

  return NextResponse.json({ ok: true });
}

// Converts Telegram inline_keyboard to YCloud-compatible button array (max 3)
function extractWAButtons(replyMarkup: any): Array<{ text: string; callback_data: string }> | undefined {
  try {
    const rows: any[][] = replyMarkup.inline_keyboard || [];
    const flat = rows.flat().filter(b => b.callback_data); // Only reply buttons (not URL buttons)
    if (flat.length === 0) return undefined;
    return flat.slice(0, 3).map(b => ({ text: (b.text || '').slice(0, 20), callback_data: b.callback_data }));
  } catch {
    return undefined;
  }
}
