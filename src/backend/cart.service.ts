import { StructuredMemory, CartItem } from '@/conversations/conversation.types';
import { MemoryService } from '@/conversations/memory.service';
import { CatalogService } from './catalog.service';

export class CartService {
  /**
   * Adds a product to the cart. Always fetches true price from database.
   */
  public static async addItem(
    memory: StructuredMemory,
    productId: string,
    quantity = 1,
    notes?: string,
    variantId?: string
  ): Promise<{ success: boolean; item?: CartItem; error?: string }> {
    const targetProductId = variantId || productId;
    let product = await CatalogService.getProduct(memory.tenant_id, targetProductId);

    if (!product) {
      const searchMatches = await CatalogService.searchProducts(memory.tenant_id, targetProductId);
      if (searchMatches.length > 0) {
        product = searchMatches[0];
      }
    }

    if (!product) {
      return { success: false, error: 'PRODUCT_NOT_FOUND' };
    }

    if (!product.is_available) {
      return { success: false, error: 'PRODUCT_UNAVAILABLE' };
    }

    const safeQuantity = Math.max(1, Math.min(quantity, 50));

    // Check if same product/variant with same notes already exists in cart
    const existingIndex = memory.cart.findIndex(
      i => i.productId === product.id && (i.notes || '') === (notes || '')
    );

    let item: CartItem;

    if (existingIndex >= 0) {
      memory.cart[existingIndex].quantity += safeQuantity;
      item = memory.cart[existingIndex];
    } else {
      item = {
        id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price), // Authoritative price from DB
        quantity: safeQuantity,
        notes: notes || undefined,
      };
      memory.cart.push(item);
    }

    // Record last modified product in structured memory
    memory.last_product = product.name;
    memory.last_quantity = safeQuantity;

    MemoryService.recalculateCartTotals(memory);
    return { success: true, item };
  }

  /**
   * Updates an item's quantity (e.g. "agrégame otra", "quita una", "quiero 2")
   */
  public static updateItemQuantity(
    memory: StructuredMemory,
    itemIdOrQuery: string,
    deltaOrTotal: { delta?: number; totalQuantity?: number }
  ): { success: boolean; item?: CartItem; error?: string } {
    if (memory.cart.length === 0) {
      return { success: false, error: 'CART_EMPTY' };
    }

    // Find target item by item ID or name match
    let targetIndex = -1;
    if (itemIdOrQuery) {
      targetIndex = memory.cart.findIndex(
        i => i.id === itemIdOrQuery || CatalogService.normalize(i.productName).includes(CatalogService.normalize(itemIdOrQuery))
      );
    }

    // If no match, pick the last added item
    if (targetIndex === -1 && memory.cart.length > 0) {
      targetIndex = memory.cart.length - 1;
    }

    if (targetIndex === -1) {
      return { success: false, error: 'ITEM_NOT_FOUND' };
    }

    const item = memory.cart[targetIndex];

    if (deltaOrTotal.totalQuantity !== undefined) {
      item.quantity = Math.max(0, deltaOrTotal.totalQuantity);
    } else if (deltaOrTotal.delta !== undefined) {
      item.quantity = Math.max(0, item.quantity + deltaOrTotal.delta);
    }

    if (item.quantity <= 0) {
      memory.cart.splice(targetIndex, 1);
    }

    MemoryService.recalculateCartTotals(memory);
    return { success: true, item };
  }

  /**
   * Replaces an item's variant (e.g. "No, mejor M" -> replaces Shek XL with Shek M)
   */
  public static async updateItemVariant(
    memory: StructuredMemory,
    newVariantProduct: string | { id: string; name: string; price: number }
  ): Promise<{ success: boolean; item?: CartItem; error?: string }> {
    if (memory.cart.length === 0) {
      return { success: false, error: 'CART_EMPTY' };
    }

    let targetProduct: any = null;
    if (typeof newVariantProduct === 'string') {
      const results = await CatalogService.searchProducts(memory.tenant_id, newVariantProduct);
      if (results.length > 0) {
        targetProduct = results[0];
      }
    } else {
      targetProduct = newVariantProduct;
    }

    if (!targetProduct) {
      return { success: false, error: 'VARIANT_NOT_FOUND' };
    }

    // Replace the last item or an item of similar family
    const lastIndex = memory.cart.length - 1;
    const oldItem = memory.cart[lastIndex];

    const updatedItem: CartItem = {
      id: oldItem ? oldItem.id : `ci_${Date.now()}`,
      productId: targetProduct.id,
      productName: targetProduct.name,
      unitPrice: Number(targetProduct.price),
      quantity: oldItem ? oldItem.quantity : 1,
      notes: oldItem?.notes,
    };

    if (lastIndex >= 0) {
      memory.cart[lastIndex] = updatedItem;
    } else {
      memory.cart.push(updatedItem);
    }

    memory.last_product = targetProduct.name;
    memory.last_variant = targetProduct.name;

    MemoryService.recalculateCartTotals(memory);
    return { success: true, item: updatedItem };
  }

  /**
   * Removes an item from the cart
   */
  public static removeItem(memory: StructuredMemory, itemIdOrName: string): boolean {
    const clean = CatalogService.normalize(itemIdOrName);
    const initialLen = memory.cart.length;

    memory.cart = memory.cart.filter(
      i => i.id !== itemIdOrName && !CatalogService.normalize(i.productName).includes(clean)
    );

    const removed = memory.cart.length < initialLen;
    if (removed) {
      MemoryService.recalculateCartTotals(memory);
    }
    return removed;
  }

  /**
   * Clears all items in the cart
   */
  public static clearCart(memory: StructuredMemory): void {
    memory.cart = [];
    memory.subtotal = 0;
    memory.total = 0;
    memory.delivery_fee = 0;
    MemoryService.recalculateCartTotals(memory);
  }

  /**
   * Formats the current cart into a clean text summary
   */
  public static formatCartSummary(memory: StructuredMemory): string {
    if (!memory.cart || memory.cart.length === 0) {
      return '🛒 Tu carrito está vacío.';
    }

    const lines = memory.cart.map((item, idx) => {
      const noteStr = item.notes ? ` _(${item.notes})_` : '';
      const itemTotal = item.unitPrice * item.quantity;
      return `• *${item.productName}* ×${item.quantity} — $${itemTotal.toLocaleString('es-CO')}${noteStr}`;
    });

    const feeLine = memory.delivery_mode === 'delivery' && memory.delivery_fee > 0
      ? `\n🛵 Domicilio — $${memory.delivery_fee.toLocaleString('es-CO')}`
      : '';

    return [
      `🛒 *RESUMEN DE TU PEDIDO:*`,
      ...lines,
      feeLine,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 *TOTAL: $${memory.total.toLocaleString('es-CO')}*`,
    ].filter(Boolean).join('\n');
  }
}
