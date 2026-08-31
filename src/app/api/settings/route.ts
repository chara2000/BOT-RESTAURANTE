import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { encodePaymentAccounts } from '@/services/supabaseMapper';

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
    await supabase
      .from('tenants')
      .update(tenantUpdates)
      .eq('id', tenantId);
  }

  if (body.nequi_number !== undefined || body.bancolombia_number !== undefined || body.bancolombia_type !== undefined) {
    body.whatsapp_phone = encodePaymentAccounts(body.nequi_number, body.bancolombia_number, body.bancolombia_type);
  }

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

  let data: any = null;
  const { data: upsertData, error } = await supabase
    .from('tenant_settings')
    .upsert(patch, { onConflict: 'tenant_id' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('[Settings PATCH] Upsert warning, trying core settings update:', error.message);
    // Fallback: intentar update directo
    const { data: fallbackData } = await supabase
      .from('tenant_settings')
      .update(patch)
      .eq('tenant_id', tenantId)
      .select('*')
      .maybeSingle();
    data = fallbackData || patch;
  } else {
    data = upsertData || patch;
  }

  return NextResponse.json({
    ...data,
    restaurant_name: body.restaurant_name || body.name,
    logo_url: body.logo_url,
  });
}
