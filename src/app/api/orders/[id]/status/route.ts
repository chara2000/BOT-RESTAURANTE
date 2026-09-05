import { NextResponse } from 'next/server';
import { notifyOrderStatusChange } from '@/lib/n8n/server';
import { notifyCustomerOrderStatus } from '@/lib/bot/orderNotifications';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import type { OrderStatus } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const status = body.status as OrderStatus;
  const actorId: string | undefined = body.actor_id;
  const actorName: string | undefined = body.actor_name;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const tenantId = getTenantId(request);

  // Obtener estado previo antes de actualizar
  const { data: prevData } = await supabase
    .from('orders')
    .select('status, tenant_id')
    .eq('id', id)
    .maybeSingle();

  if (!prevData) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const effectiveTenantId = prevData.tenant_id || tenantId;

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, notes, delivery_pin, customer_id, customers(telegram_chat_id)');

  if (error) {
    console.error('Update error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data || data.length === 0) {
    console.error(`Order ${id} not found or RLS blocked update`);
    return NextResponse.json({ error: 'Order not found or update blocked' }, { status: 404 });
  }

  const updatedOrder = data[0];

  // Insertar evento en order_events para el timeline
  await supabase.from('order_events').insert({
    order_id: id,
    tenant_id: effectiveTenantId,
    event_type: 'status_change',
    from_value: prevData?.status ?? null,
    to_value: status,
    actor_id: actorId ?? null,
    actor_name: actorName ?? null,
  });

  // Notificar al cliente automáticamente (Telegram y WhatsApp)
  try {
    await notifyCustomerOrderStatus(id, status);
  } catch (notifErr) {
    console.error('[status route] Error notificando al cliente:', notifErr);
  }

  await notifyOrderStatusChange(id, status);

  return NextResponse.json(updatedOrder);
}
