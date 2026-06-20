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
    // Fallback: Markdown inválido → texto plano
    await bot.telegram.sendMessage(chatId, text, {
      ...(reply_markup ? { reply_markup } : {}),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Manejo de botones inline (callback_query) ──────────────────────────
    if (body.callback_query) {
      const { id, from, data, message } = body.callback_query as {
        id: string;
        from: { username?: string; first_name?: string };
        data: string;
        message: { chat: { id: number } };
      };

      const chatId = message.chat.id;
      const username = from.username || from.first_name || 'Cliente';

      // Responder inmediatamente para quitar el spinner del botón
      await bot.telegram.answerCbQuery(id).catch(() => {});

      const response = await processCallback(chatId, data, username);
      await sendReply(chatId, response.text, response.reply_markup);

      return NextResponse.json({ success: true });
    }

    // ── Manejo de mensajes de texto ────────────────────────────────────────
    if (body.message) {
      const { chat, text, from } = body.message as {
        chat: { id: number };
        text?: string;
        from?: { username?: string; first_name?: string };
      };

      if (!text) return NextResponse.json({ success: true });

      const chatId = chat.id;
      const username = from?.username || from?.first_name || 'Cliente';

      const response = await processMessage(chatId, text, username);
      await sendReply(chatId, response.text, response.reply_markup);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Siempre devolver 200 a Telegram para que no reintente
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
