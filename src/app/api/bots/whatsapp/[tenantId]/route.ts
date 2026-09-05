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
import { sendWhatsAppMessage, sendWhatsAppDocument, verifyYCloudSignature, isBSUID, getTenantCreds } from '@/lib/bot/whatsapp';
import { sanitizeUsername } from '@/lib/bot/guards/MessageGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache active option buttons per chat for number-based selection (1, 2, 3...)
const lastChatButtons = new Map<string, Array<{ text: string; callback_data: string }>>();

function cleanWAButtonTitle(text: string): string {
  let cleaned = (text || '').trim();
  if (cleaned.length <= 20) return cleaned;

  // Remove price or quantity suffix if title is too long (e.g. " (+2 disp.)" or " (+$3.000)")
  cleaned = cleaned.replace(/\s*\(\+?\$?[\d.,]+\s*disp\.?\)/gi, '').replace(/\s*\(\+?\$?[\d.,]+\)/gi, '');
  if (cleaned.length <= 20) return cleaned;

  // Clean trailing punctuation or parentheses
  cleaned = cleaned.replace(/[(\[\\/:\-–—]+$/, '').trim();
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
  return result.trim().replace(/[(\[\\/:\-–—]+$/, '').trim() || cleaned.slice(0, 20);
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

  // Check if options are catalog list items (categories, products, additions)
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

    lastChatButtons.set(chatIdStr, itemButtons);

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣'];
    const listLines = itemButtons.map((b, idx) => {
      const emoji = numberEmojis[idx] || `*${idx + 1}.*`;
      return `${emoji} ${b.text}`;
    });

    formattedText = `${rawText}\n\n📋 *Selecciona una opción:*\n${listLines.join('\n')}\n\n_👉 Responde con el número de tu opción (ej: 1 o varios: 1, 2)._`;

    // Action buttons (Ver todo el menú, Ver Carrito, Omitir, Cancelar, Volver) are shown as WhatsApp quick buttons
    if (actionButtons.length > 0) {
      buttons = actionButtons.slice(0, 3).map(b => ({
        text: cleanWAButtonTitle(b.text),
        callback_data: b.callback_data,
      }));
    } else {
      buttons = undefined;
    }
  } else {
    // Non-list screen (Welcome, Cart without items, Payment Methods, Cash, etc.)
    lastChatButtons.set(chatIdStr, flatButtons);
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

  const recipientTo: string = message.from || message.whatsapp?.from || message.fromUserId || message.author || '';
  if (!recipientTo) return NextResponse.json({ ok: true });

  const senderFrom: string | undefined = message.to || creds.phone || undefined;

  // YCloud uses E.164 numbers or user IDs (BSUIDs) as chat IDs — convert to number for session key
  // We prefix with 'wa_' to avoid collision with Telegram IDs
  const isBsuidUser = isBSUID(recipientTo);
  const chatIdStr = isBsuidUser
    ? `wa_${recipientTo.replace(/[^a-zA-Z0-9]/g, '_')}`
    : `wa_${recipientTo.replace(/\D/g, '') || recipientTo}`;

  let chatId = isBsuidUser
    ? Math.abs(recipientTo.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0))
    : parseInt(recipientTo.replace(/\D/g, ''), 10);

  if (isNaN(chatId) || chatId === 0 || chatId > Number.MAX_SAFE_INTEGER) {
    chatId = Math.abs(recipientTo.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0));
  }
  const rawName = message.customerProfile?.name || message.customerProfile?.username || message.customerName || message.from || message.fromUserId || 'Cliente WhatsApp';
  const username = sanitizeUsername(rawName);
  const waExtra = { platform: 'whatsapp' as const, whatsappRecipient: recipientTo, whatsappFrom: senderFrom };

  const msgType = message.type as string;
  let text = '';
  let isPhoto = false;
  let photoId: string | undefined;
  let location: { latitude: number; longitude: number } | undefined;

  if (msgType === 'text') {
    text = message.text?.body || '';
    const trimmed = text.trim();
    const cachedBtns = lastChatButtons.get(chatIdStr);

    // Direct keyword check for PDF menu
    const cleanLower = trimmed.toLowerCase();
    if (['carta', 'pdf', 'la carta', 'ver carta', 'ver pdf', 'menu pdf', 'carta pdf', 'descargar carta'].includes(cleanLower)) {
      try {
        const response = await processCallback(chatId, 'view_pdf_menu', username, tenantId, undefined, waExtra);
        if (response.document_url) {
          await sendWhatsAppDocument({
            from: senderFrom,
            to: recipientTo,
            documentUrl: response.document_url,
            filename: response.document_filename || 'Carta_Menu.pdf',
            caption: response.document_caption || '📖 Carta y Menú del Restaurante',
            apiKey: creds.apiKey,
          });
          await new Promise((r) => setTimeout(r, 450));
        }
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
        console.error('[bot/whatsapp] direct carta error:', (err as Error).message);
      }
    }

    // Parse tokens like "1", "1, 2", "1 y 3", "2 4"
    const numTokens = trimmed.split(/[\s,yY+]+/).filter(Boolean);
    const nums = numTokens.map(t => parseInt(t, 10)).filter(n => !isNaN(n));

    // Number shortcut: user typed single or multiple numbers
    if (nums.length > 0 && cachedBtns && nums.every(n => n >= 1 && n <= cachedBtns.length)) {
      if (nums.length === 1) {
        const btn = cachedBtns[nums[0] - 1];
        if (btn?.callback_data) {
          try {
            const response = await processCallback(chatId, btn.callback_data, username, tenantId, undefined, waExtra);
            if (response.document_url) {
              await sendWhatsAppDocument({
                from: senderFrom,
                to: recipientTo,
                documentUrl: response.document_url,
                filename: response.document_filename || 'Carta_Menu.pdf',
                caption: response.document_caption || '📖 Carta y Menú del Restaurante',
                apiKey: creds.apiKey,
              });
              await new Promise((r) => setTimeout(r, 450));
            }
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
      } else {
        // Multi-select dishes (e.g. "1, 2" or "1 y 3")
        try {
          const addedNames: string[] = [];
          for (const n of nums) {
            const btn = cachedBtns[n - 1];
            if (btn && btn.callback_data.startsWith('product:')) {
              const prodId = btn.callback_data.replace('product:', '');
              await processCallback(chatId, btn.callback_data, username, tenantId, undefined, waExtra);
              await processCallback(chatId, `qty:1:${prodId}`, username, tenantId, undefined, waExtra);
              await processCallback(chatId, `skip_note:1:${prodId}`, username, tenantId, undefined, waExtra);
              addedNames.push(btn.text);
            }
          }
          if (addedNames.length > 0) {
            const cartRes = await processCallback(chatId, 'cart', username, tenantId, undefined, waExtra);
            const multiMsg = `✅ *¡${addedNames.length} productos agregados al carrito!*\n${addedNames.map(i => `• 1x ${i}`).join('\n')}\n\n${cartRes.text}`;
            const formatted = formatWhatsAppResponse(chatIdStr, multiMsg, cartRes.reply_markup);
            await sendWhatsAppMessage({
              from: senderFrom,
              to: recipientTo,
              text: formatted.text,
              buttons: formatted.buttons,
              apiKey: creds.apiKey,
            });
            return NextResponse.json({ ok: true });
          }
        } catch (multiErr) {
          console.error('[bot/whatsapp] multi-select error:', (multiErr as Error).message);
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
        const response = await processCallback(chatId, btnId, username, tenantId, undefined, waExtra);
        if (response.document_url) {
          await sendWhatsAppDocument({
            from: senderFrom,
            to: recipientTo,
            documentUrl: response.document_url,
            filename: response.document_filename || 'Carta_Menu.pdf',
            caption: response.document_caption || '📖 Carta y Menú del Restaurante',
            apiKey: creds.apiKey,
          });
          await new Promise((r) => setTimeout(r, 450));
        }
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
  } else if (msgType === 'location' || (message as any).location || (message as any).whatsapp?.location || (body as any).type?.includes('location')) {
    const loc = (message as any).location || (message as any).whatsapp?.location || (body as any).location;
    const lat = loc?.latitude ?? loc?.lat;
    const lng = loc?.longitude ?? loc?.long ?? loc?.lng;
    if (lat !== undefined && lng !== undefined) {
      location = {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      };
      text = loc.address || loc.name || `Ubicación GPS (${location.latitude}, ${location.longitude})`;
    }
  } else if (msgType === 'image') {
    isPhoto = true;
    const mediaId = message.image?.id;
    const mediaLink = message.image?.link || message.image?.url;
    text = message.image?.caption || '';

    // If YCloud provided a media ID, fetch binary and upload to Supabase Storage receipts bucket
    if (mediaId && creds.apiKey) {
      try {
        const ycloudRes = await fetch(`https://api.ycloud.com/v2/whatsapp/media/${mediaId}`, {
          headers: { 'X-API-Key': creds.apiKey },
        });
        if (ycloudRes.ok) {
          const arrayBuffer = await ycloudRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileName = `whatsapp_${chatId}_${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage.from('receipts').upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });
          if (!upErr) {
            photoId = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
          }
        }
      } catch (e) {
        console.warn('Failed to upload YCloud media to Supabase:', e);
      }
    }
    if (!photoId && mediaLink) {
      photoId = mediaLink;
    }
    if (!photoId && mediaId) {
      photoId = mediaId;
    }
  }

  if (!text && !isPhoto && !location) return NextResponse.json({ ok: true });

  try {
    const response = await processMessage(
      chatId,
      text,
      username,
      tenantId,
      { isPhoto, photoId, location, ...waExtra }
    );

    if (response.document_url) {
      await sendWhatsAppDocument({
        from: senderFrom,
        to: recipientTo,
        documentUrl: response.document_url,
        filename: response.document_filename || 'Carta_Menu.pdf',
        caption: response.document_caption || '📖 Carta y Menú del Restaurante',
        apiKey: creds.apiKey,
      });
      await new Promise((r) => setTimeout(r, 450));
    }

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
