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

    // Fast-path: Greetings (warm, high-converting Colombian welcome, resets stale sessions > 10m)
    const isGreeting = /^(hola|buenas|buenas tardes|buenos dias|buenas noches|hey|ola|saludos|inicio)$/i.test(cleanNormalized);
    const isSessionStale = (Date.now() - (memory.last_activity || 0)) > 10 * 60 * 1000;
    if (isGreeting && (memory.cart.length === 0 || isSessionStale || memory.current_state === 'ORDER_CONFIRMED')) {
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
      const reply = ResponseBuilder.buildWelcomeGreeting('Shek Food');
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Explicit Reset / Forget Previous Orders
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
      memory.order_id = undefined;
      memory.order_code = undefined;
      memory.last_order_id = undefined;
      memory.last_order_code = undefined;
      memory.history = [];
      memory.summary = '';
      memory.current_state = 'WELCOME';
      memory.cart_id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const reply = '¡Listo! ✨ He borrado el carrito y todo el historial de pedidos anteriores. Comenzamos totalmente desde cero. 🍟🍔🥤\n\n¿Qué se te antoja ordenar hoy? Puedes pedirme la *carta* o decirme directamente qué platillo deseas. 😋❤️';
      MemoryService.addMessage(memory, 'assistant', reply);
      await ConversationService.saveConversation(memory);
      return { text: reply };
    }

    // Fast-path: Direct Order Summary / Review Request (prevents AI hallucinating numbers)
    const isReviewRequest = /^(dame el resumen|dame el resumen del pedido|resumen|resumen del pedido|el resumen|ver pedido|muestrame el pedido|ver carrito|mi pedido|como va mi pedido|que he pedido|el pedido)$/i.test(cleanNormalized) ||
      cleanNormalized.includes('resumen del pedido') ||
      cleanNormalized.includes('dame el resumen') ||
      cleanNormalized.includes('muestrame el pedido');
    if (isReviewRequest) {
      if (memory.cart.length === 0) {
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

    // Fast-path: Send PDF Menu directly with zero lag and zero AI failure risk
    const isMenuPdfRequest = /^(quiero la carta|la carta|la carta por favor|carta|el menu|menu|muestrame la carta|mandame la carta|carta en pdf|menu pdf|pdf)$/i.test(cleanNormalized);
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

    // Auto-detect Delivery vs Pickup intent directly from text
    if (/\b(a domicilio|para domicilio|domicilio|a mi casa|para enviar|me lo envian|envio)\b/i.test(cleanNormalized)) {
      memory.delivery_mode = 'delivery';
    } else if (/\b(para recoger|recojo en el local|pasar a recoger|paso por el|en el local)\b/i.test(cleanNormalized)) {
      memory.delivery_mode = 'pickup';
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
          if (functionName === 'add_to_cart' && !rawArguments.notes) {
            const sinMatch = userText.match(/\b(sin\s+[a-záéíóúñ\s]+?)(?=\s+(?:a domicilio|para domicilio|por favor|y\s+|con\s+|$))/i) ||
                             userText.match(/\b(sin\s+[a-záéíóúñ]+)/i);
            if (sinMatch) {
              rawArguments.notes = sinMatch[1].trim();
            }
          }

          // Mandatory AI Guard pre-execution gatekeeper
          const guardResult = await AIGuard.validateToolCall(tenantId, memory, functionName, rawArguments);
          if (!guardResult.passed) {
            finalReply = guardResult.reason || 'Operación bloqueada por reglas de negocio.';
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
            case 'add_to_cart': {
              if (data?.addedItem) {
                addedItemsList.push(data.addedItem);
              }
              break;
            }

            case 'update_cart_item': {
              finalReply = `¡Listo! 🍟 Ya actualicé tu pedido.\n\n🛒 *Total actual:* $${memory.total.toLocaleString('es-CO')}\n\n¿Deseas agregar algo más o revisamos el resumen para confirmar? ✨`;
              break;
            }

            case 'remove_cart_item': {
              finalReply = `¡Entendido! 🗑️ Producto retirado de tu pedido.\n\n🛒 *Total actual:* $${memory.total.toLocaleString('es-CO')}`;
              break;
            }

            case 'clear_cart': {
              finalReply = '¡Carrito vaciado! 🗑️✨ Cuando gustes puedes comenzar un nuevo pedido. ¿Qué se te antoja hoy? 🍟';
              break;
            }

            case 'send_menu_pdf': {
              documentUrlToSend = data?.pdf_url || menuPdfUrl;
              finalReply = `📄 ¡Con mucho gusto! Aquí tienes nuestra carta oficial completa en PDF con fotos, platillos y precios. 🍟🍔🥤\n\n¿Cuál de nuestros platos se te antoja probar hoy? 😋✨`;
              break;
            }

            case 'get_cart':
            case 'calculate_order': {
              finalReply = ResponseBuilder.buildOrderReview(memory);
              break;
            }

            case 'create_order': {
              if (data?.success && memory.order_code) {
                const orderId = data.orderId || memory.order_id || '';
                const items = data.items || [];
                finalReply = ResponseBuilder.buildOrderConfirmed(memory, memory.order_code, orderId, items);
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${orderId}` },
                  { text: '🙋 Asesor Humano', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                finalReply = data?.error || 'Hubo un inconveniente al confirmar tu pedido. ¿Quieres que lo intentemos de nuevo?';
              }
              break;
            }

            case 'provide_cash_amount': {
              if (data?.valid) {
                finalReply = `¡Anotado! 💵 Pagas con *$${(memory.cash_amount || 0).toLocaleString('es-CO')}*.\n🔄 Tu devuelta será de *$${(memory.change_amount || 0).toLocaleString('es-CO')}*.\n\n¿Deseas confirmar tu pedido? Escribe *Confirmo* o *Sí* para prepararlo de inmediato. 🍟🔥`;
              } else {
                finalReply = data?.error || 'El monto en efectivo es menor al total del pedido. Por favor indícanos un valor suficiente.';
              }
              break;
            }

            case 'get_payment_instructions': {
              finalReply = `📲 *Instrucciones para Transferencia:*\n\nPuedes transferir a nuestras cuentas oficiales:\n• *Nequi:* 312 634 1068\n• *Bancolombia Ahorros:* 123-456789-00\n\nUna vez realices la transferencia, envíanos el comprobante por aquí. 🍟✨`;
              break;
            }

            case 'get_payment_methods': {
              finalReply = `💳 *Métodos de pago disponibles:* 🍟✨\n\n• 💵 *Efectivo* (contra entrega, calculamos tu cambio)\n• 📲 *Transferencia* (Nequi / Bancolombia)\n\n¿Cuál método de pago prefieres? 😋`;
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

            case 'get_order': {
              if (data) {
                const shortCode = data.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || data.order_code || `T-${data.id?.slice(0, 4)?.toUpperCase()}`;
                finalReply = ResponseBuilder.buildOrderStatus(
                  shortCode,
                  data.status,
                  data.total,
                  data.id,
                  data.delivery_address
                );
                actionButtons = [
                  { text: '📡 Rastrear en Vivo', callback_data: `TRACK_${data.id}` },
                  { text: '🙋 Hablar con Asesor', callback_data: 'HUMAN_HANDOFF' },
                ];
              } else {
                finalReply = 'No encontré ningún pedido con ese código 😕. Por favor indícanos tu código (ejemplo: *T-S5F9*) para revisarlo de inmediato. 🍟✨';
              }
              break;
            }

            case 'cancel_order': {
              finalReply = data?.success
                ? '✅ Tu pedido ha sido cancelado con éxito.'
                : (data?.error || 'No fue posible cancelar el pedido en este momento.');
              break;
            }

            case 'handoff_to_human': {
              finalReply = '🙋 He notificado a nuestro equipo. Un asesor humano te responderá muy pronto. ¡Muchas gracias por tu paciencia! ❤️';
              break;
            }

            default:
              finalReply = '¡Listo! Operación procesada. 🍟✨ ¿En qué más te puedo colaborar?';
          }
        }

        // If items were added to cart, construct authoritative consolidated confirmation
        if (addedItemsList.length > 0) {
          const feeBreakdown = memory.delivery_mode === 'delivery' && memory.delivery_fee > 0
            ? `🛒 *Subtotal productos:* $${memory.subtotal.toLocaleString('es-CO')}\n🛵 *Domicilio:* $${memory.delivery_fee.toLocaleString('es-CO')}\n💰 *Total actual:* $${memory.total.toLocaleString('es-CO')}`
            : `💰 *Total actual:* $${memory.total.toLocaleString('es-CO')}`;

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
            finalReply = `¡Listo! 🍟✨ Ya agregué *${item.productName}* ×${item.quantity} ($${lineTotal.toLocaleString('es-CO')})${addsStr}${notesStr} a tu pedido.\n\n${feeBreakdown}\n\n¿Deseas agregar algo más 🥤 o te lo enviamos a domicilio? 🛵😋`;
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
            finalReply = `¡Listo! 🍟✨ Ya agregué a tu pedido:\n\n${lines.join('\n')}\n\n${feeBreakdown}\n\n¿Deseas agregar una bebida 🥤 o revisamos tu dirección para el domicilio? 🛵😋`;
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
      const finalReply = assistantMessage.content || '¡Con mucho gusto! 🍟✨ ¿En qué te puedo colaborar hoy? 😋';

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
