import { StructuredMemory } from '@/conversations/conversation.types';
import { SHEK_FOOD_SYSTEM_PROMPT } from './system.prompt';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class ContextBuilder {
  /**
   * Constructs the token-optimized messages array for the OpenAI model
   */
  public static build(
    memory: StructuredMemory,
    restaurantName = 'Shek Food',
    extraContext?: {
      isOpen?: boolean;
      formattedHours?: string;
      menuPdfUrl?: string | null;
    }
  ): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    // 1. System Prompt
    messages.push({
      role: 'system',
      content: SHEK_FOOD_SYSTEM_PROMPT,
    });

    // 2. Structured State Injection
    const cartItemsStr = memory.cart.length > 0
      ? memory.cart.map(i => `${i.productName} ×${i.quantity} ($${(i.unitPrice * i.quantity).toLocaleString('es-CO')})`).join(', ')
      : 'Vacío';

    const closedNotice = extraContext && extraContext.isOpen === false
      ? `\n⚠️ [ESTADO DEL LOCAL: CERRADO EN ESTE MOMENTO 🌙]\nHorario de atención:\n${extraContext.formattedHours || '16:00 - 23:00'}\nCarta en PDF disponible: ${extraContext.menuPdfUrl ? 'Sí' : 'No'}\nREGLA: Si el cliente saluda o intenta pedir ahora, explícale cordialmente que la cocina está cerrada por ahora, muéstrale los horarios y ofrécele la carta en PDF llamando a send_menu_pdf. No crees pedidos inmediatos.`
      : '';

    // Rule 11: Explicit Order State (armando_carrito | esperando_direccion | esperando_pago | confirmando | enviado_cocina)
    let explicitState: 'armando_carrito' | 'esperando_direccion' | 'esperando_pago' | 'confirmando' | 'enviado_cocina' = 'armando_carrito';
    if (['ORDER_CONFIRMED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_DELIVERING', 'ORDER_COMPLETED'].includes(memory.current_state)) {
      explicitState = 'enviado_cocina';
    } else if (memory.current_state === 'ORDER_REVIEW') {
      explicitState = 'confirmando';
    } else if (memory.cart.length > 0) {
      if (memory.delivery_mode === 'delivery' && (!memory.address || memory.address.length < 5)) {
        explicitState = 'esperando_direccion';
      } else if (!memory.payment_method) {
        explicitState = 'esperando_pago';
      } else {
        explicitState = 'confirmando';
      }
    } else {
      explicitState = 'armando_carrito';
    }

    // Rule 36: Secuencia obligatoria antes de confirm_order
    const step1Cart = memory.cart.length > 0;
    const step2Delivery = memory.delivery_mode === 'pickup' || (memory.delivery_mode === 'delivery' && Boolean(memory.address && memory.address.length >= 5));
    const step3Payment = Boolean(memory.payment_method);
    const step4Digital = memory.payment_method !== 'transfer' || Boolean(memory.payment_details_provided);
    const step5Amount = memory.payment_method !== 'cash' || Boolean(memory.cash_amount && memory.cash_amount >= memory.total);
    const readyForConfirmQuestion = step1Cart && step2Delivery && step3Payment && step4Digital && step5Amount;

    const stateContext = `
[ESTADO ACTUAL DEL SISTEMA]
- Restaurante: ${restaurantName}
- Estado del pedido explícito (Regla 11): ${explicitState}
- Estado interno: ${memory.current_state}
- Carrito activo: ${cartItemsStr}
- Subtotal: $${(memory.subtotal || 0).toLocaleString('es-CO')} | Domicilio: $${(memory.delivery_fee || 0).toLocaleString('es-CO')} | Total: $${(memory.total || 0).toLocaleString('es-CO')}
- Modalidad: ${memory.delivery_mode === 'pickup' ? 'pickup (Recoge en tienda - Domicilio $0)' : (memory.delivery_mode || 'No definida')}
- Dirección registrada: ${memory.delivery_mode === 'pickup' ? 'Recoge en tienda' : (memory.address || 'No registrada')}
- Método de pago confirmado (Regla 28 y 34): ${memory.payment_method_literal || memory.payment_method || 'No definido'}
- Pago en efectivo: ${memory.cash_amount ? `$${memory.cash_amount.toLocaleString('es-CO')} (Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})` : 'N/A'}
- Último producto / variante conversado: ${memory.last_product || 'Ninguno'} ${memory.last_variant ? `(${memory.last_variant})` : ''}
${memory.order_code ? `- Pedido creado activo: ${memory.order_code}` : ''}
${memory.last_order_code && memory.last_order_code !== memory.order_code ? `\n⚠️ [REGLA 29 - AISLAMIENTO]: Existe un pedido previo confirmado (${memory.last_order_code}). PROHIBIDO mezclar productos, datos o especificaciones de ese pedido con el pedido nuevo actual.` : ''}

[SECUENCIA OBLIGATORIA REGLA 36]
1. Carrito con productos: ${step1Cart ? '✅' : '❌ Falta agregar producto'}
2. Modalidad y dirección: ${step2Delivery ? '✅' : '❌ Falta definir entrega o dirección'}
3. Método de pago: ${step3Payment ? `✅ (${memory.payment_method_literal || memory.payment_method})` : '❌ Falta definir método de pago'}
4. Datos de cuenta digital: ${memory.payment_method === 'transfer' ? (step4Digital ? '✅ Enviados' : '❌ OBLIGATORIO: llamar get_payment_details() (Regla 35)') : 'N/A'}
5. Monto en efectivo confirmado: ${memory.payment_method === 'cash' ? (step5Amount ? '✅' : '❌ Preguntar con cuánto paga para calcular vuelto') : 'N/A'}
6. Pregunta de confirmación puntual (Regla 32): ${readyForConfirmQuestion ? '👉 Formula: "¿Confirmas tu pedido por $X? Escribe Sí o Confirmo". NO confirmes hasta que responda Sí.' : '⏳ Completa los datos anteriores primero.'}
${closedNotice}
${memory.summary ? `\n[RESUMEN DE CONVERSACIÓN PREVIA]:\n${memory.summary}` : ''}
`.trim();

    messages.push({
      role: 'system',
      content: stateContext,
    });

    // 3. Short-term history (last 8 messages)
    const recentHistory = memory.history.slice(-8);
    for (const item of recentHistory) {
      if (item.role === 'user' || item.role === 'assistant') {
        messages.push({
          role: item.role,
          content: item.content,
        });
      }
    }

    return messages;
  }
}
