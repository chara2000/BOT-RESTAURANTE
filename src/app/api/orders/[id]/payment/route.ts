import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { notifyOrderStatusChange } from '@/lib/n8n/server';
import type { OrderStatus } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenantId = getTenantId(request);
    const supabase = createAdminClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const body = await request.json();
    const { payment_status, notes } = body;

    // 1. Obtener la orden existente sin restringir por tenant default en caso de que no se envíe en headers
    const { data: prevOrder, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, tenant_id, notes, customer_id, customers(telegram_chat_id)')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !prevOrder) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const effectiveTenantId = prevOrder.tenant_id || tenantId;

    // 2. Preparar campos a actualizar
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (notes !== undefined) patch.notes = notes;

    let targetStatus: OrderStatus = prevOrder.status as OrderStatus;
    if (payment_status === 'paid') {
      targetStatus = 'confirmed';
      patch.status = 'confirmed';
    } else if (payment_status === 'failed') {
      targetStatus = 'cancelled';
      patch.status = 'cancelled';
    }

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id)
      .select('id, status, notes, delivery_pin, customer_id, customers(telegram_chat_id)')
      .single();

    if (error) {
      console.error('[payment route] Update error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 3. Registrar evento en el timeline
    try {
      await supabase.from('order_events').insert({
        order_id: id,
        tenant_id: effectiveTenantId,
        event_type: 'payment_status_change',
        from_value: prevOrder.status,
        to_value: targetStatus,
        actor_name: 'Módulo Pagos',
      });
    } catch (e) {
      console.warn('[payment route] Error inserting order event:', e);
    }

    // 4. Notificar al cliente vía Telegram si aplica
    let telegramChatId: string | null = (data as any)?.customers?.telegram_chat_id || null;
    if (!telegramChatId && data.notes) {
      const match = data.notes.match(/\[CHAT_ID:\s*(\d+)\]/i);
      if (match) telegramChatId = match[1];
    }

    if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const { Telegraf } = await import('telegraf');
        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        const shortId = data.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${id.slice(0, 6).toUpperCase()}`;

        let msg = '';
        if (payment_status === 'paid') {
          msg = `✅ *¡Comprobante de Pago Aprobado!*\n\nTu pago para el pedido *${shortId}* ha sido verificado correctamente.\n🍳 Tu pedido ha ingresado a la cocina para su preparación.`;
        } else if (payment_status === 'failed') {
          msg = `❌ *Comprobante de Pago Rechazado*\n\nEl comprobante para el pedido *${shortId}* no pudo ser verificado. El pedido ha sido cancelado.\n\nComunícate con nosotros si necesitas asistencia.`;
        }

        if (msg) {
          await bot.telegram.sendMessage(telegramChatId, msg, { parse_mode: 'Markdown' });
        }
      } catch (telegramErr) {
        console.error('[payment route] Error enviando mensaje a Telegram:', telegramErr);
      }
    }

    // 5. Notificar a n8n
    await notifyOrderStatusChange(id, targetStatus);

    return NextResponse.json(data);
  } catch (err) {
    console.error('[payment route] Unhandled error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno al procesar el pago' },
      { status: 500 }
    );
  }
}
