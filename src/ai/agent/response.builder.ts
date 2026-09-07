import { StructuredMemory } from '@/conversations/conversation.types';

export class ResponseBuilder {
  /**
   * Formats an Order Review summary when customer asks to see the order or enters review state
   */
  public static buildOrderReview(memory: StructuredMemory): string {
    const itemsLines = memory.cart.map(item => {
      const emoji = item.productName.toLowerCase().includes('granizado') ? '🍧' : '🍟';
      const additionsTotal = (item.additions || []).reduce((sum, a) => sum + (a.price || 0), 0);
      const lineUnitPrice = item.unitPrice + additionsTotal;
      const lineTotal = lineUnitPrice * item.quantity;
      let itemBlock = `${emoji} *${item.productName}* ×${item.quantity} — $${lineTotal.toLocaleString('es-CO')}`;
      if (item.additions && item.additions.length > 0) {
        const adds = item.additions.map(a => `   └ 🧀 _+ ${a.name} ($${a.price.toLocaleString('es-CO')})_`).join('\n');
        itemBlock += '\n' + adds;
      }
      if (item.notes) {
        itemBlock += `\n   📝 _Nota: ${item.notes}_`;
      }
      return itemBlock;
    });

    let feeLine = '';
    if (memory.delivery_mode === 'pickup') {
      feeLine = '🏪 *Entrega:* Para recoger en el local (Shek Food)';
    } else if (memory.delivery_mode === 'delivery') {
      feeLine = memory.delivery_fee > 0
        ? `🛵 *Domicilio:* $${memory.delivery_fee.toLocaleString('es-CO')}`
        : '🛵 *Domicilio:* Por liquidar según tu dirección';
    } else {
      feeLine = '🛵 *Entrega:* A domicilio (O puedes recoger en el local)';
    }

    let paymentInfo = '';
    if (memory.payment_method === 'cash') {
      if (memory.cash_amount) {
        if (memory.cash_amount < memory.total) {
          paymentInfo = [
            `💵 *Pago:* Efectivo`,
            `⚠️ *Pagas con:* $${memory.cash_amount.toLocaleString('es-CO')} (⚠️ Monto menor al total de $${memory.total.toLocaleString('es-CO')})`,
            `🔄 *Devuelta:* Por favor indícanos un valor igual o mayor al total`,
          ].join('\n');
        } else {
          const changeVal = memory.change_amount !== undefined
            ? memory.change_amount
            : (memory.cash_amount - memory.total);
          paymentInfo = [
            `💵 *Pago:* Efectivo`,
            `💸 *Pagas con:* $${memory.cash_amount.toLocaleString('es-CO')}`,
            `🔄 *Devuelta:* $${changeVal.toLocaleString('es-CO')}`,
          ].join('\n');
        }
      } else {
        paymentInfo = [
          `💵 *Pago:* Efectivo`,
          `💸 *Pagas con:* Por definir (indícanos con cuánto pagas para calcular tu cambio)`,
        ].join('\n');
      }
    } else if (memory.payment_method === 'transfer') {
      paymentInfo = '📲 *Pago:* Transferencia Bancaria (Nequi / Bancolombia)';
    } else {
      paymentInfo = '💳 *Pago:* Contra entrega (Efectivo o Transferencia)';
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
   * Formats Order Confirmation receipt with live tracking URL and UX/UI
   */
  public static buildOrderConfirmed(
    memory: StructuredMemory,
    orderCode: string,
    orderId?: string,
    items?: Array<{ productName: string; quantity: number; unitPrice: number; variantName?: string; notes?: string; additions?: any[] }>
  ): string {
    const trackingId = orderId || memory.order_id || orderCode;
    const trackingUrl = `https://bot-restaurante-sigma.vercel.app/public/rastreo/${trackingId}`;

    // Format items list
    const cartItems = items && items.length > 0 ? items : memory.cart;
    const itemsLines = cartItems.map((item, idx) => {
      const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
      const additionsTotal = (item.additions || []).reduce((sum: number, a: any) => sum + (a.price || 0), 0);
      const lineTotal = (item.unitPrice + additionsTotal) * item.quantity;
      let block = `${idx + 1}. *${name}* x${item.quantity} — $${lineTotal.toLocaleString('es-CO')}`;
      if (item.additions && item.additions.length > 0) {
        const adds = item.additions.map((a: any) => `   └ 🧀 _+ ${a.name} ($${a.price.toLocaleString('es-CO')})_`).join('\n');
        block += '\n' + adds;
      }
      if (item.notes) {
        block += `\n   📝 _Nota: ${item.notes}_`;
      }
      return block;
    });

    const isDelivery = memory.delivery_mode !== 'pickup';
    const addressLine = isDelivery
      ? (memory.address || 'Carrera 19, El Centro, Puerto Tejada')
      : 'Recoger en el local (Shek Food)';

    return [
      `🎉 ¡Pedido Confirmado!`,
      `📋 Código: ${orderCode}`,
      `📍 Dirección: ${addressLine}`,
      `🛒 Resumen de tu pedido:`,
      ...(itemsLines.length > 0 ? itemsLines : ['1. Productos seleccionados']),
      ...(isDelivery ? [`🛵 Domicilio: $${(memory.delivery_fee || 5000).toLocaleString('es-CO')}`] : []),
      `💰 TOTAL: $${memory.total.toLocaleString('es-CO')}`,
      `⏱️ Tiempo estimado: 50–70 minutos`,
      `📡 Puedes rastrear tu pedido en tiempo real con el botón de abajo.`,
      `¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
      ``,
      `🌐 *Rastreo en tiempo real (Mapa en vivo):*`,
      trackingUrl,
    ].join('\n');
  }

  /**
   * Generates a warm, appetizing, and commercial Colombian welcome greeting
   */
  public static buildWelcomeGreeting(restaurantName = 'Shek Food'): string {
    return [
      `¡Hola! 👋 Qué alegría saludarte. Te damos una cálida bienvenida a *${restaurantName}* 🍟🍔🥤`,
      `¡Los mejores sabores, salchipapas cargadas y granizados refrescantes listos para ti! 🔥✨`,
      ``,
      `¿Qué se te antoja hoy? Puedes elegir:`,
      `📄 1. Ver nuestra *Carta oficial en PDF* con fotos y precios`,
      `🍟 2. Armar tu *Pedido* (Salchipapas Shek, Hamburguesas, Granizados)`,
      `🛵 3. Consultar cobertura y costo de *Domicilio*`,
      ``,
      `Escribe lo que prefieras o cuéntame qué deseas pedir y con muchísimo gusto te atiendo. 😋❤️`,
    ].join('\n');
  }

  /**
   * Formats Order Status inquiry with short code and live tracking
   */
  public static buildOrderStatus(
    shortCode: string,
    status: string,
    total: number,
    orderId: string,
    address?: string
  ): string {
    const statusMap: Record<string, string> = {
      pending: '⏳ Pendiente (Esperando confirmación)',
      confirmed: '✅ Confirmado (En cola de preparación)',
      preparing: '🍳 En preparación (Cocinando con amor)',
      ready: '🛍️ Listo para entregar / recoger',
      shipping: '🛵 En camino (Repartidor asignado)',
      delivered: '🎉 ¡Entregado! Que lo disfrutes mucho',
      cancelled: '❌ Cancelado',
    };
    const statusLabel = statusMap[status.toLowerCase()] || status;
    const trackingUrl = `https://bot-restaurante-sigma.vercel.app/public/rastreo/${orderId}`;

    return [
      `📦 *Estado de tu pedido (${shortCode})*`,
      ``,
      `👉 *Estado actual:* ${statusLabel}`,
      `💰 *Total:* $${Number(total).toLocaleString('es-CO')}`,
      ...(address ? [`📍 *Dirección:* ${address}`] : []),
      ``,
      `🌐 *Rastreo en tiempo real (Mapa en vivo):*`,
      trackingUrl,
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
