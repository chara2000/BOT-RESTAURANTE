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

    const stateContext = `
[ESTADO ACTUAL DEL SISTEMA]
- Restaurante: ${restaurantName}
- Estado del pedido explícito (Regla 11): ${explicitState}
- Estado interno: ${memory.current_state}
- Carrito activo: ${cartItemsStr}
- Subtotal: $${(memory.subtotal || 0).toLocaleString('es-CO')} | Domicilio: $${(memory.delivery_fee || 0).toLocaleString('es-CO')} | Total: $${(memory.total || 0).toLocaleString('es-CO')}
- Modalidad: ${memory.delivery_mode || 'No definida'}
- Dirección registrada: ${memory.address || 'No registrada'}
- Método de pago: ${memory.payment_method || 'No definido'}
- Pago en efectivo: ${memory.cash_amount ? `$${memory.cash_amount.toLocaleString('es-CO')} (Devuelta: $${(memory.change_amount || 0).toLocaleString('es-CO')})` : 'N/A'}
- Último producto / variante conversado: ${memory.last_product || 'Ninguno'} ${memory.last_variant ? `(${memory.last_variant})` : ''}
${memory.order_code ? `- Pedido creado: ${memory.order_code}` : ''}
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
