import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';

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

    // Enviar notificación a Telegram pidiendo calificación (la lógica de telegram debe correr)
    // Para no duplicar toda la lógica de notificación de /status, importaremos y llamaremos a la función
    // o simplemente enviamos un mensaje a TG aquí:
    
    const customer = (updateData as any)?.customers;
    const telegramChatId = customer?.telegram_chat_id;
    
    if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const { Telegraf } = await import('telegraf');
        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        
        // Obtener el repartidor para la calificación
        let riderName = 'tu repartidor';
        const { data: dData } = await supabase
          .from('deliveries')
          .select('rider_id')
          .eq('order_id', id)
          .single();
        
        if (dData && dData.rider_id) {
          const { data: rData } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', dData.rider_id)
            .single();
          if (rData && rData.name) {
            riderName = rData.name;
          }
        }
        
        const shortId = updateData.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${updateData.id.slice(0, 6).toUpperCase()}`;
        
        const msg = `🔔 *Actualización de tu pedido (${shortId})*\n\nEl estado de tu pedido ha cambiado a:\n👉 *🎉 Entregado*\n\n¿Qué tal estuvo la entrega? Califica a ${riderName}:`;
        
        await bot.telegram.sendMessage(telegramChatId, msg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `⭐ Calificar a ${riderName}`, callback_data: `rate_rider:${id}:${riderName}` }]
            ]
          }
        });
      } catch (e) {
        console.error('Error sending delivery confirmation TG message:', e);
      }
    }

    return NextResponse.json({ success: true, message: 'Entrega confirmada con éxito' });
  } catch (error) {
    console.error('Error confirming delivery:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
