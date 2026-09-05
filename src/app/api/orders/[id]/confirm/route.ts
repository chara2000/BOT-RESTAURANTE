import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { notifyCustomerOrderStatus } from '@/lib/bot/orderNotifications';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const pin = body.pin;
    
    // Allow bypass pin later if not a telegram order
    const hasPin = pin && pin.length === 4;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const tenantId = getTenantId(request);

    // 1. Obtener la orden y validar el PIN
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, delivery_pin, status, tenant_id, notes, customers(telegram_chat_id)')
      .eq('id', id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const effectiveTenantId = order.tenant_id || tenantId;

    // Si el pedido ya está entregado
    if (order.status === 'delivered') {
      return NextResponse.json({ message: 'El pedido ya fue entregado' });
    }

    // Validar el PIN solo si es orden de Telegram
    const isTelegramOrder = !!(order.customers as any)?.telegram_chat_id;
    if (isTelegramOrder) {
      if (!hasPin) {
        return NextResponse.json({ error: 'PIN requerido para pedidos de Telegram.' }, { status: 400 });
      }
      if (order.delivery_pin && order.delivery_pin !== pin) {
        return NextResponse.json({ error: 'El PIN ingresado es incorrecto. Pide al cliente que revise el bot de Telegram.' }, { status: 400 });
      }
    }

    // 2. Si el PIN es correcto, cambiar estado a 'delivered'
    const { data: updateData, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status, notes, customers(telegram_chat_id)')
      .single();

    if (updateError) {
      throw updateError;
    }
    
    // Registrar evento de cambio de estado
    await supabase.from('order_events').insert({
      order_id: id,
      tenant_id: effectiveTenantId,
      event_type: 'status_change',
      from_value: order.status,
      to_value: 'delivered',
      actor_id: body.rider_id || null,
      actor_name: 'Repartidor'
    });

    // Enviar notificación automática al cliente (Telegram y WhatsApp)
    try {
      await notifyCustomerOrderStatus(id, 'delivered');
    } catch (e) {
      console.error('Error sending delivery confirmation customer message:', e);
    }

    return NextResponse.json({ success: true, message: 'Entrega confirmada con éxito' });
  } catch (error) {
    console.error('Error confirming delivery:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
