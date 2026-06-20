import { NextResponse } from 'next/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';

async function ensureProfile(name: string) {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const email = 'cashier@chefflow.local';
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const created = await supabase.auth.admin.createUser({
    email,
    password: `ChefFlow-${Date.now()}!`,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'No se pudo crear perfil de caja');

  const { error } = await supabase.from('profiles').insert({
    id: created.data.user.id,
    tenant_id: DEMO_TENANT_ID,
    branch_id: DEMO_BRANCH_ID,
    email,
    name,
    role: 'operator',
    is_active: true,
  });
  if (error) throw new Error(error.message);
  return created.data.user.id;
}

export async function POST(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

    const body = await request.json();
    const openedBy = await ensureProfile(String(body.opened_by ?? 'ChefFlow'));

    const { data, error } = await supabase
      .from('cash_registers')
      .insert({
        tenant_id: DEMO_TENANT_ID,
        branch_id: DEMO_BRANCH_ID,
        opened_by: openedBy,
        opening_balance: Number(body.opening_balance ?? 0),
        status: 'open',
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error abriendo caja';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

  const body = await request.json();
  const actualCash = Number(body.actual_cash ?? 0);
  const expected = Number(body.expected ?? actualCash);

  const { data, error } = await supabase
    .from('cash_registers')
    .update({
      status: 'closed',
      closing_balance: expected,
      actual_cash: actualCash,
      difference: actualCash - expected,
      closed_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
