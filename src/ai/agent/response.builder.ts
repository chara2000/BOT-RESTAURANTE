import { StructuredMemory } from '@/conversations/conversation.types';

export class ResponseBuilder {
  /**
   * Formats an Order Review summary when customer asks to see the order or enters review state
   */
  public static buildOrderReview(memory: StructuredMemory): string {
    // 1. Lista de productos (con adiciones/notas debajo de cada uno)
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

    // 2. Subtotal
    const subtotalLine = `🛒 *Subtotal:* $${memory.subtotal.toLocaleString('es-CO')}`;

    // 3. Costo de domicilio
    let feeLine = '';
    if (memory.delivery_mode === 'pickup') {
      feeLine = '🛵 *Costo de domicilio:* $0 (Para recoger en local Shek Food)';
    } else if (memory.delivery_mode === 'delivery') {
      feeLine = memory.delivery_fee > 0
        ? `🛵 *Costo de domicilio:* $${memory.delivery_fee.toLocaleString('es-CO')}`
        : '🛵 *Costo de domicilio:* $5.000 (Sujeto a confirmación de dirección)';
    } else {
      feeLine = memory.delivery_fee > 0
        ? `🛵 *Costo de domicilio:* $${memory.delivery_fee.toLocaleString('es-CO')}`
        : '🛵 *Costo de domicilio:* $5.000 (A domicilio o puedes recoger en local)';
    }

    // 4. Total
    const totalLine = `💰 *Total:* $${memory.total.toLocaleString('es-CO')}`;

    // 5. Dirección registrada
    const addressLine = memory.address
      ? `📍 *Dirección registrada:* ${memory.address}`
      : '📍 *Dirección registrada:* Por registrar';

    // 6. Método de pago
    let paymentLine = '';
    if (memory.payment_method === 'cash') {
      if (memory.cash_amount) {
        paymentLine = `💳 *Método de pago:* Efectivo (Pagas con: $${memory.cash_amount.toLocaleString('es-CO')} | Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})`;
      } else {
        paymentLine = `💳 *Método de pago:* Efectivo (Indícanos con cuánto pagas para calcular tu devuelta)`;
      }
    } else if (memory.payment_method === 'transfer') {
      paymentLine = '💳 *Método de pago:* Transferencia Bancaria (Nequi / Bancolombia)';
    } else {
      paymentLine = '💳 *Método de pago:* Por definir (Efectivo o Transferencia)';
    }

    // Formato estricto según Regla 7
    return [
      `📦✨ *RESUMEN DE TU PEDIDO EN SHEK FOOD* ✨📦`,
      ``,
      ...itemsLines,
      ``,
      subtotalLine,
      feeLine,
      totalLine,
      addressLine,
      paymentLine,
      ``,
      `¿Deseas agregar algo más o confirmamos tu pedido? 🍟🔥`,
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
   * Generates a warm, appetizing Colombian welcome greeting with 3 options (Rule 1)
   */
  public static buildWelcomeGreeting(restaurantName = 'Shek Food'): string {
    return [
      `¡Hola! 👋 Te damos una cálida bienvenida a *${restaurantName}* 🍟🍔🥤`,
      `📄 Aquí tienes adjunta nuestra carta oficial completa en PDF con fotos, platillos y precios. ✨`,
      ``,
      `¿En qué te podemos colaborar hoy?`,
      `1️⃣ *Ver la carta* 📄`,
      `2️⃣ *Armar tu pedido* 🍟 (Salchipapas Shek, Hamburguesas, Granizados)`,
      `3️⃣ *Consultar domicilio* 🛵`,
      ``,
      `Cuéntame qué se te antoja o cuál opción prefieres y con muchísimo gusto te atendemos. 😋❤️`,
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
