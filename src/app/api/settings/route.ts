import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { encodePaymentAccounts } from '@/services/supabaseMapper';

// Columns that actually exist in tenant_settings — never include columns from other tables
const TENANT_SETTINGS_COLUMNS = [
  'tenant_id',
  'delivery_fee',
  'telegram_bot_token',
  'telegram_webhook_secret',
  'telegram_admin_chat_id',
  'telegram_enabled',
  'whatsapp_enabled',
  'whatsapp_phone',
  'ycloud_api_key',
  'ycloud_phone_number',
  'ycloud_webhook_secret',
  'ai_enabled',
  'ai_model',
  'payment_methods',
  'business_hours',
  'coverage_city',
  'coverage_department',
  'coverage_keywords',
  'coverage_require_keywords',
  'restaurant_lat',
  'restaurant_lng',
  'auto_assign_riders',
  'allow_external_riders',
  'updated_at',
];

export async function GET(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const tenantId = getTenantId(request);

  // Fetch tenant_settings safely via admin client (bypasses RLS + schema cache)
  const { data: settingsRow, error: settingsErr } = await supabase
    .from('tenant_settings')
    .select(TENANT_SETTINGS_COLUMNS.join(', '))
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (settingsErr) {
    console.warn('[Settings GET] tenant_settings query failed:', settingsErr.message);
  }

  // Also fetch restaurant name and logo from tenants table
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('name, logo_url')
    .eq('id', tenantId)
    .maybeSingle();

  const merged: Record<string, unknown> = {
    ...((settingsRow as Record<string, unknown> | null) ?? {}),
    restaurant_name: tenantRow?.name ?? '',
    logo_url: tenantRow?.logo_url ?? '',
  };

  return NextResponse.json(merged);
}

export async function PATCH(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const tenantId = getTenantId(request);
  const body = await request.json();

  // 1. Sincronizar nombre y logo directamente en la tabla tenants
  const tenantUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.restaurant_name !== undefined) tenantUpdates.name = String(body.restaurant_name).trim();
  if (body.name !== undefined) tenantUpdates.name = String(body.name).trim();
  if (body.logo_url !== undefined) tenantUpdates.logo_url = String(body.logo_url).trim();

  if (Object.keys(tenantUpdates).length > 1) {
    const { error: tenantErr } = await supabase
      .from('tenants')
      .update(tenantUpdates)
      .eq('id', tenantId);
    if (tenantErr) {
      console.warn('[Settings PATCH] tenant update warning:', tenantErr.message);
    }
  }

  if (body.nequi_number !== undefined || body.bancolombia_number !== undefined || body.bancolombia_type !== undefined) {
    body.whatsapp_phone = encodePaymentAccounts(body.nequi_number, body.bancolombia_number, body.bancolombia_type);
  }

  // Only include keys that actually exist in tenant_settings
  const allowed = [
    'delivery_fee',
    'telegram_bot_token',
    'telegram_enabled',
    'whatsapp_enabled',
    'whatsapp_phone',
    'ai_enabled',
    'ai_model',
    'payment_methods',
    'business_hours',
    'coverage_city',
    'coverage_department',
    'coverage_keywords',
    'coverage_require_keywords',
    'restaurant_lat',
    'restaurant_lng',
    'auto_assign_riders',
    'allow_external_riders',
  ];

  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Only update if there are actual fields to update (beyond tenant_id and updated_at)
  if (Object.keys(patch).length > 2) {
    const { error } = await supabase
      .from('tenant_settings')
      .upsert(patch, { onConflict: 'tenant_id' });

    if (error) {
      console.warn('[Settings PATCH] Upsert warning:', error.message);
      // Fallback: try update without upsert
      await supabase
        .from('tenant_settings')
        .update(patch)
        .eq('tenant_id', tenantId);
    }
  }

  // Fetch updated state to return
  const { data: updatedSettings } = await supabase
    .from('tenant_settings')
    .select(TENANT_SETTINGS_COLUMNS.join(', '))
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { data: updatedTenant } = await supabase
    .from('tenants')
    .select('name, logo_url')
    .eq('id', tenantId)
    .maybeSingle();

  const responseData: Record<string, unknown> = {
    ...((updatedSettings as Record<string, unknown> | null) ?? (patch as Record<string, unknown>)),
    restaurant_name: updatedTenant?.name ?? body.restaurant_name ?? body.name,
    logo_url: updatedTenant?.logo_url ?? body.logo_url,
  };

  return NextResponse.json(responseData);
}
