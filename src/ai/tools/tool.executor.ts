import { StructuredMemory } from '@/conversations/conversation.types';
import { CatalogService } from '@/backend/catalog.service';
import { CartService } from '@/backend/cart.service';
import { DeliveryService } from '@/backend/delivery.service';
import { PaymentService } from '@/backend/payment.service';
import { OrderService } from '@/backend/order.service';
import { StateService } from '@/conversations/state.service';

export class ToolExecutor {
  /**
   * Executes a validated tool call against backend domain services.
   */
  public static async execute(
    tenantId: string,
    memory: StructuredMemory,
    name: string,
    args: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      switch (name) {
        // ── Products ──
        case 'search_products': {
          const products = await CatalogService.searchProducts(tenantId, args.query);
          return {
            success: true,
            data: products.map(p => ({
              id: p.id,
              name: p.name,
              price: p.price,
              description: p.description,
              is_available: p.is_available,
            })),
          };
        }

        case 'get_categories': {
          const categories = await CatalogService.getCategories(tenantId);
          StateService.transition(memory, 'BROWSING_CATEGORIES');
          return {
            success: true,
            data: categories.map(c => ({ id: c.id, name: c.name, description: c.description })),
          };
        }

        case 'get_products': {
          const products = await CatalogService.getProducts(tenantId, args.category_id);
          StateService.transition(memory, 'BROWSING_PRODUCTS');
          return {
            success: true,
            data: products.map(p => ({
              id: p.id,
              name: p.name,
              price: p.price,
              description: p.description,
            })),
          };
        }

        case 'send_menu_pdf': {
          const pdfUrl = await CatalogService.getMenuPdf(tenantId);
          return {
            success: true,
            data: {
              pdf_url: pdfUrl,
              message: pdfUrl
                ? '📄 Aquí tienes nuestra carta oficial en PDF con fotos, platillos y precios. 🍟✨'
                : 'En este momento no hay un archivo PDF configurado, pero puedes consultar todo el menú escribiendo "ver menú" 🍽️',
            },
          };
        }

        case 'get_product_variants': {
          const variants = await CatalogService.getProductVariants(tenantId, args.product_name);
          return { success: true, data: variants };
        }

        case 'validate_stock': {
          const check = await CatalogService.validateStock(tenantId, args.product_id, args.quantity);
          return { success: true, data: check };
        }

        // ── Cart ──
        case 'get_cart_summary':
        case 'get_cart': {
          StateService.transition(memory, 'CART');
          await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              items: memory.cart,
              subtotal: memory.subtotal,
              delivery_fee: memory.delivery_fee,
              total: memory.total,
              delivery_mode: memory.delivery_mode,
              address: memory.address,
              payment_method: memory.payment_method,
              formattedSummary: CartService.formatCartSummary(memory),
            },
          };
        }

