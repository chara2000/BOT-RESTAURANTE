/**
 * Dynamic WhatsApp/YCloud webhook route per tenant.
 * URL: /api/bots/whatsapp/[tenantId]
 *
 * Configured in YCloud dashboard as the webhook endpoint for each tenant.
 * Delegates cleanly to YCloudMapper and MessageRouter -> AgentOrchestrator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantCreds, verifyYCloudSignature } from '@/lib/bot/whatsapp';
import { YCloudMapper } from '@/whatsapp/ycloud/ycloud.mapper';
import { MessageRouter } from '@/whatsapp/message.router';

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
    console.warn('[bot/whatsapp] No YCloud credentials found for tenant:', tenantId);
    return NextResponse.json({ ok: true }); // Always 200 to acknowledge YCloud
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

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const mapped = YCloudMapper.mapWebhook(body);
  if (!mapped) {
    return NextResponse.json({ ok: true });
  }

  try {
    await MessageRouter.route(tenantId, mapped);
  } catch (err) {
    console.error('[bot/whatsapp] Error handling message via MessageRouter:', err);
  }

  return NextResponse.json({ ok: true });
}
