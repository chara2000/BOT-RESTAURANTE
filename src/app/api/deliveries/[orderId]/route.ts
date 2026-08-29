import { NextResponse } from 'next/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';

async function ensureRiderProfile(name: string, tenantId: string = DEMO_TENANT_ID) {
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
    tenant_id: tenantId,
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
    
    // Get existing delivery details and order to determine tenant
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('tenant_id')
      .eq('id', orderId)
      .maybeSingle();

    const tenantId = existingOrder?.tenant_id || DEMO_TENANT_ID;

    // Get existing delivery details to check previous assignment
    const { data: existingDelivery } = await supabase
      .from('delivery_details')
      .select('rider_id, status, profiles(name)')
      .eq('order_id', orderId)
      .maybeSingle();

    const prevRiderId = existingDelivery?.rider_id;
    const prevRiderName = (existingDelivery?.profiles as any)?.name;

    // Handle rider assignment / removal
    if (body.hasOwnProperty('rider_id')) {
      const nextRiderId = body.rider_id; // could be null
      patch.rider_id = nextRiderId;
      if (nextRiderId) {
        patch.status = body.status ?? 'assigned';
      } else {
        patch.status = 'searching';
      }
    } else if (body.rider_name) {
      patch.rider_id = await ensureRiderProfile(String(body.rider_name), tenantId);
      patch.status = body.status ?? 'assigned';
    }

    if (body.status) {
      patch.status = body.status;
    }
    if (body.latitude !== undefined) patch.latitude = body.latitude;
    if (body.longitude !== undefined) patch.longitude = body.longitude;
    if (body.estimated_arrival !== undefined) patch.estimated_arrival = body.estimated_arrival;

    const { data, error } = await supabase
      .from('delivery_details')
      .update(patch)
      .eq('order_id', orderId)
      .select('*, profiles(name)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Sincronizar campo rider_id en la tabla orders también
    await supabase
      .from('orders')
      .update({ rider_id: patch.rider_id ?? null, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Auditar cambios de repartidor si hubo modificación de rider_id
    if (patch.rider_id !== undefined && patch.rider_id !== prevRiderId) {
      const newRiderName = (data?.profiles as any)?.name || body.rider_name || 'Desconocido';

      // Log in rider_assignments audit table
      await supabase.from('rider_assignments').insert({
        order_id: orderId,
        tenant_id: tenantId,
        previous_rider_id: prevRiderId || null,
        new_rider_id: patch.rider_id || null,
        previous_rider_name: prevRiderName || null,
        new_rider_name: newRiderName || null,
        changed_by_name: body.actor_name || 'Admin',
        reason: body.reason || 'Reasignacion'
      });

      // Log in order_events
      await supabase.from('order_events').insert({
        order_id: orderId,
        tenant_id: tenantId,
        event_type: patch.rider_id ? 'rider_assigned' : 'rider_removed',
        from_value: prevRiderName || null,
        to_value: newRiderName || null,
        actor_name: body.actor_name || 'Admin',
        notes: body.reason || (patch.rider_id ? `Asignado a ${newRiderName}` : 'Repartidor desasignado')
      });
    }

    // Si cambió de estado operativo en delivery_details, registrar evento
    if (body.status && body.status !== existingDelivery?.status) {
      await supabase.from('order_events').insert({
        order_id: orderId,
        tenant_id: tenantId,
        event_type: 'delivery_status_change',
        from_value: existingDelivery?.status || 'searching',
        to_value: body.status,
        actor_name: body.actor_name || 'Repartidor/Sistema'
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando domicilio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
