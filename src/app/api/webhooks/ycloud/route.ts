import { NextRequest, NextResponse } from 'next/server';
import { getTenantCreds, verifyYCloudSignature } from '@/lib/bot/whatsapp';
import { YCloudMapper } from '@/whatsapp/ycloud/ycloud.mapper';
import { MessageRouter } from '@/whatsapp/message.router';

const DEFAULT_TENANT_ID = 'ecc2c874-ed2d-4991-864f-215e443db324'; // Shek House

export async function GET(req: NextRequest) {
  // YCloud webhook verification challenge
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('challenge');
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId =
    searchParams.get('tenantId') ||
    searchParams.get('tenant_id') ||
    req.headers.get('x-tenant-id') ||
    DEFAULT_TENANT_ID;

  const creds = await getTenantCreds(tenantId);
  if (!creds) {
    console.warn('[webhooks/ycloud] No YCloud credentials found for tenant:', tenantId);
    return NextResponse.json({ ok: true });
  }

  const rawBody = await req.text();

  // Signature verification if secret configured
  if (creds.webhookSecret) {
    const signature =
      req.headers.get('ycloud-signature') ||
      req.headers.get('x-ycloud-signature-256') ||
      req.headers.get('x-ycloud-signature') ||
      '';
    const valid = await verifyYCloudSignature(rawBody, signature, creds.webhookSecret);
    if (!valid) {
      console.warn('[webhooks/ycloud] Invalid signature for tenant:', tenantId);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Normalize message using YCloudMapper
  const mapped = YCloudMapper.mapWebhook(body);
  if (!mapped) {
    return NextResponse.json({ ok: true });
  }

  // Route event asynchronously or directly to MessageRouter
  try {
    await MessageRouter.route(tenantId, mapped);
  } catch (err) {
    console.error('[webhooks/ycloud] Router execution error:', err);
  }

  return NextResponse.json({ ok: true });
}
