import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  if (body.restaurant_name !== undefined) {
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({ name: String(body.restaurant_name), updated_at: new Date().toISOString() })
      .eq('id', DEMO_TENANT_ID);

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 400 });
    }
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
  ];
  const patch: Record<string, unknown> = {
    tenant_id: DEMO_TENANT_ID,
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
