/**
 * Bot settings API — save per-tenant Telegram and WhatsApp credentials.
 *
 * POST /api/settings/bots
 * Body: { telegram_bot_token?, telegram_admin_chat_id?, ycloud_api_key?, ycloud_phone_number?, ycloud_webhook_secret? }
 *
 * After saving a Telegram token, automatically registers the webhook in Telegram's API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  ? (process.env.NEXT_PUBLIC_APP_URL.startsWith('http') ? process.env.NEXT_PUBLIC_APP_URL : `https://${process.env.NEXT_PUBLIC_APP_URL}`)
  : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const tenantId = getTenantId(req);

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('telegram_bot_token, telegram_admin_chat_id, telegram_webhook_secret, ycloud_api_key, ycloud_phone_number, ycloud_webhook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask secrets partially for display
  const mask = (v: string | null) => v ? v.slice(0, 8) + '***' + v.slice(-4) : null;

  return NextResponse.json({
    telegram_bot_token: mask(data?.telegram_bot_token || null),
    telegram_admin_chat_id: data?.telegram_admin_chat_id || null,
    telegram_webhook_url: data?.telegram_webhook_secret
      ? `${APP_URL}/api/bots/telegram/${data.telegram_webhook_secret}`
      : null,
    ycloud_api_key: mask(data?.ycloud_api_key || null),
    ycloud_phone_number: data?.ycloud_phone_number || null,
    ycloud_webhook_url: `${APP_URL}/api/bots/whatsapp/${tenantId}`,
    ycloud_webhook_secret: mask(data?.ycloud_webhook_secret || null),
  });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const tenantId = getTenantId(req);
  const body = await req.json();

  const {
    telegram_bot_token,
    telegram_admin_chat_id,
    ycloud_api_key,
    ycloud_phone_number,
    ycloud_webhook_secret,
  } = body;

  // Build update payload with only provided fields
  const updates: Record<string, string | null> = {};
  let newWebhookSecret: string | null = null;

  if (telegram_bot_token !== undefined) {
    updates.telegram_bot_token = telegram_bot_token || null;

    // Generate a new webhook secret whenever the token changes
    if (telegram_bot_token) {
      newWebhookSecret = crypto.randomUUID().replace(/-/g, '');
      updates.telegram_webhook_secret = newWebhookSecret;
    }
  }
  if (telegram_admin_chat_id !== undefined) {
    updates.telegram_admin_chat_id = telegram_admin_chat_id || null;
  }
  if (ycloud_api_key !== undefined) {
    updates.ycloud_api_key = ycloud_api_key || null;
  }
  if (ycloud_phone_number !== undefined) {
    updates.ycloud_phone_number = ycloud_phone_number || null;
  }
  if (ycloud_webhook_secret !== undefined) {
    updates.ycloud_webhook_secret = ycloud_webhook_secret || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Upsert tenant settings
  const { error: upsertError } = await supabase
    .from('tenant_settings')
    .upsert({ tenant_id: tenantId, ...updates }, { onConflict: 'tenant_id' });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const results: Record<string, unknown> = { success: true };

  // Auto-register Telegram webhook if a new token was provided
  if (telegram_bot_token && newWebhookSecret) {
    const webhookUrl = `${APP_URL}/api/bots/telegram/${newWebhookSecret}`;
    results.telegram_webhook_url = webhookUrl;

    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${telegram_bot_token}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: true,
          }),
        }
      );
      const tgData = await tgRes.json();

      if (tgData.ok) {
        results.telegram_webhook_registered = true;
        results.telegram_webhook_secret = newWebhookSecret;
      } else {
        results.telegram_webhook_registered = false;
        results.telegram_webhook_error = tgData.description || 'Unknown error from Telegram';
      }
    } catch (err) {
      results.telegram_webhook_registered = false;
      results.telegram_webhook_error = (err as Error).message;
    }
  }

  // WhatsApp webhook URL (informational — user must paste it in YCloud dashboard)
  if (ycloud_api_key || ycloud_phone_number) {
    results.ycloud_webhook_url = `${APP_URL}/api/bots/whatsapp/${tenantId}`;
  }

  return NextResponse.json(results);
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const tenantId = getTenantId(req);
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel'); // 'telegram' | 'whatsapp'

  let updates: Record<string, null> = {};
  if (channel === 'telegram') {
    updates = { telegram_bot_token: null, telegram_webhook_secret: null, telegram_admin_chat_id: null };
  } else if (channel === 'whatsapp') {
    updates = { ycloud_api_key: null, ycloud_phone_number: null, ycloud_webhook_secret: null };
  } else {
    return NextResponse.json({ error: 'channel param must be telegram or whatsapp' }, { status: 400 });
  }

  const { error } = await supabase.from('tenant_settings').update(updates).eq('tenant_id', tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, disconnected: channel });
}
