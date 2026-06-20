import { NextResponse } from 'next/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';

async function ensureRiderProfile(name: string) {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'rider';
  const email = `${safe}@chefflow.local`;
  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing?.id) return String(existing.id);

  const created = await supabase.auth.admin.createUser({
    email,
    password: `ChefFlow-${Date.now()}!`,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'No se pudo crear repartidor');

  const { error } = await supabase.from('profiles').insert({
    id: created.data.user.id,
    tenant_id: DEMO_TENANT_ID,
    branch_id: DEMO_BRANCH_ID,
    email,
    name,
    role: 'delivery',
    is_active: true,
  });
  if (error) throw new Error(error.message);
  return created.data.user.id;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.rider_name) {
      patch.rider_id = await ensureRiderProfile(String(body.rider_name));
      patch.status = body.status ?? 'assigned';
    }
    if (body.status) patch.status = body.status;
    if (body.latitude !== undefined) patch.latitude = Number(body.latitude);
    if (body.longitude !== undefined) patch.longitude = Number(body.longitude);
    if (body.estimated_arrival !== undefined) patch.estimated_arrival = body.estimated_arrival;

    const { data, error } = await supabase
      .from('delivery_details')
      .upsert({ order_id: orderId, ...patch }, { onConflict: 'order_id' })
      .select('*, profiles(name)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando domicilio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
