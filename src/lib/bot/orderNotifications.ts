/**
 * Notificación automática del estado del pedido al cliente (Telegram y WhatsApp).
 * Funciona multi-tenant consultando los tokens de tenant_settings o variables de entorno.
 */

import { createClient } from '@supabase/supabase-js';
import { Telegraf } from 'telegraf';
import { sendWhatsAppMessage, getTenantCreds, isBSUID } from './whatsapp';
import type { OrderStatus } from '@/types';

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export interface NotificationResult {
  success: boolean;
  channel?: 'telegram' | 'whatsapp' | 'both' | 'none';
  error?: string;
}

export async function notifyCustomerOrderStatus(
  orderId: string,
  status: OrderStatus,
  customMsg?: string
): Promise<NotificationResult> {
  try {
    const supabase = getSupabase();

    // 1. Obtener la orden con el cliente asociado
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, notes, total, delivery_address, delivery_pin, tracking_token, customer_id, tenant_id, customers(id, name, phone, telegram_chat_id, whatsapp_id)')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.warn(`[notifyCustomerOrderStatus] Orden no encontrada: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    const tenantId = order.tenant_id || 'a0000000-0000-4000-8000-000000000001';
    const customer = (order as any).customers;

    // 2. Extraer canal y destinatario
    let telegramChatId: string | null = customer?.telegram_chat_id || null;
    let whatsappRecipient: string | null = customer?.whatsapp_id || null;

    // Buscar en las notas del pedido: [CHAT_ID: ...]
    if (order.notes) {
      const match = order.notes.match(/\[CHAT_ID:\s*([^\]\s]+)\]/i);
      if (match) {
        const rawChatId = match[1];
        if (isBSUID(rawChatId) || rawChatId.startsWith('+') || rawChatId.length > 10) {
          if (!whatsappRecipient) whatsappRecipient = rawChatId;
        } else if (/^-?\d+$/.test(rawChatId)) {
          if (!telegramChatId) telegramChatId = rawChatId;
        }
      }
    }

    // Fallback con el teléfono del cliente
    if (!whatsappRecipient && customer?.phone && customer.phone !== 'Por registrar') {
      const cleanDigits = customer.phone.replace(/\D/g, '');
      if (cleanDigits.length >= 10) {
        whatsappRecipient = customer.phone;
      }
    }

    if (!telegramChatId && !whatsappRecipient) {
      console.warn(`[notifyCustomerOrderStatus] Sin destinatario de mensajería para orden ${orderId}`);
      return { success: false, channel: 'none' };
    }

    // 3. Formatear contenido del mensaje
    const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;

    const statusMap: Record<string, string> = {
      pending: '⏳ Pendiente (Esperando confirmación)',
      confirmed: '✅ Confirmado (En cola de preparación)',
      preparing: '🍳 En preparación (Cocinando con amor)',
      ready: '🛍️ Listo para entregar / recoger',
      shipping: '🛵 En camino (Repartidor asignado)',
      delivered: '🎉 ¡Entregado! Que lo disfrutes mucho',
      cancelled: '❌ Cancelado'
    };

    const statusText = statusMap[status] || status;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const trackingToken = order.tracking_token || order.id;
    const trackingUrl = `${baseUrl}/public/rastreo/${trackingToken}`;

    let messageBody = customMsg || `🔔 *Actualización de tu pedido (${shortId})*\n\nEl estado de tu orden ha cambiado a:\n👉 *${statusText}*`;

    if (status === 'shipping') {
      messageBody += `\n\n🛵 *¡Tu pedido ya va en camino!*`;
      if (order.delivery_pin) {
        messageBody += `\n\n🔑 *Código de Seguridad para la entrega:* *${order.delivery_pin}*\n_Por favor indícale este código al repartidor al recibir tu pedido._`;
      }
      messageBody += `\n\n📍 Puedes seguir la entrega en vivo aquí:\n${trackingUrl}`;
    } else if (status === 'preparing') {
      messageBody += `\n\n🍳 Nuestro equipo de cocina está alistando tus platillos frescos y calientes. ¡Te avisaremos cuando salga!`;
    } else if (status === 'delivered') {
      messageBody += `\n\n❤️ ¡Muchas gracias por tu compra! Esperamos que disfrutes tu comida.`;
    }

    // 4. Si el estado es 'delivered', buscar datos del repartidor para calificar
    let riderName: string | null = null;
    if (status === 'delivered') {
      try {
        const { data: dData } = await supabase
          .from('deliveries')
          .select('rider_id')
          .eq('order_id', orderId)
          .maybeSingle();

        if (dData?.rider_id) {
          const { data: rData } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', dData.rider_id)
            .maybeSingle();

          if (rData?.name) riderName = rData.name;
        }
      } catch {
        // Ignorar si no hay repartidor
      }
    }

    let sentTelegram = false;
    let sentWhatsApp = false;

    // ── NOTIFICAR POR TELEGRAM ──
    if (telegramChatId) {
      try {
        let botToken = process.env.TELEGRAM_BOT_TOKEN;
        const { data: tSettings } = await supabase
          .from('tenant_settings')
          .select('telegram_bot_token')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (tSettings?.telegram_bot_token) {
          botToken = tSettings.telegram_bot_token;
        }

        if (botToken) {
          const bot = new Telegraf(botToken);
          let inlineKeyboard: any = undefined;

          if (status === 'delivered' && riderName) {
            inlineKeyboard = {
              inline_keyboard: [
                [{ text: `⭐ Calificar a ${riderName}`, callback_data: `rate_rider:${orderId}:${riderName}` }],
                [{ text: '🍽️ Ver Menú', callback_data: 'menu' }]
              ]
            };
          } else if (status === 'shipping') {
            inlineKeyboard = {
              inline_keyboard: [
                [{ text: '📍 Rastrear en Vivo', url: trackingUrl }]
              ]
            };
          }

          await bot.telegram.sendMessage(telegramChatId, messageBody, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
          });
          sentTelegram = true;
          console.log(`[notifyCustomerOrderStatus] Telegram enviado a ${telegramChatId} para pedido ${shortId} (${status})`);
        }
      } catch (tgErr: any) {
        console.warn(`[notifyCustomerOrderStatus] Error enviando Telegram a ${telegramChatId}:`, tgErr?.message || tgErr);
      }
    }

    // ── NOTIFICAR POR WHATSAPP ──
    if (whatsappRecipient) {
      try {
        const creds = await getTenantCreds(tenantId);
        if (creds?.apiKey) {
          let buttons: Array<{ text: string; callback_data: string }> | undefined = undefined;

          if (status === 'delivered' && riderName) {
            buttons = [
              { text: `⭐ Calificar Servicio`, callback_data: `rate_rider:${orderId}:${riderName}` },
              { text: `🍽️ Ver Menú`, callback_data: 'menu' }
            ];
          } else if (status === 'shipping') {
            buttons = [
              { text: `🍽️ Ver Menú`, callback_data: 'menu' }
            ];
          }

          sentWhatsApp = await sendWhatsAppMessage({
            from: creds.phone || undefined,
            to: whatsappRecipient,
            text: messageBody,
            buttons,
            apiKey: creds.apiKey
          });
          if (sentWhatsApp) {
            console.log(`[notifyCustomerOrderStatus] WhatsApp enviado a ${whatsappRecipient} para pedido ${shortId} (${status})`);
          }
        }
      } catch (waErr: any) {
        console.warn(`[notifyCustomerOrderStatus] Error enviando WhatsApp a ${whatsappRecipient}:`, waErr?.message || waErr);
      }
    }

    const channel = sentTelegram && sentWhatsApp ? 'both' : (sentTelegram ? 'telegram' : (sentWhatsApp ? 'whatsapp' : 'none'));
    return { success: sentTelegram || sentWhatsApp, channel };
  } catch (err: any) {
    console.error('[notifyCustomerOrderStatus] Error global:', err);
    return { success: false, error: err?.message || 'Unknown error' };
  }
}
