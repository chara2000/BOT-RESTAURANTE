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

// Cache tenant credentials: tenantId → { apiKey, phone, webhookSecret }
const tenantCredCache = new Map<string, { apiKey: string; phone: string | null; webhookSecret: string | null; at: number }>();
const CACHE_TTL = 60_000;

async function getTenantCreds(tenantId: string) {
  const cached = tenantCredCache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

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

// Cache active option buttons per chat for number-based selection (1, 2, 3...)
const lastChatButtons = new Map<string, Array<{ text: string; callback_data: string }>>();

function cleanWAButtonTitle(text: string): string {
  let cleaned = (text || '').trim();
  if (cleaned.length <= 20) return cleaned;

  // Remove price or quantity suffix if title is too long (e.g. " (+2 disp.)" or " (+$3.000)")
  cleaned = cleaned.replace(/\s*\(\+?\$?[\d.,]+\s*disp\.?\)/gi, '').replace(/\s*\(\+?\$?[\d.,]+\)/gi, '');
  if (cleaned.length <= 20) return cleaned;

  // Smart truncation at word boundary
  const words = cleaned.split(' ');
  let result = '';
  for (const word of words) {
    if ((result + ' ' + word).trim().length <= 20) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }
  return result.trim() || cleaned.slice(0, 20);
}

function formatWhatsAppResponse(
  chatIdStr: string,
  rawText: string,
  replyMarkup: any
): { text: string; buttons?: Array<{ text: string; callback_data: string }> } {
  if (!replyMarkup || !replyMarkup.inline_keyboard) {
    lastChatButtons.delete(chatIdStr);
    return { text: rawText };
  }

  const rows: any[][] = replyMarkup.inline_keyboard || [];
  const flatButtons: Array<{ text: string; callback_data: string }> = rows
    .flat()
    .filter(b => b.callback_data)
    .map(b => ({ text: (b.text || '').trim(), callback_data: b.callback_data }));

  if (flatButtons.length === 0) {
    lastChatButtons.delete(chatIdStr);
    return { text: rawText };
  }

  lastChatButtons.set(chatIdStr, flatButtons);

  let formattedText = rawText;
  let buttons: Array<{ text: string; callback_data: string }> | undefined;

  const isQuantityPrompt = flatButtons.some(b => b.callback_data.startsWith('qty:'));

  if (isQuantityPrompt) {
    // For quantity selection: don't list numbers 1..6 in text; give a clean prompt & simple buttons
    formattedText = rawText + `\n\n_👉 Escribe la cantidad deseada (ej: 1, 2, 3...) o toca un botón:_`;
    buttons = [
      { text: '1️⃣ 1 unidad', callback_data: flatButtons[0]?.callback_data || 'qty:1' },
      { text: '2️⃣ 2 unidades', callback_data: flatButtons[1]?.callback_data || 'qty:2' },
      { text: '↩️ Volver al Menú', callback_data: 'menu' },
    ];
    return { text: formattedText, buttons };
  }

  // Check if options are list items (categories, products, additions)
  const isListOptions = flatButtons.some(b => 
    b.callback_data.startsWith('cat:') || 
    b.callback_data.startsWith('product:') || 
    b.callback_data.startsWith('add_ad:') ||
    b.callback_data.startsWith('add_addition:')
  );

  if (isListOptions) {
    // Only list item options in the numbered text
    const itemButtons = flatButtons.filter(b => 
      b.callback_data.startsWith('cat:') || 
      b.callback_data.startsWith('product:') || 
      b.callback_data.startsWith('add_ad:') ||
      b.callback_data.startsWith('add_addition:')
    );

    const actionButtons = flatButtons.filter(b => !itemButtons.includes(b));

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const listLines = itemButtons.map((b, idx) => {
      const emoji = numberEmojis[idx] || `*${idx + 1}.*`;
      return `${emoji} ${b.text}`;
    });

    formattedText = `${rawText}\n\n📋 *Selecciona una opción:*\n${listLines.join('\n')}\n\n_👉 Responde enviando solo el número (1 - ${itemButtons.length})._`;

    // Only action buttons (Omitir, Cancelar, Volver, Carrito) are shown as WhatsApp quick buttons
    if (actionButtons.length > 0) {
      buttons = actionButtons.slice(0, 3).map(b => ({
        text: cleanWAButtonTitle(b.text),
        callback_data: b.callback_data,
      }));
    } else {
      buttons = undefined;
    }
  } else {
    // Non-list screen (Cart, Ask Note, Confirm Order, Payment Methods, etc.)
    // Show up to 3 clean action buttons directly
    buttons = flatButtons.slice(0, 3).map(b => ({
      text: cleanWAButtonTitle(b.text),
      callback_data: b.callback_data,
    }));
  }

  return { text: formattedText, buttons };
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
    const signature =
      req.headers.get('ycloud-signature') ||
      req.headers.get('x-ycloud-signature-256') ||
      req.headers.get('x-ycloud-signature') ||
      '';
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

  // YCloud payload structure: body.type = 'whatsapp.inbound_message.received' or 'whatsapp.message.received'
  const type = body.type as string;
  if (!type?.includes('message')) {
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message =
    (body as any).whatsappInboundMessage ||
    (body as any).message ||
    (body as any).data?.message ||
    (body as any).whatsappMessage;

  if (!message) return NextResponse.json({ ok: true });

  const recipientTo: string = message.from || message.whatsapp?.from || '';
  if (!recipientTo) return NextResponse.json({ ok: true });

  const senderFrom: string | undefined = message.to || creds.phone || undefined;

  // YCloud uses E.164 numbers as chat IDs — convert to number for session key
  // We prefix with 'wa_' to avoid collision with Telegram IDs
  const chatIdStr = `wa_${recipientTo.replace(/\D/g, '')}`;
  const chatId = parseInt(chatIdStr.replace('wa_', ''), 10);
  const rawName = message.customerProfile?.name || message.customerName || message.from || 'Cliente WhatsApp';
  const username = sanitizeUsername(rawName);

  const msgType = message.type as string;
  let text = '';
  let isPhoto = false;
  let photoId: string | undefined;
  let location: { latitude: number; longitude: number } | undefined;

  if (msgType === 'text') {
    text = message.text?.body || '';
    const trimmed = text.trim();
    const num = parseInt(trimmed, 10);
    const cachedBtns = lastChatButtons.get(chatIdStr);

    // Number shortcut: user typed "1", "2", "3", etc. corresponding to active options
    if (!isNaN(num) && cachedBtns && num >= 1 && num <= cachedBtns.length && /^\d+$/.test(trimmed)) {
      const btn = cachedBtns[num - 1];
      if (btn?.callback_data) {
        try {
          const response = await processCallback(chatId, btn.callback_data, username, tenantId);
          if (response.text) {
            const formatted = formatWhatsAppResponse(chatIdStr, response.text, response.reply_markup);
            await sendWhatsAppMessage({
              from: senderFrom,
              to: recipientTo,
              text: formatted.text,
              buttons: formatted.buttons,
              apiKey: creds.apiKey,
            });
          }
          return NextResponse.json({ ok: true });
        } catch (err) {
          console.error('[bot/whatsapp] number shortcut callback error:', (err as Error).message);
        }
      }
    }
  } else if (msgType === 'interactive') {
    // Button reply from our interactive message
    const btnReply = message.interactive?.buttonReply || message.interactive?.button_reply || message.button;
    const btnId = btnReply?.id || btnReply?.payload;
    if (btnId) {
      // Treat as a callback
      try {
        const response = await processCallback(chatId, btnId, username, tenantId);
        if (response.text) {
          const formatted = formatWhatsAppResponse(chatIdStr, response.text, response.reply_markup);
          await sendWhatsAppMessage({
            from: senderFrom,
            to: recipientTo,
            text: formatted.text,
            buttons: formatted.buttons,
            apiKey: creds.apiKey,
          });
        }
      } catch (err) {
        console.error('[bot/whatsapp] processCallback error:', (err as Error).message);
      }
      return NextResponse.json({ ok: true });
    }
  } else if (msgType === 'location') {
    const loc = (message as any).location || (message as any).whatsapp?.location;
    if (loc && loc.latitude && loc.longitude) {
      location = {
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
      };
      text = loc.address || loc.name || `Ubicación GPS (${location.latitude}, ${location.longitude})`;
    }
  } else if (msgType === 'image') {
    isPhoto = true;
    photoId = message.image?.id || message.image?.link || message.image?.url;
    text = message.image?.caption || '';
  }

  if (!text && !isPhoto && !location) return NextResponse.json({ ok: true });

  try {
    const response = await processMessage(
      chatId,
      text,
      username,
      tenantId,
      { isPhoto, photoId, location }
    );

    if (response.text) {
      const formatted = formatWhatsAppResponse(chatIdStr, response.text, response.reply_markup);
      await sendWhatsAppMessage({
        from: senderFrom,
        to: recipientTo,
        text: formatted.text,
        buttons: formatted.buttons,
        apiKey: creds.apiKey,
      });
    }
  } catch (err) {
    console.error('[bot/whatsapp] processMessage error:', (err as Error).message);
    await sendWhatsAppMessage({
      from: senderFrom,
      to: recipientTo,
      text: '⚠️ Ocurrió un error. Escribe *hola* para reiniciar.',
      apiKey: creds.apiKey,
    });
  }

  return NextResponse.json({ ok: true });
}
