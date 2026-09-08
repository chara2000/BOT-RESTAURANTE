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
    items?: Array<{ productName: string; quantity: number; unitPrice: number; variantName?: string; notes?: string; additions?: any[] }>,
    confirmedTotal?: number,
    confirmedDeliveryFee?: number,
    confirmedAddress?: string
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
        const adds = item.additions.map(a => `   └ 🧀 _+ ${a.name} ($${a.price.toLocaleString('es-CO')})_`).join('\n');
        block += '\n' + adds;
      }
      if (item.notes) {
        block += `\n   📝 _Nota: ${item.notes}_`;
      }
      return block;
    });

    const isDelivery = memory.delivery_mode !== 'pickup';
    const addressLine = confirmedAddress || memory.address || (isDelivery ? 'Carrera 19, El Centro, Puerto Tejada' : 'Recoger en el local (Shek Food)');
    const deliveryFeeVal = confirmedDeliveryFee !== undefined ? confirmedDeliveryFee : (memory.delivery_fee || 5000);

    // Calculate items subtotal fallback
    const itemsSubtotal = cartItems.reduce((sum, item) => {
      const additionsTotal = (item.additions || []).reduce((s: number, a: any) => s + (a.price || 0), 0);
      return sum + ((item.unitPrice + additionsTotal) * item.quantity);
    }, 0);

    // Rule 16: Ensure total is NEVER 0 and matches confirmed total / subtotal + fee
    const validTotal = (confirmedTotal !== undefined && confirmedTotal > 0)
      ? confirmedTotal
      : (memory.total > 0 ? memory.total : (itemsSubtotal + (isDelivery ? deliveryFeeVal : 0)));

    // Rule 25: Explicit payment method line in final confirmation
    let paymentLine = '💳 Método de pago: Efectivo contra entrega';
    if (memory.payment_method === 'transfer') {
      paymentLine = '💳 Método de pago: Transferencia (Nequi / Bancolombia)';
    } else if (memory.payment_method === 'card') {
      paymentLine = '💳 Método de pago: Datáfono / Tarjeta contra entrega';
    } else if (memory.payment_method === 'cash') {
      if (memory.cash_amount && memory.cash_amount > 0) {
        paymentLine = `💳 Método de pago: Efectivo (Pagas con: $${memory.cash_amount.toLocaleString('es-CO')} | Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})`;
      } else {
        paymentLine = '💳 Método de pago: Efectivo contra entrega';
      }
    }

    return [
      `🎉 ¡Pedido Confirmado!`,
      `📋 Código: ${orderCode}`,
      `📍 Dirección: ${addressLine}`,
      `🛒 Resumen de tu pedido:`,
      ...(itemsLines.length > 0 ? itemsLines : ['1. Productos seleccionados']),
      ...(isDelivery ? [`🛵 Domicilio: $${deliveryFeeVal.toLocaleString('es-CO')}`] : []),
      `💰 TOTAL: $${validTotal.toLocaleString('es-CO')}`,
      paymentLine,
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
   * Formats Order Status inquiry with short code, phase and estimated time (Rule 21)
   */
  public static buildOrderStatus(
    shortCode: string,
    status: string,
    total?: number,
    estimatedTime = '40–50 minutos',
    address?: string
  ): string {
    const statusMap: Record<string, { label: string; icon: string; desc: string }> = {
      pending: { label: 'Pendiente', icon: '⏳', desc: 'Recibido en sistema, pasando a cocina.' },
      confirmed: { label: 'Confirmado', icon: '✅', desc: 'En cola para iniciar preparación.' },
      preparing: { label: 'En preparación', icon: '🍳', desc: 'Cocinando tus platillos con el mejor sabor.' },
      ready: { label: 'Listo', icon: '🛍️', desc: 'Empacado y listo para entregar / recoger.' },
      shipping: { label: 'En camino', icon: '🛵', desc: 'El repartidor va rumbo a tu dirección.' },
      delivered: { label: 'Entregado', icon: '🎉', desc: '¡Pedido entregado! Que lo disfrutes mucho.' },
      cancelled: { label: 'Cancelado', icon: '❌', desc: 'El pedido fue cancelado.' },
    };
    const current = statusMap[status.toLowerCase()] || { label: status, icon: '📋', desc: 'Procesando tu pedido en cocina.' };

    return [
      `📦 *Estado de tu pedido (${shortCode})*`,
      ``,
      `👉 *Fase actual:* ${current.icon} *${current.label}*`,
      `ℹ️ _${current.desc}_`,
      `⏱️ *Tiempo estimado:* ${estimatedTime}`,
      ...(total ? [`💰 *Total:* $${Number(total).toLocaleString('es-CO')}`] : []),
      ...(address ? [`📍 *Dirección:* ${address}`] : []),
      ``,
      `¿Deseas seguir al repartidor en vivo? Escribe *rastreo* o *dónde viene* 🛵✨`,
    ].join('\n');
  }

  /**
   * Formats Order Tracking inquiry with live GPS map link (Rule 21)
   */
  public static buildOrderTracking(
    shortCode: string,
    orderId: string,
    status?: string,
    address?: string
  ): string {
    const trackingUrl = `https://bot-restaurante-sigma.vercel.app/public/rastreo/${orderId}`;
    const isShipping = status?.toLowerCase() === 'shipping';

    return [
      `🛵💨 *Rastreo y Ubicación en Tiempo Real (${shortCode})*`,
      ``,
      isShipping
        ? `📍 Tu repartidor ya va en camino hacia tu dirección${address ? ` (*${address}*)` : ''}.`
        : `🍳 Tu pedido se encuentra en cocina y saldrá con el repartidor tan pronto esté recién preparado.`,
      ``,
      `Puedes ver el mapa interactivo y recorrido en tiempo real aquí:`,
      `🌐 *Mapa en vivo:*`,
      trackingUrl,
      ``,
      `¡Llegará calientito y listo para disfrutar! 🍟🍔🔥`,
    ].join('\n');
  }

  /**
   * Formats Order Details for an already confirmed order (Rule 20)
   */
  public static buildOrderDetails(
    shortCode: string,
    order: any,
    memory?: StructuredMemory
  ): string {
    const orderId = order?.id || memory?.order_id || shortCode;
    const trackingUrl = `https://bot-restaurante-sigma.vercel.app/public/rastreo/${orderId}`;
    const total = order?.total || memory?.total || 0;
    const address = order?.delivery_address || memory?.address || 'Dirección registrada';

    // Extract payment details
    const notes = order?.notes || '';
    let paymentInfo = 'Efectivo';
    if (notes.includes('[TRANSFERENCIA]')) {
      paymentInfo = 'Transferencia Bancaria';
    } else if (notes.includes('[EFECTIVO]')) {
      const matchPaid = notes.match(/Pagó con:\s*\$([0-9.,]+)/i);
      const matchChange = notes.match(/Devuelta:\s*\$([0-9.,]+)/i);
      if (matchPaid && matchChange) {
        paymentInfo = `Efectivo (Pagas con: $${matchPaid[1]} | Devuelta: $${matchChange[1]})`;
      } else if (memory?.cash_amount) {
        paymentInfo = `Efectivo (Pagas con: $${memory.cash_amount.toLocaleString('es-CO')} | Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})`;
      }
    } else if (memory?.payment_method === 'cash') {
      paymentInfo = `Efectivo (Pagas con: $${(memory.cash_amount || total).toLocaleString('es-CO')} | Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})`;
    } else if (memory?.payment_method === 'transfer') {
      paymentInfo = 'Transferencia Bancaria';
    }

    const items = order?.order_items || [];
    const itemsLines = items.map((oi: any, idx: number) => {
      const pName = oi.products?.name || oi.product_name || `Producto #${idx + 1}`;
      const lineTotal = Number(oi.total_price || (oi.unit_price * (oi.quantity || 1)) || 0);
      return `• *${pName}* ×${oi.quantity || 1} — $${lineTotal.toLocaleString('es-CO')}`;
    });

    return [
      `📋✨ *DETALLES DE TU PEDIDO ENVIADO A COCINA* ✨📋`,
      `Código: *${shortCode}*`,
      ``,
      ...(itemsLines.length > 0 ? itemsLines : ['• Productos de tu orden confirmada']),
      ``,
      `💰 *Total:* $${Number(total).toLocaleString('es-CO')}`,
      `💳 *Método de pago:* ${paymentInfo}`,
      `📍 *Dirección de entrega:* ${address}`,
      `🍳 *Estado actual:* Enviado a cocina`,
      ``,
      `🌐 *Rastreo en mapa:* ${trackingUrl}`,
      ``,
      `Tu pedido ya está confirmado y en preparación. ¡Muchas gracias por preferir Shek Food! 🍟❤️`,
    ].join('\n');
  }

  /**
   * Translates backend error codes into warm, friendly Colombian messages (Rule 18)
   */
  public static formatFriendlyErrorMessage(rawError: string, memory?: StructuredMemory): string {
    if (!rawError) {
      return '¡Ups! 🙈 Tuve un pequeño inconveniente. ¿Podrías indicármelo de nuevo? 🍟✨';
    }

    const upper = rawError.toUpperCase();

    if (upper.includes('MONTO_INSUFICIENTE')) {
      return 'El valor con el que vas a pagar no alcanza para cubrir el total del pedido 💵. Por favor indícanos un valor suficiente o si prefieres pagar por transferencia. 🍟✨';
    }

    if (upper.includes('FALTA_METODO_PAGO')) {
      return '¿Cómo prefieres realizar el pago de tu pedido? 💳 Aceptamos *Efectivo* contra entrega o *Transferencia* (Nequi / Bancolombia). 🍟✨';
    }

    if (upper.includes('FALTA_MONTO_EFECTIVO')) {
      return 'Vas a pagar en efectivo 💵. ¿Con cuánto dinero vas a pagar para calcular y llevarte tu devuelta exacta? 🔄✨';
    }

    if (upper.includes('ORDER_ALREADY_CONFIRMED')) {
      const code = memory?.order_code || memory?.last_order_code || '';
      return `Tu pedido${code ? ` (*${code}*)` : ''} ya fue confirmado y se encuentra en cocina. 🍳 Si deseas saber cómo va, escribe *¿cómo va mi pedido?* o consulta su *rastreo*. 🛵✨`;
    }

    if (upper.includes('ORDER_NOT_FOUND')) {
      return 'No encontré ningún pedido con ese código 😕. Por favor verifica tu código de pedido (ejemplo: *T-XXXX*) o cuéntame si deseas hacer un pedido nuevo. 🍟✨';
    }

    if (upper.includes('ORDER_CANNOT_BE_CANCELLED')) {
      return 'Tu pedido ya se encuentra en camino o fue entregado, por lo que no es posible cancelarlo en este momento. 🛵 Si requieres ayuda, con gusto te comunico con un asesor. 🙋';
    }

    if (upper.includes('CART_EMPTY')) {
      return 'Tu carrito está vacío en este momento. 🛒🍟 Escribe *carta* para ver nuestro menú completo o cuéntame qué delicia se te antoja probar hoy. 😋✨';
    }

    if (upper.includes('PRODUCT_NOT_FOUND')) {
      return 'No encontré ese producto en nuestra carta oficial 😕. Escribe *carta* para enviarte nuestro menú completo en PDF con todas nuestras opciones reales. 🍟✨';
    }

    if (upper.includes('STOCK_UNAVAILABLE')) {
      return 'Ese platillo se nos agotó en este momento 🙈. ¿Te gustaría elegir otra deliciosa opción de nuestra carta? 🍟😋';
    }

    if (upper.includes('FALTA_DIRECCION')) {
      return 'Para enviarte el pedido a domicilio necesitamos tu dirección completa 📍 (barrio y nomenclatura en Puerto Tejada). ¿A qué dirección te lo llevamos? 🛵💨';
    }

    if (upper.includes('DUPLICATE_LINES_DETECTED')) {
      return '🙋 Notamos una inconsistencia de líneas repetidas en el pedido. Para garantizar que tu orden sea exacta, te transferí con un asesor humano que te confirmará de inmediato. ¡Muchas gracias! ❤️';
    }

    if (upper.includes('AMBIGUOUS_PRODUCT_MENTION')) {
      return '¿Qué producto y cuántas unidades te gustaría pedir? 🍟✨ Escribe *carta* para ver nuestro menú completo o indícanos el plato exacto que deseas. 😋';
    }

    if (upper.includes('PRODUCT_NOT_MENTIONED')) {
      return '¿Qué platillo y cuántas unidades te gustaría pedir? 🍟✨ Escribe *carta* para ver nuestro menú completo o indícanos el producto que deseas ordenar. 😋';
    }

    if (upper.includes('DIGITAL_PAYMENT_NO_CHANGE')) {
      const exact = memory?.total ? `$${memory.total.toLocaleString('es-CO')}` : 'el valor exacto';
      return `Para pagos por transferencia o Nequi debes transferir ${exact} y enviarnos el comprobante por aquí 📲✨. No necesitas indicar cambio ni devuelta.`;
    }

    // Clean any technical code names like [A-Z_]{3,} or JSON artifacts
    let cleaned = rawError
      .replace(/[A-Z0-9_]{4,}:\s*/g, '')
      .replace(/[{}\[\]"]/g, '')
      .trim();

    if (!cleaned || /^[A-Z0-9_]+$/.test(cleaned) || cleaned.includes('error') || cleaned.includes('Error')) {
      return 'Tuvimos un pequeño inconveniente procesando tu solicitud 🙈. Por favor indícanos nuevamente qué deseas o escribe *asesor* si requieres ayuda. 🍟❤️';
    }

    return cleaned;
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
