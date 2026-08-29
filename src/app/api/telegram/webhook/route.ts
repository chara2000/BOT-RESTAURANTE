import { NextRequest, NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { processMessage, processCallback } from '@/lib/bot/agent';
import {
  guardMessage,
  guardCallback,
  isProcessedUpdate,
  sanitizeUsername,
} from '@/lib/bot/guards/MessageGuard';

// Telegram global bot token is pinned strictly to ChefFlow restaurant
const CHEFFLOW_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendReply(chatId: number, text: string, reply_markup?: any, imageUrl?: string) {
  try {
    if (imageUrl) {
      await bot.telegram.sendPhoto(chatId, imageUrl, {
        caption: text,
        parse_mode: 'Markdown',
        ...(reply_markup ? { reply_markup } : {}),
      });
    } else {
      await bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...(reply_markup ? { reply_markup } : {}),
      });
    }
  } catch (err) {
    // Fallback sin parse_mode si Markdown falla
    try {
      if (imageUrl) {
        await bot.telegram.sendPhoto(chatId, imageUrl, {
          caption: text,
          ...(reply_markup ? { reply_markup } : {}),
        });
      } else {
        await bot.telegram.sendMessage(chatId, text, {
          ...(reply_markup ? { reply_markup } : {}),
        });
      }
    } catch (e2) {
      console.error('[webhook] sendReply fallback failed:', (e2 as Error).message);
      try {
        // Último recurso: mensaje de texto simple sin markup
        await bot.telegram.sendMessage(chatId, text);
      } catch {
        console.error('[webhook] sendReply ultimate fallback failed');
      }
    }
  }
}

export async function POST(req: NextRequest) {
  // Siempre responder 200 a Telegram inmediatamente
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ── Idempotencia: ignorar update_id ya procesado ───────────────────────────
  const updateId = (body.update_id as number) ?? 0;
  if (updateId && isProcessedUpdate(updateId)) {
    console.warn(`[webhook] Duplicate update_id ${updateId} ignored`);
    return NextResponse.json({ ok: true });
  }

  // ── Manejo de botones inline (callback_query) ──────────────────────────────
  if (body.callback_query) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cq = body.callback_query as any;
    const chatId: number = cq.message?.chat?.id;
    const username: string = sanitizeUsername(
      cq.from?.username || cq.from?.first_name || 'Cliente'
    );
    const data: string = (cq.data || '').slice(0, 200); // limitar longitud del callback data
    const cbId: string = cq.id;

    if (!chatId) return NextResponse.json({ ok: true });

    // Rate limit para callbacks
    const guardResult = guardCallback(chatId);
    if (!guardResult.allowed) {
      await bot.telegram.answerCbQuery(cbId, '⏳ Demasiado rápido. Espera un momento.').catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // Quitar spinner del botón inmediatamente
    await bot.telegram.answerCbQuery(cbId).catch(() => {});

    try {
      const response = await processCallback(chatId, data, username, CHEFFLOW_TENANT_ID, {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        adminChatId: process.env.ADMIN_CHAT_ID,
      });
      await sendReply(chatId, response.text, response.reply_markup, (response as any).image_url);
    } catch (err) {
      console.error('[webhook] processCallback error:', (err as Error).message);
      await bot.telegram
        .sendMessage(chatId, '⚠️ Ocurrió un error al procesar tu acción. Escribe /start para continuar.')
        .catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // ── Manejo de mensajes de texto e imágenes ─────────────────────────────────
  if (body.message) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = body.message as any;
    const chatId: number = msg.chat?.id;
    const rawText: string = msg.text || msg.caption || '';
    const username: string = sanitizeUsername(
      msg.from?.username || msg.from?.first_name || 'Cliente'
    );
    const isPhotoMsg: boolean = !!msg.photo;
    const isDocImage: boolean = !!(
      msg.document &&
      (msg.document.mime_type?.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|heic)$/i.test(msg.document.file_name || ''))
    );
    const isPhoto: boolean = isPhotoMsg || isDocImage;

    const fileId: string | undefined = isPhotoMsg
      ? msg.photo[msg.photo.length - 1]?.file_id
      : isDocImage
      ? msg.document?.file_id
      : undefined;

    const isLocation: boolean = !!msg.location;
    const location = msg.location
      ? {
          latitude: Number(msg.location.latitude),
          longitude: Number(msg.location.longitude),
        }
      : undefined;

    if (!chatId) return NextResponse.json({ ok: true });

    // Ignorar mensajes vacíos sin foto ni ubicación
    if (!rawText && !isPhoto && !isLocation) return NextResponse.json({ ok: true });

    // ── MessageGuard: validación central ──────────────────────────────────
    // Solo validar texto (no fotos ni ubicaciones que no tienen texto)
    if (rawText) {
      const guardResult = guardMessage(chatId, rawText);
      if (!guardResult.allowed) {
        console.warn(`[MessageGuard] Blocked chatId=${chatId}: ${guardResult.reason}`);
        await sendReply(chatId, guardResult.userMessage);
        return NextResponse.json({ ok: true });
      }
    } else if (isPhoto || isLocation) {
      // Rate limit para fotos/ubicaciones también
      const guardResult = guardCallback(chatId);
      if (!guardResult.allowed) {
        await sendReply(chatId, '⏳ Estás enviando demasiado rápido. Espera un momento.');
        return NextResponse.json({ ok: true });
      }
    }

    // ── Subir foto a Supabase Storage con Fallback Seguro ─────────────────
    let uploadedPhotoUrl: string | undefined;

    if (isPhoto && fileId) {
      try {
        const fileLink = await bot.telegram.getFileLink(fileId);
        const directUrl = fileLink.toString();
        uploadedPhotoUrl = directUrl; // Fallback inicial garantizado

        const imgRes = await fetch(directUrl);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();

          // Validar tamaño (máx 10MB)
          if (arrayBuffer.byteLength <= 10 * 1024 * 1024) {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            const filePath = `${chatId}/${Date.now()}_${fileId.slice(-8)}.jpg`;
            const { error: uploadErr } = await supabase.storage
              .from('receipts')
              .upload(filePath, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (!uploadErr) {
              uploadedPhotoUrl = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath).data.publicUrl;
            } else {
              console.warn('[webhook] Storage upload notice (using direct URL fallback):', uploadErr.message);
            }
          }
        }
      } catch (err) {
        console.error('[webhook] Error getting photo URL:', (err as Error).message);
      }
    }

    // ── Procesar mensaje en el agente ─────────────────────────────────────
    try {
      const response = await processMessage(chatId, rawText, username, CHEFFLOW_TENANT_ID, {
        isPhoto,
        photoId: uploadedPhotoUrl,
        location,
      }, {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        adminChatId: process.env.ADMIN_CHAT_ID,
      });
      await sendReply(chatId, response.text, response.reply_markup, (response as any).image_url);
    } catch (err) {
      console.error('[webhook] processMessage error:', (err as Error).message);
      // Mensaje genérico: NUNCA exponer detalles internos al usuario
      await bot.telegram
        .sendMessage(
          chatId,
          '⚠️ Ocurrió un error inesperado. Por favor, escribe /start para reiniciar tu sesión.\n\nSi el problema persiste, contacta al encargado.'
        )
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
