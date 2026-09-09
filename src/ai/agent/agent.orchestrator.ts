import { BotActionResponse } from '@/conversations/conversation.types';
import { ConversationService } from '@/conversations/conversation.service';
import { MemoryService } from '@/conversations/memory.service';
import { StateService } from '@/conversations/state.service';
import { ContextBuilder } from '../prompts/context.builder';
import { OpenAIService } from '../openai/openai.service';
import { AGENT_TOOLS } from '../tools/tool.definitions';
import { AIGuard } from '../ai-guard/ai.guard';
import { ToolExecutor } from '../tools/tool.executor';
import { ResponseBuilder } from './response.builder';
import { RestaurantService } from '@/backend/restaurant.service';
import { CatalogService } from '@/backend/catalog.service';

export class AgentOrchestrator {
  /**
   * High-Performance Single-Turn Agentic AI loop:
   * IA INTERPRETA -> TOOL EJECUTA -> BACKEND CONFIRMA Y FORMATEA -> RESPUESTA INMEDIATA (~0.8s)
   */
  public static async processMessage(
    tenantId: string,
    phone: string,
    userText: string,
    customerName?: string,
    extra?: {
      location?: { latitude: number; longitude: number };
    }
  ): Promise<BotActionResponse> {
    const memory = await ConversationService.getConversation(tenantId, phone, customerName);

    // Ensure session is clean and active
    memory.handoff_status = false;
    if (memory.current_state === 'HUMAN_HANDOFF') {
      StateService.transition(memory, 'WELCOME');
    }

    // 1. Fetch restaurant settings, business hours and PDF menu
    const settings = await RestaurantService.getSettings(tenantId);
    const isOpen = RestaurantService.isRestaurantOpen(settings?.business_hours);
    const formattedHours = RestaurantService.formatBusinessHours(settings?.business_hours);
    const menuPdfUrl = settings?.menu_pdf_url || (settings?.logo_url?.toLowerCase().includes('.pdf') ? settings.logo_url : null);

    // 2. Handle button callback payloads if received from interactive buttons
    if (userText.startsWith('TRACK_') || userText === 'TRACK_ORDER') {
      const targetId = userText.startsWith('TRACK_') && userText !== 'TRACK_ORDER'
        ? userText.replace('TRACK_', '').trim()
        : (memory.order_code || memory.order_id || '');
      userText = `¿Cuál es el estado de mi pedido ${targetId}?`;
    } else if (userText === 'HUMAN_HANDOFF') {
      userText = 'Por favor quiero hablar con un asesor humano';
    }

    // 3. Clean and normalize input for fast routing
    const cleanNormalized = userText.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¡!¿?.,]/g, '');

    // Fast-path: Greetings (warm Colombian welcome + sends PDF menu automatically per Rule 1)
    const isGreeting = /^(hola|buenas|buenas tardes|buenos dias|buenas noches|buen dia|hey|ola|saludos|inicio|que tal)\b/i.test(cleanNormalized) ||
      cleanNormalized.startsWith('hola') ||
      cleanNormalized.startsWith('buenas') ||
      cleanNormalized.startsWith('buenos dias') ||
      cleanNormalized.startsWith('buenas tardes') ||
      cleanNormalized.startsWith('buenas noches');
    const isSessionStale = (Date.now() - (memory.last_activity || 0)) > 10 * 60 * 1000;
    if (isGreeting && (memory.cart.length === 0 || isSessionStale || memory.current_state === 'ORDER_CONFIRMED' || memory.history.length === 0)) {
      memory.cart = [];
      memory.subtotal = 0;
      memory.delivery_fee = 0;
      memory.total = 0;
      memory.payment_method = undefined;
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
      memory.history = [];
      memory.summary = '';
      memory.current_state = 'WELCOME';
      memory.cart_id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const pdfUrl = menuPdfUrl || (await CatalogService.getMenuPdf(tenantId));
      const reply = ResponseBuilder.buildWelcomeGreeting('Shek Food');
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return {
        text: reply,
        document_url: pdfUrl || undefined,
        document_filename: 'Carta_Shek_Food.pdf',
        document_caption: '📄 Carta oficial de Shek Food en PDF 🍟✨',
      };
    }

    // Fast-path: Explicit Reset / Forget Current Cart (Rule 23)
    const isResetRequest = /^(olvidate|olvidate de los pedidos anteriores|olvida los pedidos anteriores|borrar pedido|cancelar pedido|reiniciar|empezar de nuevo|nuevo pedido|vaciar carrito|limpiar|olvidar)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('olvidate') ||
      cleanNormalized.includes('pedidos anteriores') ||
      cleanNormalized.includes('empezar de nuevo') ||
      cleanNormalized.includes('nuevo pedido');
    if (isResetRequest) {
      memory.cart = [];
      memory.subtotal = 0;
      memory.delivery_fee = 0;
      memory.total = 0;
      memory.payment_method = undefined;
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
      // Rule 23: Confirmed orders are NEVER wiped or affected by clearing cart
      memory.history = [];
      memory.summary = '';
      if (!memory.order_code) {
        memory.current_state = 'WELCOME';
      }
      memory.cart_id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const hasConfirmedOrder = Boolean(memory.order_code || memory.last_order_code);
      const reply = hasConfirmedOrder
        ? `¡Listo! ✨ He vaciado tu carrito actual y pedido en curso. (Tu pedido confirmado *${memory.order_code || memory.last_order_code}* en cocina sigue su curso normal 🛵). 🍟🍔🥤\n\n¿Qué se te antoja ordenar ahora? Escribe *carta* para ver el menú o dime qué platillo deseas. 😋❤️`
        : '¡Listo! ✨ He vaciado tu carrito actual y pedido en curso. 🍟🍔🥤\n\n¿Qué se te antoja ordenar hoy? Puedes pedirme la *carta* o decirme directamente qué platillo deseas. 😋❤️';
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Order Status Inquiry (Rule 21: phase + ETA, distinct from tracking map)
    const isOrderStatusRequest = /^(como va mi pedido|como va el pedido|estado de mi pedido|estado del pedido|en que va mi pedido|como va la orden|estado orden|status)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('como va mi pedido') ||
      cleanNormalized.includes('estado de mi pedido') ||
      cleanNormalized.includes('en que va mi pedido');
    if (isOrderStatusRequest) {
      const activeOrderCode = memory.order_code || memory.last_order_code;
      if (activeOrderCode || StateService.isOrderPlaced(memory.current_state)) {
        const orderResult = await ToolExecutor.execute(tenantId, memory, 'get_order_status', { order_id: activeOrderCode });
        if (orderResult.success && orderResult.data) {
          const reply = ResponseBuilder.buildOrderStatus(
            orderResult.data.order_code,
            orderResult.data.status,
            orderResult.data.total,
            orderResult.data.estimated_time,
            orderResult.data.address
          );
          MemoryService.addMessage(memory, 'assistant', reply);
          await ConversationService.saveConversation(memory);
          return {
            text: reply,
            buttons: [
              { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${orderResult.data.order_id}` },
              { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
            ],
          };
        }
      }
      const reply = memory.cart.length > 0
        ? `Tienes un pedido en preparación en tu carrito 🛒 (Total: $${memory.total.toLocaleString('es-CO')}). ¿Deseas revisarlo para confirmarlo? 🍟✨`
        : 'Aún no tienes ningún pedido activo en este momento. 🍟✨ ¿Qué delicia de Shek Food te gustaría pedir? Escribe *carta* para ver nuestro menú. 😋';
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Live Tracking / Rider Location Inquiry (Rule 21: live map link + GPS)
    const isTrackingRequest = /^(por donde viene|donde esta el domiciliario|donde viene el domiciliario|donde viene|rastreo|link de rastreo|seguimiento|mapa|ubicacion|donde esta el repartidor|por donde va)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('por donde viene') ||
      cleanNormalized.includes('donde esta el domiciliario') ||
      cleanNormalized.includes('donde viene el domiciliario') ||
      cleanNormalized.includes('link de rastreo');
    if (isTrackingRequest) {
      const activeOrderCode = memory.order_code || memory.last_order_code;
      if (activeOrderCode || StateService.isOrderPlaced(memory.current_state)) {
        const orderResult = await ToolExecutor.execute(tenantId, memory, 'get_order', { order_id: activeOrderCode });
        if (orderResult.success && orderResult.data) {
          const shortCode = orderResult.data.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || orderResult.data.order_code || activeOrderCode || 'T-ACTIVO';
          const reply = ResponseBuilder.buildOrderTracking(
            shortCode,
            orderResult.data.id || activeOrderCode || '',
            orderResult.data.status,
            orderResult.data.delivery_address
          );
          MemoryService.addMessage(memory, 'assistant', reply);
          await ConversationService.saveConversation(memory);
          return {
            text: reply,
            buttons: [
              { text: '📡 Abrir Mapa en Vivo', callback_data: `TRACK_${orderResult.data.id}` },
              { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
            ],
          };
        }
      }
      const reply = 'No tienes ningún pedido en camino en este momento. 🛵 Si deseas hacer un pedido, escribe *carta* para ver el menú. 🍟✨';
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Order Details / Change calculation inquiry on confirmed order (Rule 20)
    const isOrderDetailsRequest = /^(cuanto es mi devuelta|cuanto es el vuelto|mi devuelta|mi cambio|con cuanto pague|que pedi|detalles de mi pedido|resumen de lo que pedi)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('cuanto es mi devuelta') ||
      cleanNormalized.includes('mi devuelta') ||
      cleanNormalized.includes('con cuanto pague');
    if (isOrderDetailsRequest) {
      const activeOrderCode = memory.order_code || memory.last_order_code;
      if (activeOrderCode || StateService.isOrderPlaced(memory.current_state)) {
        const orderResult = await ToolExecutor.execute(tenantId, memory, 'get_order_details', { order_id: activeOrderCode });
        if (orderResult.success && orderResult.data?.order) {
          const reply = ResponseBuilder.buildOrderDetails(
            orderResult.data.order_code,
            orderResult.data.order,
            memory
          );
          MemoryService.addMessage(memory, 'assistant', reply);
          await ConversationService.saveConversation(memory);
          return { text: reply };
        }
      }
    }

    // Fast-path: Direct Order Summary / Review Request (prevents AI hallucinating numbers)
    const isReviewRequest = /^(dame el resumen|dame el resumen del pedido|resumen|resumen del pedido|el resumen|ver pedido|muestrame el pedido|ver carrito|mi pedido|el pedido)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('resumen del pedido') ||
      cleanNormalized.includes('dame el resumen') ||
      cleanNormalized.includes('muestrame el pedido');
    if (isReviewRequest) {
      if (memory.cart.length === 0) {
        // Rule 20: If there is an active confirmed order, NEVER say "carrito vacío"
        const activeOrderCode = memory.order_code || memory.last_order_code;
        if (activeOrderCode || StateService.isOrderPlaced(memory.current_state)) {
          const orderResult = await ToolExecutor.execute(tenantId, memory, 'get_order_details', { order_id: activeOrderCode });
          if (orderResult.success && orderResult.data?.order) {
            const reply = ResponseBuilder.buildOrderDetails(
              orderResult.data.order_code,
              orderResult.data.order,
              memory
            );
            MemoryService.addMessage(memory, 'assistant', reply);
            await ConversationService.saveConversation(memory);
            return { text: reply };
          }
        }

        const reply = '🛒 Tu carrito está vacío en este momento. 🍟✨ ¿Qué delicia de Shek Food te gustaría ordenar? Escribe *carta* para ver nuestro menú completo. 😋';
        MemoryService.addMessage(memory, 'assistant', reply);
        await ConversationService.saveConversation(memory);
        return { text: reply };
      }
      MemoryService.recalculateCartTotals(memory);
      const reply = ResponseBuilder.buildOrderReview(memory);
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Send PDF Menu directly with zero lag and zero AI failure risk (Rule 22: only if no recognizable products in message)
    const hasProductIntent = /\b(quiero|dame|agrega|agregame|ponme|salchipapa|shek|granizado|hamburguesa|perro|papas|gaseosa|coca|cerveza|cervezas)\b/i.test(cleanNormalized);
    const isMenuPdfRequest = !hasProductIntent && /^(quiero la carta|la carta|la carta por favor|carta|el menu|menu|muestrame la carta|mandame la carta|carta en pdf|menu pdf|pdf)$/i.test(cleanNormalized);
    if (isMenuPdfRequest) {
      const pdfUrl = menuPdfUrl || (await CatalogService.getMenuPdf(tenantId));
      const reply = `📄 ¡Con mucho gusto! Aquí tienes nuestra carta oficial completa en PDF con fotos, platillos y precios. 🍟🍔🥤\n\n¿Cuál de nuestros platos se te antoja probar hoy? 😋✨`;
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return {
        text: reply,
        document_url: pdfUrl || undefined,
        document_filename: 'Carta_Shek_Food.pdf',
        document_caption: '📄 Carta oficial de Shek Food en PDF 🍟✨',
      };
    }

    // Rule 27 & 33: RESPETAR EXPLÍCITAMENTE "RECOGER EN PERSONA" / "SIN DOMICILIO" / "PICKUP"
    // Frases: "recojo en el punto", "sin domicilio", "voy por él/ella", "yo voy por ella", "ya puedo arrimar", etc.
    const isPickupIntent = /\b(recojo en el punto|en el punto|yo voy por ella|yo voy por el|voy por ella|voy por el|sin domicilio|recojo en el local|ya puedo arrimar|puedo arrimar|arrimar|recojo en tienda|recoge en tienda|recoger en persona|recojo en persona|para recoger|pasar a recoger|paso por el|paso por ella|en el local|paso a recoger)\b/i.test(cleanNormalized);
    if (isPickupIntent) {
      memory.delivery_mode = 'pickup';
      memory.delivery_fee = 0;
      memory.address = 'Recoge en tienda';
      MemoryService.recalculateCartTotals(memory);
    } else if (/\b(a domicilio|para domicilio|domicilio|a mi casa|para enviar|me lo envian|envio)\b/i.test(cleanNormalized)) {
      memory.delivery_mode = 'delivery';
    }

    // Rule 28: EL MÉTODO DE PAGO CONFIRMADO POR EL CLIENTE ES INMUTABLE
    if (/\b(nequi)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'transfer';
      memory.payment_method_literal = 'Nequi';
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
    } else if (/\b(daviplata)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'transfer';
      memory.payment_method_literal = 'Daviplata';
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
    } else if (/\b(bancolombia)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'transfer';
      memory.payment_method_literal = 'Bancolombia';
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
    } else if (/\b(transferencia|transferir|por transferencia)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'transfer';
      memory.payment_method_literal = 'Transferencia';
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
    } else if (/\b(efectivo|en efectivo|plata en mano|contraentrega en efectivo)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'cash';
      memory.payment_method_literal = 'Efectivo';
    } else if (/\b(datafono|datáfono|tarjeta contraentrega|datafono contraentrega)\b/i.test(cleanNormalized)) {
      memory.payment_method = 'card';
      memory.payment_method_literal = 'Datáfono';
      memory.cash_amount = undefined;
      memory.change_amount = undefined;
    }

    // Rule 31: Detect digital receipt / voucher mentions
    if (/\b(comprobante|referencia|ya transferi|ya envie|ya mande|aqui esta el comprobante|foto del pago|captura|adjunto el comprobante)\b/i.test(cleanNormalized)) {
      memory.payment_receipt_received = true;
    }

    // Rule 29: AISLAMIENTO ESTRICTO DE CONTEXTO POR CONVERSACIÓN
    if (memory.last_order_code && memory.current_state === 'ORDER_CONFIRMED') {
      const isTryingToModifyConfirmedOrder = /\b(agrega(?:le)? al pedido|modifica mi pedido|cambia mi pedido|adicional a mi pedido|adicion a la orden|meterle al pedido|pedido anterior|orden anterior)\b/i.test(cleanNormalized);
      if (isTryingToModifyConfirmedOrder) {
        await ToolExecutor.execute(tenantId, memory, 'escalate_to_human', {
          reason: 'Cliente intentó modificar o fusionar datos con un pedido ya confirmado (Regla 29).'
        });
        const reply = 'Tu pedido anterior ya se encuentra confirmado y en cocina. 👨‍🍳 Para evitar confusiones o modificaciones erróneas, he transferido tu consulta a un asesor humano que te atenderá de inmediato. ¡Muchas gracias! ❤️';
        MemoryService.addMessage(memory, 'assistant', reply);
        await ConversationService.saveConversation(memory);
        return {
          text: reply,
          buttons: [{ text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' }]
        };
      }
    }

    // 4. Handle location payload directly if attached
    if (extra?.location) {
      memory.location = extra.location;
      memory.delivery_mode = 'delivery';
      userText = userText || `Mi ubicación GPS (${extra.location.latitude}, ${extra.location.longitude})`;
    }

    // 5. Append user message to memory
    MemoryService.addMessage(memory, 'user', userText);

    // 6. Build prompt context with schedule and PDF awareness
    const messages = ContextBuilder.build(memory, 'Shek Food', {
      isOpen,
      formattedHours,
      menuPdfUrl,
    });
    messages.push({ role: 'user', content: userText });

    try {
      // 7. Single Turn: Call LLM with Tool Calling (Groq LPU primary ~300ms, OpenAI fallback)
      const firstResponse = await OpenAIService.complete(messages, AGENT_TOOLS);
      const assistantMessage = firstResponse.message;

      if (!assistantMessage) {
        throw new Error('No response message received from LLM.');
      }

      // 8. Execute tool if chosen by the LLM
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        let finalReply = '';
        let documentUrlToSend: string | undefined = undefined;
        let actionButtons: Array<{ text: string; callback_data: string }> | undefined = undefined;
        const addedItemsList: Array<{ productName: string; quantity: number; unitPrice: number; additions?: any[]; notes?: string }> = [];

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;

          const functionName = toolCall.function.name;
          let rawArguments: any = {};
          try {
            rawArguments = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            rawArguments = {};
          }

          // Fallback note extractor: if user specified "sin ..." and rawArguments.notes is missing
          // Rule 9: only apply if the note makes sense for this product!
          if (functionName === 'add_to_cart' && !rawArguments.notes) {
            const sinMatch = userText.match(/\b(sin\s+[a-záéíóúñ\s]+?)(?=\s+(?:a domicilio|para domicilio|por favor|y\s+|con\s+|$))/i) ||
                             userText.match(/\b(sin\s+[a-záéíóúñ]+)/i);
            if (sinMatch) {
              const matchedNote = sinMatch[1].trim();
              const targetProduct = rawArguments.product_name_or_id || '';
              if (CatalogService.isNoteApplicableToProduct(targetProduct, matchedNote)) {
                rawArguments.notes = matchedNote;
              }
            }
          }

          // Mandatory AI Guard pre-execution gatekeeper (Rules 24, 25 & 26)
          const guardResult = await AIGuard.validateToolCall(tenantId, memory, functionName, rawArguments, userText);
          if (!guardResult.passed) {
            // Rule 26: If duplicate lines detected, escalate to human immediately!
            if (guardResult.reason?.includes('DUPLICATE_LINES_DETECTED')) {
              await ToolExecutor.execute(tenantId, memory, 'escalate_to_human', {
                reason: 'Líneas de producto duplicadas detectadas antes de confirmar (Regla 26).'
              });
              finalReply = ResponseBuilder.formatFriendlyErrorMessage(guardResult.reason, memory);
              actionButtons = [{ text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' }];
              break;
            }
            finalReply = ResponseBuilder.formatFriendlyErrorMessage(guardResult.reason || '', memory);
            break;
          }

          // Execute tool with backend domain services
          const toolResult = await ToolExecutor.execute(
            tenantId,
            memory,
            functionName,
            guardResult.sanitizedArguments || rawArguments
          );

          const data = toolResult.data;

          // Build instant, rich, authoritative response directly from backend data (no slow 2nd LLM call!)
          switch (functionName) {
            case 'add_item':
            case 'add_to_cart': {
              if (data?.addedItem) {
                addedItemsList.push(data.addedItem);
              }
              break;
            }

            case 'add_addon': {
              if (toolResult.success && data) {
                finalReply = `Listo, agregué *${data.addon?.name || 'adición'}* a tu *${data.item?.productName || 'pedido'}*. Nuevo precio de ese ítem: $${(data.newItemUnitPrice || 0).toLocaleString('es-CO')}. 🧀✨\n\n🛒 *Total actual:* $${memory.total.toLocaleString('es-CO')}\n\n¿Deseas agregar algo más o revisamos el resumen para confirmar? 😋`;
              } else if (data?.ambiguous && data?.candidates) {
                finalReply = `Tienes varios productos en tu carrito (${data.candidates.join(', ')}). ¿A cuál de ellos deseas agregarle el adicional? 🤔`;
              } else {
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(toolResult.error || 'No fue posible agregar el adicional.', memory);
              }
              break;
            }

            case 'update_quantity':
            case 'update_cart_item': {
              finalReply = `¡Listo! 🍟 Ya actualicé tu pedido.\n\n🛒 *Total actual:* $${memory.total.toLocaleString('es-CO')}\n\n¿Deseas agregar algo más o revisamos el resumen para confirmar? ✨`;
              break;
            }

            case 'remove_item':
            case 'remove_cart_item': {
              finalReply = `¡Entendido! 🗑️ Producto retirado de tu pedido.\n\n🛒 *Total actual:* $${memory.total.toLocaleString('es-CO')}`;
              break;
            }

            case 'clear_cart': {
              const hasConfirmedOrder = Boolean(memory.order_code || memory.last_order_code);
              finalReply = hasConfirmedOrder
                ? `¡Listo! 🗑️✨ He vaciado tu carrito actual y pedido en curso. (Tu pedido confirmado *${memory.order_code || memory.last_order_code}* en cocina sigue su curso normal 🛵).\n\n¿Qué se te antoja ordenar ahora? Escribe *carta* para ver nuestro menú. 🍟😋`
                : '¡Listo! 🗑️✨ He vaciado tu carrito actual y pedido en curso. ¿Qué se te antoja ordenar hoy? Escribe *carta* para ver nuestro menú completo. 🍟😋';
              break;
            }

            case 'send_menu_pdf': {
              documentUrlToSend = data?.pdf_url || menuPdfUrl;
              finalReply = `📄 ¡Con mucho gusto! Aquí tienes nuestra carta oficial completa en PDF con fotos, platillos y precios. 🍟🍔🥤\n\n¿Cuál de nuestros platos se te antoja probar hoy? 😋✨`;
              break;
            }

            case 'get_cart_summary':
            case 'get_cart':
            case 'calculate_order': {
              finalReply = ResponseBuilder.buildOrderReview(memory);
              break;
            }

            case 'confirm_order':
            case 'create_order': {
              if (data?.success && memory.order_code) {
                const orderId = data.orderId || memory.order_id || '';
                const items = data.items || [];
                const confirmedTotal = data.total;
                const confirmedDeliveryFee = data.delivery_fee;
                const confirmedAddress = memory.address;

                // Rule 16 safeguard: if total is <= 0 or inconsistent, fail safe to human
                if (!confirmedTotal || confirmedTotal <= 0) {
                  finalReply = '🙋 Detectamos una pequeña inconsistencia al confirmar el total de tu pedido. Un asesor humano te contactará de inmediato para confirmarlo. ¡Muchas gracias!';
                  actionButtons = [{ text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' }];
                  break;
                }

                finalReply = ResponseBuilder.buildOrderConfirmed(
                  memory,
                  memory.order_code,
                  orderId,
                  items,
                  confirmedTotal,
                  confirmedDeliveryFee,
                  confirmedAddress
                );
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${orderId}` },
                  { text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                if (data?.error === 'DUPLICATE_LINES_DETECTED' || toolResult.error === 'DUPLICATE_LINES_DETECTED') {
                  await ToolExecutor.execute(tenantId, memory, 'escalate_to_human', {
                    reason: 'Líneas de producto duplicadas detectadas antes de persistir la orden (Regla 26).'
                  });
                  actionButtons = [{ text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' }];
                }
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(data?.error || toolResult.error || 'Hubo un inconveniente al confirmar tu pedido.', memory);
              }
              break;
            }

            case 'calculate_change':
            case 'provide_cash_amount': {
              if (data?.valid) {
                finalReply = `¡Anotado! 💵 Pagas con *$${(memory.cash_amount || 0).toLocaleString('es-CO')}*.\n🔄 Tu devuelta será de *$${(memory.change_amount || 0).toLocaleString('es-CO')}*.\n\n👉 *¿Confirmas tu pedido por $${memory.total.toLocaleString('es-CO')}?* Escribe *Sí* o *Confirmo* para prepararlo de inmediato. 🍟🔥`;
              } else {
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(data?.message || data?.error || 'MONTO_INSUFICIENTE', memory);
              }
              break;
            }

            case 'get_payment_instructions':
            case 'get_payment_details': {
              if (data?.formattedMessage) {
                finalReply = data.formattedMessage;
              } else {
                const exactTotal = memory.total > 0 ? `$${memory.total.toLocaleString('es-CO')}` : 'el valor exacto';
                finalReply = `📲 *Datos oficiales para transferencia:* 🍟✨\n\n1️⃣ *Titular del negocio:* Shek Food\n2️⃣ *Nequi / Daviplata:* 312 634 1068\n   *Bancolombia Ahorros:* 123-456789-00\n3️⃣ *Monto exacto a transferir:* ${exactTotal}\n4️⃣ 📸 *Comprobante:* Por favor envía una foto o captura del comprobante (o el número de referencia) por este chat para procesar tu pedido. 🍟✨`;
              }
              break;
            }

            case 'get_payment_methods': {
              finalReply = `💳 *Métodos de pago disponibles:* 🍟✨\n\n• 💵 *Efectivo* (contra entrega, indícanos con cuánto pagas para llevar tu cambio)\n• 📲 *Transferencia* (Nequi / Bancolombia, valor exacto sin devuelta)\n• 💳 *Datáfono* (tarjeta contra entrega)\n\n¿Cuál método de pago prefieres? 😋`;
              break;
            }

            case 'validate_delivery_zone': {
              if (data?.valid) {
                finalReply = `📍 ¡Perfecto! Tu dirección (*${memory.address}*) está en nuestra zona de cobertura en Puerto Tejada. 🛵💨\n\nEl costo del domicilio es de *$${memory.delivery_fee.toLocaleString('es-CO')}*.\n¿Deseas pagar en efectivo 💵 o transferencia 📱?`;
              } else {
                finalReply = `Lo sentimos 😔, la dirección no está dentro de nuestra zona de cobertura en Puerto Tejada Cauca. 📍\n\n¿Deseas recoger tu pedido en nuestro local? 🏪✨`;
              }
              break;
            }

            case 'get_delivery_fee': {
              finalReply = `🛵 El costo de domicilio para tu zona es de *$${(data?.fee || 5000).toLocaleString('es-CO')}*. 🍟✨`;
              break;
            }

            case 'get_categories': {
              const cats = data || [];
              const lines = cats.map((c: any) => `• 🍽️ *${c.name}*${c.description ? ` — ${c.description}` : ''}`);
              finalReply = `✨ *Nuestras Categorías en Shek Food:* 🍟\n\n${lines.join('\n')}\n\n¿Cuál te gustaría explorar? Escribe el nombre del plato o categoría. 😋`;
              break;
            }

            case 'get_products':
            case 'search_products': {
              const prods = (data || []).slice(0, 8);
              if (prods.length === 0) {
                finalReply = `No encontramos productos para esa búsqueda 😕. Escribe *carta* para ver la carta completa en PDF con todo nuestro menú. 🍟✨`;
              } else {
                const lines = prods.map((p: any) => `• *${p.name}* — $${Number(p.price).toLocaleString('es-CO')}\n  _${p.description || ''}_`);
                finalReply = `🍽️ *Platos disponibles en Shek Food:* 🍟🔥\n\n${lines.join('\n\n')}\n\n¿Cuál deseas pedir? 😋`;
              }
              break;
            }

            case 'get_product_variants': {
              const vars = data || [];
              const lines = vars.map((v: any) => `• Tamaño *${v.name}* — $${Number(v.price).toLocaleString('es-CO')}`);
              finalReply = `🍟 *Tamaños disponibles para Salchipapa Shek:* 🔥\n\n${lines.join('\n')}\n\n¿Cuál tamaño prefieres ordenar? 😋`;
              break;
            }

            case 'get_order_status': {
              if (data?.order_code) {
                finalReply = ResponseBuilder.buildOrderStatus(
                  data.order_code,
                  data.status,
                  data.total,
                  data.estimated_time,
                  data.address
                );
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${data.order_id}` },
                  { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(toolResult.error || 'ORDER_NOT_FOUND', memory);
              }
              break;
            }

            case 'get_order_details': {
              if (data?.order) {
                finalReply = ResponseBuilder.buildOrderDetails(
                  data.order_code,
                  data.order,
                  memory
                );
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${data.order_id}` },
                  { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(toolResult.error || 'ORDER_NOT_FOUND', memory);
              }
              break;
            }

            case 'get_order': {
              if (data) {
                const shortCode = data.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || data.order_code || `T-${data.id?.slice(0, 4)?.toUpperCase()}`;
                const isTrackingQuery = /\b(rastreo|donde|repartidor|domiciliario|ubicacion|mapa|por donde|camino)\b/i.test(cleanNormalized);
                if (isTrackingQuery) {
                  finalReply = ResponseBuilder.buildOrderTracking(
                    shortCode,
                    data.id,
                    data.status,
                    data.delivery_address
                  );
                } else {
                  finalReply = ResponseBuilder.buildOrderStatus(
                    shortCode,
                    data.status,
                    data.total,
                    '40–50 minutos',
                    data.delivery_address
                  );
                }
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${data.id}` },
                  { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                finalReply = ResponseBuilder.formatFriendlyErrorMessage(toolResult.error || 'ORDER_NOT_FOUND', memory);
              }
              break;
            }

            case 'cancel_order': {
              finalReply = data?.success
                ? '✅ Tu pedido ha sido cancelado con éxito.'
                : ResponseBuilder.formatFriendlyErrorMessage(data?.error || toolResult.error || 'ORDER_CANNOT_BE_CANCELLED', memory);
              break;
            }

            case 'escalate_to_human':
            case 'handoff_to_human': {
              finalReply = '🙋 He transferido tu conversación a nuestro equipo de atención. Un asesor humano se comunicará contigo de inmediato por este chat para asistirte y confirmar tu pedido. ¡Muchas gracias por tu paciencia! ❤️';
              break;
            }

            default:
              finalReply = '¡Listo! Operación procesada. 🍟✨ ¿En qué más te puedo colaborar?';
          }
        }

        // If items were added to cart, construct authoritative consolidated confirmation (Rule 22)
        if (addedItemsList.length > 0) {
          // Rule 22: NEVER send the PDF menu if at least one product was recognized and added
          documentUrlToSend = undefined;

          const feeBreakdown = memory.delivery_mode === 'delivery' && memory.delivery_fee > 0
            ? `🛒 *Subtotal productos:* $${memory.subtotal.toLocaleString('es-CO')}\n🛵 *Domicilio:* $${memory.delivery_fee.toLocaleString('es-CO')}\n💰 *Total actual:* $${memory.total.toLocaleString('es-CO')}`
            : `💰 *Total actual:* $${memory.total.toLocaleString('es-CO')}`;

          // Rule 22: Check if there was an unresolved item in a compound message (e.g. plural without quantity like "cervezas")
          let clarifyingQuestion: string | undefined = undefined;
          if (assistantMessage.content && assistantMessage.content.includes('?')) {
            clarifyingQuestion = assistantMessage.content.trim();
          } else {
            const missingMatches = userText.match(/\b(cervezas?|gaseosas?|jugos?|bebidas?|papas?|adicion(?:es)?|salsas?)\b/i);
            if (missingMatches) {
              const term = missingMatches[0].toLowerCase();
              const isAlreadyAdded = addedItemsList.some(i => i.productName.toLowerCase().includes(term));
              if (!isAlreadyAdded) {
                if (term.includes('cerveza')) {
                  clarifyingQuestion = '¿Cuántas cervezas te gustaría agregar y de qué marca/tipo? 🍺✨';
                } else if (term.includes('gaseosa')) {
                  clarifyingQuestion = '¿De qué sabor o marca prefieres la gaseosa (Coca-Cola, Postobón, etc.) y cuántas? 🥤✨';
                } else if (term.includes('bebida')) {
                  clarifyingQuestion = '¿Qué bebida y cuántas unidades te gustaría agregar? 🥤✨';
                }
              }
            }
          }

          const closingPrompt = clarifyingQuestion
            ? `\n\n👉 ${clarifyingQuestion}`
            : (memory.delivery_mode === 'delivery'
                ? `\n\n¿Deseas agregar una bebida 🥤 o revisamos tu dirección para el domicilio? 🛵😋`
                : `\n\n¿Deseas agregar algo más 🥤 o revisamos el resumen para confirmar? 😋✨`);

          if (addedItemsList.length === 1) {
            const item = addedItemsList[0];
            const addsTotal = (item.additions || []).reduce((sum: number, a: any) => sum + (a.price || 0), 0);
            const lineTotal = (item.unitPrice + addsTotal) * item.quantity;
            let addsStr = '';
            if (item.additions && item.additions.length > 0) {
              addsStr = '\n' + item.additions.map((a: any) => `   └ 🧀 _+ ${a.name} ($${a.price.toLocaleString('es-CO')})_`).join('\n');
            }
            let notesStr = '';
            if (item.notes) {
              notesStr = `\n   📝 _Nota: ${item.notes}_`;
            }
            finalReply = `¡Listo! 🍟✨ Ya agregué *${item.productName}* ×${item.quantity} ($${lineTotal.toLocaleString('es-CO')})${addsStr}${notesStr} a tu pedido.\n\n${feeBreakdown}${closingPrompt}`;
          } else {
            const lines = addedItemsList.map(item => {
              const addsTotal = (item.additions || []).reduce((sum: number, a: any) => sum + (a.price || 0), 0);
              const lineTotal = (item.unitPrice + addsTotal) * item.quantity;
              let line = `• *${item.productName}* ×${item.quantity} — $${lineTotal.toLocaleString('es-CO')}`;
              if (item.additions && item.additions.length > 0) {
                line += '\n' + item.additions.map((a: any) => `   └ 🧀 _+ ${a.name} ($${a.price.toLocaleString('es-CO')})_`).join('\n');
              }
              if (item.notes) {
                line += `\n   📝 _Nota: ${item.notes}_`;
              }
              return line;
            });
            finalReply = `¡Listo! 🍟✨ Ya agregué a tu pedido:\n\n${lines.join('\n')}\n\n${feeBreakdown}${closingPrompt}`;
          }
        }

        // Record assistant response in memory
        MemoryService.addMessage(memory, 'assistant', finalReply);
        await ConversationService.saveConversation(memory);

        return {
          text: finalReply,
          buttons: actionButtons,
          document_url: documentUrlToSend,
          document_filename: documentUrlToSend ? 'Carta_Shek_Food.pdf' : undefined,
          document_caption: documentUrlToSend ? '📄 Carta oficial de Shek Food en PDF 🍟✨' : undefined,
        };
      }

      // 7. Plain conversational response (no tool needed)
      let finalReply = assistantMessage.content || '¡Con mucho gusto! 🍟✨ ¿En qué te puedo colaborar hoy? 😋';
      if (/\b(MONTO_INSUFICIENTE|ORDER_NOT_FOUND|FALTA_METODO_PAGO|STOCK_UNAVAILABLE|CART_EMPTY|ORDER_ALREADY_CONFIRMED)\b/.test(finalReply)) {
        finalReply = ResponseBuilder.formatFriendlyErrorMessage(finalReply, memory);
      }

      MemoryService.addMessage(memory, 'assistant', finalReply);
      await ConversationService.saveConversation(memory);

      return {
        text: finalReply,
      };
    } catch (err) {
      console.error('[AgentOrchestrator] Error processing message:', err);
      const recoveryMessage = ResponseBuilder.buildErrorMessage();
      return { text: recoveryMessage };
    }
  }
}
