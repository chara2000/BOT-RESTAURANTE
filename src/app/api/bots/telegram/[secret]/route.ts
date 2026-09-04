/**
 * Dynamic Telegram webhook route — one URL per tenant.
 * URL: /api/bots/telegram/[secret]
 *
 * Each tenant has a unique `telegram_webhook_secret` stored in tenant_settings.
 * This secret (never the real bot token) is used as the URL path segment so
 * the actual token is never exposed in URLs or logs.
 *
 * To register a webhook for a tenant, call:
 *   POST /api/settings/bots  { telegram_bot_token, telegram_admin_chat_id }
 * which will auto-register the webhook URL in Telegram's API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import { processMessage, processCallback } from '@/lib/bot/agent';
import {
  guardMessage,
  guardCallback,
  isProcessedUpdate,
  sanitizeUsername,
} from '@/lib/bot/guards/MessageGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache: secret → { tenantId, botToken, adminChatId }
const tenantCache = new Map<string, { tenantId: string; botToken: string; adminChatId: string | null; at: number }>();
const CACHE_TTL = 60_000;

async function getTenantBySecret(secret: string) {
  const cached = tenantCache.get(secret);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('tenant_id, telegram_bot_token, telegram_admin_chat_id')
    .eq('telegram_webhook_secret', secret)
    .maybeSingle();

  if (error || !data?.telegram_bot_token) return null;

  const entry = {
    tenantId: data.tenant_id,
    botToken: data.telegram_bot_token,
    adminChatId: data.telegram_admin_chat_id || null,
    at: Date.now(),
  };
  tenantCache.set(secret, entry);
  return entry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendReply(bot: Telegraf, chatId: number, text: string, reply_markup?: any, imageUrl?: string) {
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
  } catch {
    try {
      await bot.telegram.sendMessage(chatId, text, reply_markup ? { reply_markup } : {});
    } catch (e2) {
      console.error('[bot/telegram] sendReply fallback failed:', (e2 as Error).message);
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;

  // Resolve tenant from secret
  const tenant = await getTenantBySecret(secret);
  if (!tenant) {
    // Unknown secret — return 200 to avoid Telegram retries
    console.warn('[bot/telegram] Unknown webhook secret:', secret);
    return NextResponse.json({ ok: true });
  }

  const { tenantId, botToken, adminChatId } = tenant;
  const bot = new Telegraf(botToken);
  const botCredentials = { botToken, adminChatId: adminChatId ?? undefined };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Idempotency — ignore duplicate update_ids
  const updateId = (body.update_id as number) ?? 0;
  if (updateId && isProcessedUpdate(updateId)) {
    return NextResponse.json({ ok: true });
  }

  // ── Inline button callbacks ─────────────────────────────────────────────────
  if (body.callback_query) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cq = body.callback_query as any;
    const chatId: number = cq.message?.chat?.id;
    const username = sanitizeUsername(cq.from?.username || cq.from?.first_name || 'Cliente');
    const data: string = (cq.data || '').slice(0, 200);
    const cbId: string = cq.id;

    if (!chatId) return NextResponse.json({ ok: true });

    const guardResult = guardCallback(chatId);
    if (!guardResult.allowed) {
      await bot.telegram.answerCbQuery(cbId, '⏳ Demasiado rápido. Espera un momento.').catch(() => {});
      return NextResponse.json({ ok: true });
    }

    await bot.telegram.answerCbQuery(cbId).catch(() => {});

    try {
      const response = await processCallback(chatId, data, username, tenantId, botCredentials);
      if (response.document_url) {
        await bot.telegram.sendDocument(chatId, response.document_url, {
          caption: response.document_caption || '📖 Carta y Menú del Restaurante',
        }).catch((e: any) => console.warn('[bot/telegram] Error sending document:', e?.message));
      }
      await sendReply(bot, chatId, response.text, response.reply_markup, (response as any).image_url);
    } catch (err) {
      console.error('[bot/telegram] processCallback error:', (err as Error).message);
      await bot.telegram.sendMessage(chatId, '⚠️ Ocurrió un error. Escribe /start para continuar.').catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // ── Text / photo / location messages ───────────────────────────────────────
  if (body.message) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = body.message as any;
    const chatId: number = msg.chat?.id;
    const rawText: string = msg.text || msg.caption || '';
    const username = sanitizeUsername(msg.from?.username || msg.from?.first_name || 'Cliente');
    const isPhotoMsg = !!msg.photo;
    const isDocImage = !!(msg.document && (msg.document.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(msg.document.file_name || '')));
    const isPhoto = isPhotoMsg || isDocImage;
    const fileId: string | undefined = isPhotoMsg ? msg.photo[msg.photo.length - 1]?.file_id : isDocImage ? msg.document?.file_id : undefined;
    const isLocation = !!msg.location;
    const location = msg.location ? { latitude: Number(msg.location.latitude), longitude: Number(msg.location.longitude) } : undefined;

    if (!chatId) return NextResponse.json({ ok: true });
    if (!rawText && !isPhoto && !isLocation) return NextResponse.json({ ok: true });

    if (rawText) {
      const guardResult = guardMessage(chatId, rawText);
      if (!guardResult.allowed) {
        await sendReply(bot, chatId, guardResult.userMessage);
        return NextResponse.json({ ok: true });
      }
    } else {
      const guardResult = guardCallback(chatId);
      if (!guardResult.allowed) {
        await sendReply(bot, chatId, '⏳ Estás enviando demasiado rápido. Espera un momento.');
        return NextResponse.json({ ok: true });
      }
    }

    // Upload photo to Supabase Storage
    let uploadedPhotoUrl: string | undefined;
    if (isPhoto && fileId) {
      try {
        const fileLink = await bot.telegram.getFileLink(fileId);
        uploadedPhotoUrl = fileLink.toString();
        const imgRes = await fetch(uploadedPhotoUrl);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          if (arrayBuffer.byteLength <= 10 * 1024 * 1024) {
            const { createClient: sc } = await import('@supabase/supabase-js');
            const storage = sc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
            const filePath = `${chatId}/${Date.now()}_${fileId.slice(-8)}.jpg`;
            const { error: uploadErr } = await storage.storage.from('receipts').upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
            if (!uploadErr) {
              uploadedPhotoUrl = storage.storage.from('receipts').getPublicUrl(filePath).data.publicUrl;
            } else {
              const base64Str = Buffer.from(arrayBuffer).toString('base64');
              uploadedPhotoUrl = `data:image/jpeg;base64,${base64Str}`;
            }
          }
        }
      } catch (err) {
        console.error('[bot/telegram] Error getting photo URL:', (err as Error).message);
      }
    }

    try {
      const response = await processMessage(chatId, rawText, username, tenantId, { isPhoto, photoId: uploadedPhotoUrl, location }, botCredentials);
      if (response.document_url) {
        await bot.telegram.sendDocument(chatId, response.document_url, {
          caption: response.document_caption || '📖 Carta y Menú del Restaurante',
        }).catch((e: any) => console.warn('[bot/telegram] Error sending document:', e?.message));
      }
      await sendReply(bot, chatId, response.text, response.reply_markup, (response as any).image_url);
    } catch (err) {
      console.error('[bot/telegram] processMessage error:', (err as Error).message);
      await bot.telegram.sendMessage(chatId, '⚠️ Ocurrió un error inesperado. Escribe /start para reiniciar.').catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