        case 'add_item':
        case 'add_to_cart': {
          const productNameOrId = args.product_id || args.product_name_or_id;
          const variant = args.size || args.variant;
          const quantity = Number(args.quantity) || 1;
          const notes = Array.isArray(args.notes) ? args.notes.join(', ') : args.notes;
          const additions = args.addons || args.additions;

          const result = await CartService.addItem(
            memory,
            productNameOrId,
            quantity,
            notes,
            variant,
            additions
          );
          if (!result.success) {
            return { success: false, error: result.error };
          }
          StateService.transition(memory, 'CART');
          await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              addedItem: result.item,
              currentTotal: memory.total,
              cartItemCount: memory.cart.length,
            },
          };
        }

        case 'add_addon': {
          const itemQuery = args.cart_item_id || args.item_query;
          const addonName = args.addon_id || args.addon_name;
          const result = await CartService.addAddonToItem(memory, itemQuery, addonName);
          if (!result.success) {
            return {
              success: false,
              error: result.error,
              data: {
                ambiguous: result.ambiguous,
                candidates: result.candidates,
              },
            };
          }
          StateService.transition(memory, 'CART');
          await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              item: result.item,
              addon: result.addon,
              newItemUnitPrice: result.newItemUnitPrice,
              newItemTotalPrice: result.newItemTotalPrice,
              currentTotal: memory.total,
            },
          };
        }

        case 'update_quantity': {
          const itemQuery = args.cart_item_id || args.item_query;
          const quantity = args.qty !== undefined ? args.qty : args.quantity;
          const qtyResult = CartService.updateItemQuantity(memory, itemQuery, {
            totalQuantity: quantity,
          });
          if (!qtyResult.success) return { success: false, error: qtyResult.error };
          await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              cart: memory.cart,
              total: memory.total,
            },
          };
        }

        case 'update_cart_item': {
          if (args.new_variant) {
            const varResult = await CartService.updateItemVariant(memory, args.new_variant);
            if (!varResult.success) return { success: false, error: varResult.error };
          }
          if (args.quantity !== undefined || args.delta !== undefined) {
            const qtyResult = CartService.updateItemQuantity(memory, args.item_query, {
              totalQuantity: args.quantity,
              delta: args.delta,
            });
            if (!qtyResult.success) return { success: false, error: qtyResult.error };
          }
          await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              cart: memory.cart,
              total: memory.total,
            },
          };
        }

        case 'remove_item':
        case 'remove_cart_item': {
          const itemQuery = args.cart_item_id || args.item_query;
          const removed = CartService.removeItem(memory, itemQuery);
          await OrderService.calculateOrder(memory);
          return { success: removed, data: { total: memory.total, cart: memory.cart } };
        }

        case 'clear_cart': {
          CartService.clearCart(memory);
          StateService.transition(memory, 'WELCOME');
          return { success: true, data: { message: 'Carrito vaciado exitosamente.' } };
        }

        // ── Delivery ──
        case 'validate_delivery_zone': {
          StateService.transition(memory, 'ASKING_ADDRESS');
          const validation = await DeliveryService.validateDeliveryZone(tenantId, args.address);
          if (validation.valid) {
            memory.address = args.address;
            memory.delivery_mode = 'delivery';
            memory.delivery_fee = validation.fee;
            StateService.transition(memory, 'CALCULATING_DELIVERY');
            await OrderService.calculateOrder(memory);
          }
          return { success: true, data: validation };
        }

        case 'get_delivery_fee': {
          const fee = await DeliveryService.getDeliveryFee(tenantId, args.address);
          memory.delivery_fee = fee;
          return { success: true, data: { fee } };
        }

        // ── Payment ──
        case 'get_payment_methods': {
          StateService.transition(memory, 'ASKING_PAYMENT');
          const methods = await PaymentService.getPaymentMethods(tenantId);
          return { success: true, data: methods };
        }

        case 'get_payment_instructions': {
          memory.payment_method = args.method.toLowerCase().includes('transfer') ? 'transfer' : 'cash';
          StateService.transition(memory, 'PAYMENT_PENDING');
          const instructions = await PaymentService.getPaymentInstructions(tenantId, args.method);
          return { success: true, data: instructions };
        }

        case 'calculate_change':
        case 'provide_cash_amount': {
          const rawAmount = Number(args.monto_entregado !== undefined ? args.monto_entregado : args.cash_amount);
          memory.payment_method = 'cash';
          memory.cash_amount = rawAmount;
          await OrderService.calculateOrder(memory);
          const changeResult = PaymentService.calculateCashChange(memory.total, rawAmount);
          if (changeResult.valid) {
            memory.change_amount = changeResult.change;
            StateService.transition(memory, 'ORDER_REVIEW');
          }
          return { success: changeResult.valid, data: changeResult };
        }

        // ── Orders ──
        case 'calculate_order': {
          StateService.transition(memory, 'ORDER_REVIEW');
          const calculation = await OrderService.calculateOrder(memory);
          return {
            success: true,
            data: {
              ...calculation,
              cart: memory.cart,
              address: memory.address,
              payment_method: memory.payment_method,
              cash_amount: memory.cash_amount,
              change_amount: memory.change_amount,
            },
          };
        }

        case 'confirm_order':
        case 'create_order': {
          const result = await OrderService.createOrder(memory);
          if (result.success) {
            StateService.transition(memory, 'ORDER_CONFIRMED');
          }
          return { success: result.success, data: result };
        }

        case 'get_order': {
          StateService.transition(memory, 'ORDER_TRACKING');
          const order = await OrderService.getOrder(tenantId, args.order_id);
          if (!order) return { success: false, error: 'Pedido no encontrado' };
          return { success: true, data: order };
        }

        case 'cancel_order': {
          const cancelResult = await OrderService.cancelOrder(tenantId, args.order_id);
          return cancelResult;
        }

        // ── Human Handoff ──
        case 'escalate_to_human':
        case 'handoff_to_human': {
          StateService.transition(memory, 'HUMAN_HANDOFF');
          memory.handoff_status = true;
          return { success: true, data: { message: 'Transferido a asesor humano', reason: args.reason } };
        }

        default:
          return { success: false, error: `Tool desconocida: ${name}` };
      }
    } catch (err) {
      console.error(`[ToolExecutor] Error executing ${name}:`, err);
      return { success: false, error: (err as Error).message };
    }
  }
}
