import { NextResponse } from 'next/server';
import { notifyOrderStatusChange } from '@/lib/n8n/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import type { OrderStatus } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const status = body.status as OrderStatus;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select('id, status, notes, customers(telegram_chat_id)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notificar al cliente por Telegram si tiene telegram_chat_id configurado
  const customer = (data as any)?.customers;
  const telegramChatId = customer?.telegram_chat_id;
  if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { Telegraf } = await import('telegraf');
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      const shortId = data.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${data.id.slice(0, 6).toUpperCase()}`;
      
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
      
      if (status === 'shipping') {
        msg += `\n\n🛵 ¡Tu pedido ya va en camino! Puedes rastrear la ubicación del repartidor en tiempo real o consultar el bot de Telegram en la sección de rastreo.`;
      }

      await bot.telegram.sendMessage(telegramChatId, msg, { parse_mode: 'Markdown' });
    } catch (telegramErr) {
      console.error('[status route] Error enviando mensaje a Telegram:', telegramErr);
    }
  }

  await notifyOrderStatusChange(id, status);

  return NextResponse.json(data);
}
