import { NextRequest, NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { processMessage, processCallback } from '@/lib/bot/agent';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendReply(chatId: number, text: string, reply_markup?: any) {
  try {
    await bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...(reply_markup ? { reply_markup } : {}),
    });
  } catch {
    // Fallback: si Markdown falla, enviar texto plano
    try {
      await bot.telegram.sendMessage(chatId, text, {
        ...(reply_markup ? { reply_markup } : {}),
      });
    } catch (e2) {
      console.error('sendReply fallback failed:', e2);
    }
  }
}

export async function POST(req: NextRequest) {
  // Siempre responder 200 a Telegram (si tardamos más de 3s cancela y reintenta)
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ── Manejo de botones inline (callback_query) ──────────────────────────
  if (body.callback_query) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cq = body.callback_query as any;
    const chatId: number = cq.message?.chat?.id;
    const username: string = cq.from?.username || cq.from?.first_name || 'Cliente';
    const data: string = cq.data || '';
    const cbId: string = cq.id;

    // Quitar spinner del botón inmediatamente
    await bot.telegram.answerCbQuery(cbId).catch(() => {});

    try {
      const response = await processCallback(chatId, data, username);
      await sendReply(chatId, response.text, response.reply_markup);
    } catch (err) {
      console.error('processCallback error:', err);
      await bot.telegram.sendMessage(chatId, '⚠️ Ocurrió un error. Escribe /start para reiniciar.').catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // ── Manejo de mensajes de texto e imágenes ─────────────────────────────
  if (body.message) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = body.message as any;
    const chatId: number = msg.chat?.id;
    const text: string = msg.text || msg.caption || '';
    const username: string = msg.from?.username || msg.from?.first_name || 'Cliente';
    const isPhoto: boolean = !!msg.photo;
    const photoId: string | undefined = msg.photo ? msg.photo[msg.photo.length - 1].file_id : undefined;

    if (!text && !isPhoto) return NextResponse.json({ ok: true });

    let uploadedPhotoUrl: string | undefined;

    if (isPhoto && photoId) {
      try {
        const fileLink = await bot.telegram.getFileLink(photoId);
        const imgRes = await fetch(fileLink.toString());
        const arrayBuffer = await imgRes.arrayBuffer();
        
        // Supabase client solo para storage aquí
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const filePath = `${chatId}/${photoId}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('receipts').upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

        if (!uploadErr) {
          uploadedPhotoUrl = supabase.storage.from('receipts').getPublicUrl(filePath).data.publicUrl;
        }
      } catch (err) {
        console.error('Error uploading photo:', err);
      }
    }

    try {
      const response = await processMessage(chatId, text, username, { isPhoto, photoId: uploadedPhotoUrl });
      await sendReply(chatId, response.text, response.reply_markup);
    } catch (err) {
      console.error('processMessage error:', err);
      await bot.telegram.sendMessage(chatId, '⚠️ Ocurrió un error. Escribe /start para reiniciar.').catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

