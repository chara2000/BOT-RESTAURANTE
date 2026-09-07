import { StructuredMemory, BotActionResponse } from '@/conversations/conversation.types';

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
      ? `🛵 Domicilio — $${memory.delivery_fee.toLocaleString('es-CO')}`
      : '🏪 Entrega — Para recoger en el local';

    let paymentInfo = '';
    if (memory.payment_method === 'cash') {
      const cashStr = memory.cash_amount ? `$${memory.cash_amount.toLocaleString('es-CO')}` : 'Por definir';
      const changeStr = memory.change_amount !== undefined ? `$${memory.change_amount.toLocaleString('es-CO')}` : 'Exacto';
      paymentInfo = [
        `💵 Pago: Efectivo`,
        `💸 Pagas con: ${cashStr}`,
        `🔄 Cambio: ${changeStr}`,
      ].join('\n');
    } else if (memory.payment_method === 'transfer') {
      paymentInfo = '📲 Pago: Transferencia Bancaria (Nequi / Bancolombia)';
    } else {
      paymentInfo = '💳 Pago: Contra entrega';
    }

    const addressInfo = memory.address ? `📍 ${memory.address}` : '📍 Dirección por confirmar';

    return [
      `📦 *RESUMEN DE TU PEDIDO*`,
      ``,
      ...itemsLines,
      feeLine,
      ``,
      `💰 *TOTAL: $${memory.total.toLocaleString('es-CO')}*`,
      ``,
      paymentInfo,
      ``,
      addressInfo,
      ``,
      `¿Confirmas el pedido?`,
    ].join('\n');
  }

  /**
   * Formats Order Confirmation receipt
   */
  public static buildOrderConfirmed(memory: StructuredMemory, orderCode: string): string {
    return [
      `🎉 *¡Pedido confirmado!*`,
      ``,
      `📦 *Pedido #${orderCode}*`,
      `💰 Total: *$${memory.total.toLocaleString('es-CO')}*`,
      memory.delivery_mode === 'delivery'
        ? `🛵 Estamos preparando tu pedido con mucho cariño y pronto irá en camino a tu dirección.`
        : `🏪 Te esperamos en nuestro local cuando esté listo.`,
      ``,
      `¡Muchas gracias por elegir Shek Food! 🔥❤️`,
    ].join('\n');
  }

  /**
   * Builds friendly error recovery message
   */
  public static buildErrorMessage(): string {
    return 'No pude completar esa acción en este momento. 😕 ¿Quieres que lo intentemos nuevamente?';
  }
}
