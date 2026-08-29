import { NextResponse } from 'next/server';
import { notifyOrderStatusChange } from '@/lib/n8n/server';
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
    .select('status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
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
    tenant_id: tenantId,
    event_type: 'status_change',
    from_value: prevData?.status ?? null,
    to_value: status,
    actor_id: actorId ?? null,
    actor_name: actorName ?? null,
  });

  // Notificar al cliente por Telegram
  let telegramChatId: string | null = (updatedOrder as any)?.customers?.telegram_chat_id || null;

  // Fallback 1: Extraer [CHAT_ID: 123456] de las notas del pedido
  if (!telegramChatId && updatedOrder.notes) {
    const match = updatedOrder.notes.match(/\[CHAT_ID:\s*(\d+)\]/i);
    if (match) telegramChatId = match[1];
  }

  // Fallback 2: Buscar en la tabla customers por customer_id
  if (!telegramChatId && updatedOrder.customer_id) {
    try {
      const { data: custData } = await supabase
        .from('customers')
        .select('telegram_chat_id')
        .eq('id', updatedOrder.customer_id)
        .single();
      if (custData?.telegram_chat_id) telegramChatId = custData.telegram_chat_id;
    } catch (e) {
      console.warn('Customer query failed:', e);
    }
  }

  if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { Telegraf } = await import('telegraf');
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      const shortId = updatedOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${updatedOrder.id.slice(0, 6).toUpperCase()}`;

      
      const statusMap: Record<string, string> = {
        pending: '⏳ Pendiente (Esperando confirmación)',
        confirmed: '✅ Confirmado (En cola)',
        preparing: '🍳 En preparación (Cocinando)',
        ready: '🛍️ Listo para entregar',
        shipping: '🛵 En camino (Repartidor asignado)',
        delivered: '🎉 Entregado',
        cancelled: '❌ Cancelado'
      };
      
      const statusText = statusMap[status] || status;
      let msg = `🔔 *Actualización de tu pedido (${shortId})*\n\nEl estado de tu pedido ha cambiado a:\n👉 *${statusText}*`;
      
      let inlineKeyboard = undefined;

      if (status === 'shipping') {
        msg += `\n\n🛵 ¡Tu pedido ya va en camino! Puedes rastrear la ubicación del repartidor en tiempo real o consultar el bot de Telegram en la sección de rastreo.`;
        if (updatedOrder.delivery_pin) {
          msg += `\n\n🔑 *Tu Código de Seguridad para entregar el pedido es: ${updatedOrder.delivery_pin}*\n\nPor favor dale este código al repartidor al recibir tu pedido.`;
        }
      } else if (status === 'delivered') {
        // Find rider info to ask for rating
        try {
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
              msg += `\n\n¿Qué tal estuvo la entrega? Califica a tu repartidor ${rData.name}:`;
              inlineKeyboard = {
                inline_keyboard: [
                  [{ text: `⭐ Calificar a ${rData.name}`, callback_data: `rate_rider:${id}:${rData.name}` }]
                ]
              };
            }
          }
        } catch (e) {
          console.error('Error fetching rider for rating:', e);
        }
      }

      await bot.telegram.sendMessage(telegramChatId, msg, { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      });
    } catch (telegramErr) {
      console.error('[status route] Error enviando mensaje a Telegram:', telegramErr);
    }
  }

  await notifyOrderStatusChange(id, status);

  return NextResponse.json(updatedOrder);
}
