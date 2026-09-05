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

    if (body.status === 'closed') {
      const openingBalance = Number(body.opening_balance ?? 0);
      const closingBalance = Number(body.closing_balance ?? openingBalance);
      const actualCash = Number(body.actual_cash ?? closingBalance);
      const difference = Number(body.difference ?? (actualCash - closingBalance));

      const { data, error } = await supabase
        .from('cash_registers')
        .insert({
          tenant_id: tenantId,
          branch_id: DEMO_BRANCH_ID,
          opened_by: openedBy,
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          actual_cash: actualCash,
          difference: difference,
          status: 'closed',
          opened_at: body.opened_at || new Date().toISOString(),
          closed_at: body.closed_at || new Date().toISOString(),
        })
        .select('*, cash_transactions(*)')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data, { status: 201 });
    }

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
    const message = err instanceof Error ? err.message : 'Error procesando caja';
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

    // 3. Auditoría contable: Los pedidos históricos NUNCA se eliminan.
    // Permanecen intactos en la base de datos para reportes, métricas y arqueos.
  } catch (archiveErr) {
    console.warn('[CierreVenta] Error al finalizar pedidos activos durante cierre:', archiveErr);
  }

  return NextResponse.json({
    ...data,
    archived_orders_count: archivedOrdersCount,
    purged_orders_count: 0,
  });
}

export async function PUT(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

  try {
    const body = await request.json();
    const tenantId = getTenantId(request);

    if (!body.id) {
      return NextResponse.json({ error: 'ID de sesión de caja requerido' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.opening_balance !== undefined) updates.opening_balance = Number(body.opening_balance);
    if (body.closing_balance !== undefined) updates.closing_balance = Number(body.closing_balance);
    if (body.actual_cash !== undefined) updates.actual_cash = Number(body.actual_cash);
    if (body.difference !== undefined) updates.difference = Number(body.difference);
    if (body.status !== undefined) updates.status = body.status;
    if (body.opened_at !== undefined) updates.opened_at = body.opened_at;
    if (body.closed_at !== undefined) updates.closed_at = body.closed_at;

    const { data, error } = await supabase
      .from('cash_registers')
      .update(updates)
      .eq('id', body.id)
      .eq('tenant_id', tenantId)
      .select('*, cash_transactions(*)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando sesión de caja';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: 'ID de sesión de caja requerido' }, { status: 400 });
    }

    const tenantId = getTenantId(request);

    // 1. Eliminar transacciones vinculadas a este registro de caja
    await supabase
      .from('cash_transactions')
      .delete()
      .eq('register_id', id);

    // 2. Eliminar el registro de caja
    const { error } = await supabase
      .from('cash_registers')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error eliminando sesión de caja';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
