import { StructuredMemory } from '@/conversations/conversation.types';
import { CatalogService } from '@/backend/catalog.service';
import { DeliveryService } from '@/backend/delivery.service';
import { GuardValidationResult } from '../agent/agent.types';

export class AIGuard {
  /**
   * Main gatekeeper validating every tool call before it hits the backend.
   */
  public static async validateToolCall(
    tenantId: string,
    memory: StructuredMemory,
    toolName: string,
    args: Record<string, any>,
    userText?: string
  ): Promise<GuardValidationResult> {
    switch (toolName) {
      case 'add_item':
      case 'add_to_cart': {
        // Rule 11: Cannot add items if order has already been sent to kitchen
        if (['ORDER_CONFIRMED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_DELIVERING', 'ORDER_COMPLETED'].includes(memory.current_state)) {
          return {
            passed: false,
            reason: 'Tu pedido ya fue enviado a cocina y se encuentra en preparación. Para modificarlo o agregar más productos, por favor usa escalate_to_human.',
          };
        }

        const query = args.product_id || args.product_name_or_id || '';
        const variant = args.size || args.variant;
        const quantity = Number(args.quantity) || 1;
        const rawNotes = Array.isArray(args.notes) ? args.notes.join(', ') : (args.notes || '');
        const rawAdditions = args.addons || args.additions;

        if (quantity <= 0 || quantity > 50) {
          return { passed: false, reason: 'Cantidad inválida. Debe ser entre 1 y 50.' };
        }

        // Rule 24: Validate that the product was actually mentioned in userText, and quantity is not hallucinated
        let verifiedQuantity = quantity;
        if (userText) {
          const normText = CatalogService.normalize(userText);
          const words = normText.split(/\s+/).filter(w => w.length > 2);

          // Ambiguous single word check (e.g. "aguila", "cerveza", "queso", "salchipapa")
          const isSingleAmbiguousWord = words.length <= 1 && ['aguila', 'cerveza', 'queso', 'papas', 'carne', 'pollo', 'salsa', 'tocineta'].includes(words[0]);
          if (isSingleAmbiguousWord) {
            return {
              passed: false,
              reason: `AMBIGUOUS_PRODUCT_MENTION: El cliente escribió únicamente "${userText.trim()}". Pregunta qué producto y cantidad desea sin agregar nada al carrito.`,
            };
          }

          // Quantity validation: if quantity > 1 was specified by the model, verify customer actually said it
          if (quantity > 1) {
            const hasExplicitNumber = new RegExp(`\\b(${quantity}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\\b`, 'i').test(userText);
            if (!hasExplicitNumber) {
              // The customer didn't say quantity > 1. Fall back to 1 per Rule 24
              verifiedQuantity = 1;
            }
          }

          // Rule 24: Disallow inventing products that were not mentioned in customer message
          const prodNorm = CatalogService.normalize(query || '');
          const prodKeywords = prodNorm.split(/\s+/).filter(w => w.length > 3 && !['para', 'con', 'sin', 'shek', 'combo'].includes(w));
          if (prodKeywords.length > 0) {
            const hasMatch = prodKeywords.some(kw => normText.includes(kw)) ||
                             normText.includes(prodNorm) ||
                             normText.includes('salchipapa') ||
                             normText.includes('granizado') ||
                             normText.includes('hamburguesa') ||
                             normText.includes('perro');
            if (!hasMatch) {
              return {
                passed: false,
                reason: `PRODUCT_NOT_MENTIONED: El producto "${query}" no fue mencionado por el cliente en su mensaje ("${userText.trim()}").`,
              };
            }
          }
        }

        // Search product in this specific tenant
        const searchTarget = variant ? `${query} ${variant}` : query;
        const matches = await CatalogService.searchProducts(tenantId, searchTarget);

        if (matches.length === 0) {
          // If no matches found, do NOT let AI invent an item
          return {
            passed: false,
            reason: `PRODUCT_NOT_FOUND: No se encontró "${query}" en el menú oficial de este restaurante.`,
          };
        }

        // Best match
        const selected = matches[0];

        // Validate stock
        const stockCheck = await CatalogService.validateStock(tenantId, selected.id, verifiedQuantity);
        if (!stockCheck.available) {
          return {
            passed: false,
            reason: `STOCK_UNAVAILABLE: El producto ${selected.name} no tiene suficiente stock disponible.`,
          };
        }

        // Rule 9: Discard notes that do not make sense for this product category
        let verifiedNotes = rawNotes ? String(rawNotes).trim() : undefined;
        if (verifiedNotes && !CatalogService.isNoteApplicableToProduct(selected.name, verifiedNotes)) {
          verifiedNotes = undefined;
        }

        // Sanitize arguments with verified product ID and database price
        return {
          passed: true,
          sanitizedArguments: {
            product_name_or_id: selected.id,
            product_name: selected.name,
            unit_price: Number(selected.price),
            quantity: verifiedQuantity,
            notes: verifiedNotes,
            additions: rawAdditions || undefined,
          },
        };
      }

      case 'add_addon': {
        if (memory.cart.length === 0) {
          return { passed: false, reason: 'El carrito está vacío. Debes agregar un producto primero antes de pedir una adición.' };
        }
        const addonName = args.addon_id || args.addon_name;
        if (!addonName || typeof addonName !== 'string' || !addonName.trim()) {
          return { passed: false, reason: 'Debes indicar el nombre del adicional (ej: Guacamole, Tocineta, Queso).' };
        }
        return { passed: true, sanitizedArguments: args };
      }

      case 'update_quantity':
      case 'update_cart_item': {
        if (memory.cart.length === 0) {
          return { passed: false, reason: 'El carrito está vacío. No hay items para modificar.' };
        }
        return { passed: true, sanitizedArguments: args };
      }

      case 'remove_item':
      case 'remove_cart_item': {
        if (memory.cart.length === 0) {
          return { passed: false, reason: 'El carrito está vacío. No hay items para eliminar.' };
        }
        return { passed: true, sanitizedArguments: args };
      }

      case 'validate_delivery_zone': {
        const address = args.address;
        if (!address || typeof address !== 'string' || address.trim().length < 4) {
          return { passed: false, reason: 'Dirección demasiado corta o incompleta.' };
        }
        return { passed: true, sanitizedArguments: { address: address.trim() } };
      }

      case 'calculate_change':
      case 'provide_cash_amount': {
        // Rule 25: Digital payment (Nequi/transfer) never uses cash change logic
        if (memory.payment_method === 'transfer') {
          return {
            passed: false,
            reason: 'DIGITAL_PAYMENT_NO_CHANGE: Para pagos por transferencia o Nequi se transfiere el monto exacto. No aplica cálculo de devuelta ni monto en efectivo.',
          };
        }
        const rawAmount = Number(args.monto_entregado !== undefined ? args.monto_entregado : args.cash_amount);
        if (isNaN(rawAmount) || rawAmount <= 0) {
          return { passed: false, reason: 'El monto en efectivo debe ser un número positivo.' };
        }
        return { passed: true, sanitizedArguments: { cash_amount: rawAmount, monto_entregado: rawAmount } };
      }

      case 'confirm_order':
      case 'create_order': {
        // Rule 20: A confirmed order is immutable for cart flow
        if (memory.current_state === 'ORDER_CONFIRMED' || (memory.order_code && memory.cart.length === 0)) {
          return {
            passed: false,
            reason: `ORDER_ALREADY_CONFIRMED: El pedido ya fue confirmado exitosamente con el código ${memory.order_code || 'activo'}.`,
          };
        }

        // Rule 36 Step 1: Carrito con al menos un producto
        if (memory.cart.length === 0) {
          return { passed: false, reason: 'CART_EMPTY: No se puede confirmar un pedido con el carrito vacío (Regla 36, Paso 1).' };
        }

        // Rule 36 Step 2: delivery_type definido (domicilio con dirección, o pickup)
        if (!memory.delivery_mode) {
          return {
            passed: false,
            reason: 'FALTA_MODALIDAD_ENTREGA: Debes definir si el pedido es a domicilio o para recoger en tienda (Regla 36, Paso 2).',
          };
        }
        if (memory.delivery_mode === 'delivery' && (!memory.address || memory.address.length < 5)) {
          return {
            passed: false,
            reason: 'FALTA_DIRECCION: Falta la dirección de entrega para confirmar el pedido a domicilio (Regla 36, Paso 2).',
          };
        }

        // Rule 36 Step 3: payment_method definido explícitamente por el cliente
        if (!memory.payment_method) {
          return {
            passed: false,
            reason: 'FALTA_METODO_PAGO: El pedido no tiene método de pago registrado (Regla 36, Paso 3). Debes indicar si pagas en Efectivo o Transferencia/Nequi.',
          };
        }

        // Rule 35 & Rule 36 Step 4: Si es pago digital, datos de cuenta ya enviados
        if (memory.payment_method === 'transfer' && !memory.payment_details_provided) {
          return {
            passed: false,
            reason: 'FALTAN_DATOS_CUENTA: Antes de confirmar un pago digital, DEBES enviar primero los datos de la cuenta usando get_payment_details() (Reglas 31, 35 y 36 Paso 4).',
          };
        }

        // Rule 36 Step 5: Monto de pago confirmado por el cliente (si es efectivo)
        if (memory.payment_method === 'cash') {
          if (!memory.cash_amount || memory.cash_amount <= 0) {
            return {
              passed: false,
              reason: 'FALTA_MONTO_EFECTIVO: El cliente pagará en efectivo pero no ha indicado con cuánto dinero pagará (Regla 36, Paso 5).',
            };
          }
          if (memory.total > 0 && memory.cash_amount < memory.total) {
            return {
              passed: false,
              reason: `MONTO_INSUFICIENTE: El monto en efectivo ($${memory.cash_amount.toLocaleString('es-CO')}) no alcanza para cubrir el total ($${memory.total.toLocaleString('es-CO')}).`,
            };
          }
        }

        // Rule 32 & Rule 36 Step 6: Paso de confirmación final OBLIGATORIO Y SEPARADO de cualquier otro dato
        if (userText) {
          const norm = CatalogService.normalize(userText);
          const isJustCashAmount = /^(pago con|con)\s*\d+/i.test(norm) || /^\$?\d{4,6}$/.test(norm.replace(/\D/g, ''));
          const isJustAddress = /\b(calle|cra|carrera|diagonal|transversal|avenida|barrio|#)\b/i.test(norm) && !/\b(confirmo|confirmar|si|dale)\b/i.test(norm);
          const isAffirmative = /\b(si|confirmo|confirmar|dale|de acuerdo|listo|proceder|ok|afirmativo|confirmado|hacer pedido)\b/i.test(norm);

          if ((isJustCashAmount || isJustAddress) && !isAffirmative) {
            return {
              passed: false,
              reason: 'PASO_CONFIRMACION_SEPARADO: NUNCA ejecutes confirm_order() como reacción a que el cliente te dé un monto o dirección (Regla 32). Primero responde con el cambio/resumen y formula la pregunta explícita "¿Confirmas tu pedido por $X? Escribe Sí o Confirmo".',
            };
          }

          if (!isAffirmative && !args.confirmation_explicit) {
            return {
              passed: false,
              reason: 'REQUIERE_RESPUESTA_AFIRMATIVA: El cliente no ha respondido afirmativamente a la pregunta de confirmación (Reglas 32 y 36, Paso 6).',
            };
          }
        }

        if (!args.confirmation_explicit) {
          return {
            passed: false,
            reason: 'El cliente no ha confirmado explícitamente el pedido todavía (Regla 36, Paso 6).',
          };
        }

        // Rule 26: Validate line consistency before confirming (detect duplicate lines)
        const seenItems = new Set<string>();
        let hasDuplicateLine = false;
        for (const item of memory.cart) {
          const key = `${CatalogService.normalize(item.productName)}_${item.unitPrice}`;
          if (seenItems.has(key)) {
            hasDuplicateLine = true;
            break;
          }
          seenItems.add(key);
        }

        if (hasDuplicateLine) {
          return {
            passed: false,
            reason: 'DUPLICATE_LINES_DETECTED: Se detectó una línea de producto duplicada en el carrito antes de confirmar. Debes transferir a un asesor humano con escalate_to_human().',
          };
        }

        return { passed: true, sanitizedArguments: args };
      }

      case 'calculate_order':
      case 'get_cart_summary':
      case 'get_cart':
      case 'get_categories':
      case 'get_products':
      case 'get_product_variants':
      case 'get_delivery_fee':
      case 'get_payment_methods':
      case 'get_payment_instructions':
      case 'get_payment_details':
      case 'clear_cart':
      case 'get_order_status':
      case 'get_order_details':
      case 'get_order':
      case 'cancel_order':
      case 'escalate_to_human':
      case 'handoff_to_human':
        return { passed: true, sanitizedArguments: args };

      default:
        return { passed: true, sanitizedArguments: args };
    }
  }

  /**
   * FINANCIAL INTEGRITY RULE:
   * Discards any totals, subtotals or change amounts proposed by the LLM
   * and enforces authoritative values from the backend.
   */
  public static enforceFinancialIntegrity(
    backendSubtotal: number,
    backendDeliveryFee: number,
    backendTotal: number,
    backendChange?: number
  ): { subtotal: number; delivery_fee: number; total: number; change?: number } {
    return {
      subtotal: backendSubtotal,
      delivery_fee: backendDeliveryFee,
      total: backendSubtotal + backendDeliveryFee,
      change: backendChange,
    };
  }
}
