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
    args: Record<string, any>
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
        const stockCheck = await CatalogService.validateStock(tenantId, selected.id, quantity);
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
            quantity,
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
        const rawAmount = Number(args.monto_entregado !== undefined ? args.monto_entregado : args.cash_amount);
        if (isNaN(rawAmount) || rawAmount <= 0) {
          return { passed: false, reason: 'El monto en efectivo debe ser un número positivo.' };
        }
        return { passed: true, sanitizedArguments: { cash_amount: rawAmount, monto_entregado: rawAmount } };
      }

      case 'confirm_order':
      case 'create_order': {
        if (memory.cart.length === 0) {
          return { passed: false, reason: 'No se puede confirmar un pedido con el carrito vacío.' };
        }

        if (!args.confirmation_explicit) {
          return {
            passed: false,
            reason: 'El cliente no ha confirmado explícitamente el pedido todavía.',
          };
        }

        // Rule 11: Ensure delivery address is provided if mode is delivery (esperando_direccion)
        if (memory.delivery_mode === 'delivery' && (!memory.address || memory.address.length < 5)) {
          return {
            passed: false,
            reason: 'Falta la dirección de entrega para confirmar el pedido a domicilio (estado: esperando_direccion).',
          };
        }

        // Rule 15: Payment method is mandatory before confirming order
        if (!memory.payment_method) {
          return {
            passed: false,
            reason: 'FALTA_METODO_PAGO: El pedido no tiene método de pago registrado. Antes de confirmar, debes preguntar al cliente cómo prefiere pagar: Efectivo, Transferencia o Datáfono/Tarjeta.',
          };
        }

        // Rule 15: If cash, cash_amount is mandatory before confirming order
        if (memory.payment_method === 'cash') {
          if (!memory.cash_amount || memory.cash_amount <= 0) {
            return {
              passed: false,
              reason: 'FALTA_MONTO_EFECTIVO: El cliente pagará en efectivo pero no ha indicado con cuánto dinero pagará. Pregúntale: "¿Con cuánto pagas?" para calcular el vuelto/devuelta exacto con calculate_change() antes de confirmar.',
            };
          }
          if (memory.total > 0 && memory.cash_amount < memory.total) {
            return {
              passed: false,
              reason: `MONTO_INSUFICIENTE: El cliente pagará con $${memory.cash_amount.toLocaleString('es-CO')}, monto que no alcanza para cubrir el total de $${memory.total.toLocaleString('es-CO')}. Por favor solicita un valor suficiente.`,
            };
          }
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
      case 'clear_cart':
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
