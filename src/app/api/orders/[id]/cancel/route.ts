import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const chatId: string = body.chat_id; // telegram chat_id del cliente que cancela

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  // Obtener el pedido y verificar que pertenece a este cliente
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, notes, customer_id, customers(telegram_chat_id)')
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  // Verificar que el cliente que cancela es el dueño del pedido
  const customer = (order as any).customers;
  if (customer?.telegram_chat_id !== chatId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Solo se puede cancelar si el pedido está en pending o confirmed
  const cancellableStatuses = ['pending', 'confirmed'];
  if (!cancellableStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `No se puede cancelar un pedido en estado: ${order.status}` },
      { status: 400 }
    );
  }

  // Cancelar el pedido
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Notificar al administrador por Telegram si está configurado
  const adminId = process.env.ADMIN_CHAT_ID;
  if (adminId && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { Telegraf } = await import('telegraf');
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
      await bot.telegram.sendMessage(
        adminId,
        `⚠️ *Pedido Cancelado por el Cliente*\n\n📋 Código: *${shortId}*\n👤 Chat ID: ${chatId}\n\nEl cliente canceló su pedido desde el bot.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[cancel] Error notificando al admin:', e);
    }
  }

  const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
  return NextResponse.json({ success: true, orderId: id, shortId });
}
