import { StructuredMemory } from '@/conversations/conversation.types';

export class ResponseBuilder {
  /**
   * Formats an Order Review summary when customer asks to see the order or enters review state
   */
  public static buildOrderReview(memory: StructuredMemory): string {
    const itemsLines = memory.cart.map(item => {
      const emoji = item.productName.toLowerCase().includes('granizado') ? '🍧' : '🍟';
      const lineTotal = item.unitPrice * item.quantity;
      return `${emoji} *${item.productName}* ×${item.quantity} — $${lineTotal.toLocaleString('es-CO')}`;
    });

    const feeLine = memory.delivery_mode === 'delivery' && memory.delivery_fee > 0
      ? `🛵 *Domicilio* — $${memory.delivery_fee.toLocaleString('es-CO')}`
      : '🏪 *Entrega* — Para recoger en el local';

    let paymentInfo = '';
    if (memory.payment_method === 'cash') {
      const cashStr = memory.cash_amount ? `$${memory.cash_amount.toLocaleString('es-CO')}` : 'Por definir';
      const changeStr = memory.change_amount !== undefined ? `$${memory.change_amount.toLocaleString('es-CO')}` : 'Exacto';
      paymentInfo = [
        `💵 *Pago:* Efectivo`,
        `💸 *Pagas con:* ${cashStr}`,
        `🔄 *Devuelta:* ${changeStr}`,
      ].join('\n');
    } else if (memory.payment_method === 'transfer') {
      paymentInfo = '📲 *Pago:* Transferencia Bancaria (Nequi / Bancolombia)';
    } else {
      paymentInfo = '💳 *Pago:* Contra entrega';
    }

    const addressInfo = memory.address ? `📍 *Dirección:* ${memory.address}` : '📍 *Dirección:* Por confirmar';

    return [
      `📦✨ *RESUMEN DE TU PEDIDO EN SHEK FOOD* ✨📦`,
      ``,
      ...itemsLines,
      feeLine,
      ``,
      `💰 *TOTAL A PAGAR: $${memory.total.toLocaleString('es-CO')}*`,
      ``,
      paymentInfo,
      addressInfo,
      ``,
      `¿Deseas confirmar tu pedido? Escribe *Confirmo* o *Sí* para prepararlo de inmediato. 🍟🔥`,
    ].join('\n');
  }

  /**
   * Formats Order Confirmation receipt
   */
  public static buildOrderConfirmed(memory: StructuredMemory, orderCode: string): string {
    return [
      `🎉🍟 *¡PEDIDO CONFIRMADO CON ÉXITO!* 🍟🎉`,
      ``,
      `📦 *Código de Pedido: #${orderCode}*`,
      `💰 *Total:* *$${memory.total.toLocaleString('es-CO')}*`,
      memory.delivery_mode === 'delivery'
        ? `🛵 Tu pedido está en cocina y pronto un repartidor saldrá hacia tu dirección. ¡Te avisaremos cuando esté en camino!`
        : `🏪 ¡Excelente! Tu orden se está alistando para que la recojas caliente y fresca en nuestro local.`,
      ``,
      `¡Muchas gracias por preferir Shek Food! ❤️🔥`,
    ].join('\n');
  }

  /**
   * Formats closed restaurant notice with schedule
   */
  public static buildRestaurantClosed(formattedHours: string): string {
    return [
      `🌙 *¡Hola! En este momento nuestro local está cerrado.*`,
      ``,
      `🕒 *Nuestros horarios de atención son:*`,
      formattedHours,
      ``,
      `📄 ¡Pero no te preocupes! Puedes ver nuestra carta completa en PDF para ir antojándote de tu próximo pedido. 🍟🍔🥤`,
      `Escribe *carta* para verla o *menú* para explorar nuestros platos. ✨`,
    ].join('\n');
  }

  /**
   * Formats 1-hour cart abandonment reminder
   */
  public static buildAbandonmentReminder(customerName?: string, cartSummary?: string): string {
    const greeting = customerName ? `¡Hola ${customerName}! 👋` : '¡Hola! 👋';
    return [
      `${greeting}`,
      `Notamos que dejaste estos deliciosos platillos esperando en tu carrito: 🛒🍟`,
      ``,
      cartSummary || 'Tus productos seleccionados en Shek Food',
      ``,
      `¿Deseas continuar con tu pedido antes de que se libere tu reserva? 😋✨`,
      `Responde *Sí* para continuar o *Cancelar* si prefieres ordenar más tarde. ❤️`,
    ].join('\n');
  }

  /**
   * Builds friendly recovery message with warm emojis
   */
  public static buildErrorMessage(): string {
    return '¡Ups! 🙈 Tuve un pequeño pestañeo de conexión, pero ya estoy 100% activo. 🍟✨ ¿Qué te gustaría pedir o consultar en este momento? 😋';
  }
}
