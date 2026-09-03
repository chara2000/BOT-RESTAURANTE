import { NextResponse } from 'next/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';

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
    const tenantId = getTenantId(request);
    const openedBy = await ensureProfile(String(body.opened_by ?? 'ChefFlow'));

    const { data, error } = await supabase
      .from('cash_registers')
      .insert({
        tenant_id: tenantId,
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
  const tenantId = getTenantId(request);
  const actualCash = Number(body.actual_cash ?? 0);
  const expected = Number(body.expected ?? actualCash);

  // 1. Cerrar la sesión de caja
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
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let archivedOrdersCount = 0;
  let purgedOrdersCount = 0;

  try {
    // 2. Cierre de Venta / Jornada: Finalizar todos los pedidos y domicilios activos
    // Para que la siguiente apertura inicie en CERO pedidos pendientes
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, notes')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'shipping']);

    if (activeOrders && activeOrders.length > 0) {
      archivedOrdersCount = activeOrders.length;
      const activeIds = activeOrders.map((o) => o.id);

      // Actualizar pedidos activos a entregados / archivados
      await supabase
        .from('orders')
        .update({
          status: 'delivered',
        })
        .in('id', activeIds);

      // Actualizar domicilios activos asociados a entregados
      await supabase
        .from('delivery_details')
        .update({ status: 'delivered', updated_at: new Date().toISOString() })
        .in('order_id', activeIds);
    }

    // 3. Regla de retención contable de 3 meses (90 días):
    // Eliminar pedidos con más de 90 días de antigüedad
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .lt('created_at', ninetyDaysAgo);

    if (oldOrders && oldOrders.length > 0) {
      purgedOrdersCount = oldOrders.length;
      const oldIds = oldOrders.map((o) => o.id);
      await supabase.from('order_items').delete().in('order_id', oldIds);
      await supabase.from('delivery_details').delete().in('order_id', oldIds);
      await supabase.from('orders').delete().in('id', oldIds);
      console.log(`[CierreVenta] Purga de retención (3 meses): ${purgedOrdersCount} pedidos eliminados para ${tenantId}`);
    }
  } catch (archiveErr) {
    console.warn('[CierreVenta] Error al archivar/purgar pedidos durante cierre:', archiveErr);
  }

  return NextResponse.json({
    ...data,
    archived_orders_count: archivedOrdersCount,
    purged_orders_count: purgedOrdersCount,
  });
}
