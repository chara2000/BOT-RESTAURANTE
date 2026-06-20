import { NextResponse } from 'next/server';
import { processMessage } from '@/lib/bot/agent';
import { Telegraf } from 'telegraf';

export const maxDuration = 60; // Permitir hasta 60 segundos en Vercel
export const dynamic = 'force-dynamic';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy');

async function sendTyping(chatId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = 'https://api.telegram.org/bot' + token + '/sendChatAction';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch (_) {}
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();

    if (body.message && body.message.text) {
      const chatId: number = body.message.chat.id;
      const text: string = body.message.text;
      const username: string = body.message.from?.first_name || 'Cliente';

      await sendTyping(chatId);

      const replyText = await processMessage(chatId, text, username);

      await bot.telegram.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Webhook Error:', err);
    // Intentar enviar el error directo al usuario de Telegram para depuración
    try {
      if (body?.message?.chat?.id) {
        await bot.telegram.sendMessage(body.message.chat.id, '❌ *Error Interno del Bot:*\n`' + String(err) + '`', { parse_mode: 'Markdown' });
      }
    } catch (_) {}
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
