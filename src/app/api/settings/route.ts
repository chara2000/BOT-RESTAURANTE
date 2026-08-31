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
  if (body.restaurant_name !== undefined) {
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({ name: String(body.restaurant_name), updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 400 });
    }
  }

  if (body.nequi_number !== undefined || body.bancolombia_number !== undefined || body.bancolombia_type !== undefined) {
    body.whatsapp_phone = encodePaymentAccounts(body.nequi_number, body.bancolombia_number, body.bancolombia_type);
  }


  // Ensure additions column exists in tenant_settings
  try {
    await supabase.rpc('execute_sql', {
      sql: "ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;"
    });
  } catch (e) {
    // Non-critical if RPC not available
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
    'additions',
  ];
  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .upsert(patch, { onConflict: 'tenant_id' })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ...data, restaurant_name: body.restaurant_name });
}
