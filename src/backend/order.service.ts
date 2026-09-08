import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StructuredMemory } from '@/conversations/conversation.types';
import { MemoryService } from '@/conversations/memory.service';
import { DeliveryService } from './delivery.service';
import crypto from 'crypto';

// In-memory idempotency cache: idempotencyKey -> order result
const createdOrdersIdempotencyMap = new Map<string, { orderId: string; orderCode: string; total: number; items?: any[]; timestamp: number }>();

export class OrderService {
  private static getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /**
   * Calculates order totals strictly from database prices and tenant delivery fee.
   * Discards any financial values calculated by the LLM.
   */
  public static async calculateOrder(memory: StructuredMemory): Promise<{
    subtotal: number;
    delivery_fee: number;
    total: number;
    itemCount: number;
  }> {
    MemoryService.recalculateCartTotals(memory);

    // If delivery mode is active and delivery fee not set, fetch from DB
    if (memory.delivery_mode === 'delivery' && (!memory.delivery_fee || memory.delivery_fee === 0)) {
      memory.delivery_fee = await DeliveryService.getDeliveryFee(memory.tenant_id, memory.address);
      MemoryService.recalculateCartTotals(memory);
    } else if (memory.delivery_mode === 'pickup') {
      memory.delivery_fee = 0;
      MemoryService.recalculateCartTotals(memory);
    }

    const itemCount = memory.cart.reduce((sum, i) => sum + i.quantity, 0);
    return {
      subtotal: memory.subtotal,
      delivery_fee: memory.delivery_fee,
      total: memory.total,
      itemCount,
    };
  }

  /**
   * Creates an order with strict idempotency.
   */
  public static async createOrder(
    memory: StructuredMemory,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    orderId?: string;
    orderCode?: string;
    total: number;
    delivery_fee?: number;
    items?: any[];
    error?: string;
    duplicate?: boolean;
  }> {
    // 1. Check idempotency key FIRST before anything else
    const resolvedKey = idempotencyKey || `${memory.conversation_id}_${memory.cart_id}_confirm`;
    const cached = createdOrdersIdempotencyMap.get(resolvedKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      console.log(`[OrderService] Idempotency hit for key: ${resolvedKey}, returning existing order ${cached.orderCode}`);
      return {
        success: true,
        orderId: cached.orderId,
        orderCode: cached.orderCode,
        total: cached.total,
        items: cached.items,
        duplicate: true,
      };
    }

    if (!memory.cart || memory.cart.length === 0) {
      return { success: false, total: 0, error: 'CART_EMPTY' };
    }

    // Rule 26: Validate line consistency before confirming (detect duplicate lines)
    const seenItems = new Set<string>();
    for (const item of memory.cart) {
      const key = `${item.productId}_${item.unitPrice}`;
      if (seenItems.has(key)) {
        console.warn(`[OrderService] Duplicate line detected for product ${item.productName} (${key})`);
        return { success: false, total: memory.total, error: 'DUPLICATE_LINES_DETECTED' };
      }
      seenItems.add(key);
    }

    // 2. Perform authoritative total calculation
    await this.calculateOrder(memory);

    const supabase = this.getSupabase();
    const orderId = crypto.randomUUID();
    const orderCode = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();

    // 3. Resolve or create customer
    let customerId: string | null = null;
    const phone = memory.phone.replace(/^whatsapp:/i, '').replace(/\D/g, '') || memory.phone;

    try {
      const { data: existingCust } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', memory.tenant_id)
        .or(`whatsapp_id.eq.${phone},phone.eq.${phone}`)
        .limit(1)
        .maybeSingle();

      if (existingCust?.id) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from('customers')
          .insert({
            tenant_id: memory.tenant_id,
            name: memory.customer_name || 'Cliente WhatsApp',
            phone,
            whatsapp_id: phone,
            address_default: memory.address || null,
            segment: 'new',
            total_spent: 0,
            order_count: 0,
          })
          .select('id')
          .single();

        if (newCust?.id) customerId = newCust.id;
      }
    } catch (e) {
      console.warn('[OrderService] Customer resolve error:', e);
    }

    // 4. Resolve default branch for tenant
    let branchId = 'b0000000-0000-4000-8000-000000000001';
    try {
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', memory.tenant_id)
        .limit(1)
        .maybeSingle();
      if (branch?.id) branchId = branch.id;
    } catch {}

    // 5. Build order notes
    let notes = `[ID: ${orderCode}] [CHAT_ID: ${phone}] [WA: ${phone}] [Cliente: ${memory.customer_name || 'Cliente WhatsApp'}]`;
    if (memory.payment_method === 'cash') {
      const changeText = memory.change_amount !== undefined
        ? `Devuelta: $${memory.change_amount.toLocaleString('es-CO')}`
        : 'Sin devuelta';
      notes += ` | [EFECTIVO] Pagó con: $${(memory.cash_amount || memory.total).toLocaleString('es-CO')} (${changeText})`;
    } else if (memory.payment_method === 'transfer') {
      notes += ` | [TRANSFERENCIA] Pendiente comprobante`;
    }

    const orderType = memory.delivery_mode === 'pickup' ? 'pickup' : 'delivery';
    const isPickup = orderType === 'pickup';
    if (isPickup) notes += ` | [RECOGER EN LOCAL]`;

    // 6. Insert Order
    const { error: orderError } = await supabase.from('orders').insert({
      id: orderId,
      tenant_id: memory.tenant_id,
      branch_id: branchId,
      customer_id: customerId,
      type: orderType,
      status: 'pending',
      payment_method: memory.payment_method || 'cash',
      subtotal: memory.subtotal,
      delivery_fee: isPickup ? 0 : memory.delivery_fee,
      tips: 0,
      total: memory.total,
      delivery_address: memory.address || (isPickup ? 'Para Recoger en el local' : null),
      notes,
      created_at: new Date().toISOString(),
    });

    if (orderError) {
      console.error('[OrderService] Order insert error:', orderError);
      return { success: false, total: memory.total, error: orderError.message };
    }

    // 7. Insert Order Items
    const orderItems = memory.cart.map(item => ({
      order_id: orderId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.unitPrice * item.quantity,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('[OrderService] Items insert error:', itemsError);
    }

    // 8. If delivery and location is available, save delivery details
    if (orderType === 'delivery') {
      await supabase.from('delivery_details').insert({
        order_id: orderId,
        status: 'searching',
        latitude: memory.location?.latitude || 3.2317,
        longitude: memory.location?.longitude || -76.4194,
      });
    }

    // 9. Snapshot ordered items before clearing cart
    const orderedItems = memory.cart.map(i => ({ ...i }));

    // Record idempotency in memory
    createdOrdersIdempotencyMap.set(resolvedKey, {
      orderId,
      orderCode,
      total: memory.total,
      items: orderedItems,
      timestamp: Date.now(),
    });

    // 10. Update memory with placed order details and reset active session financials
    memory.last_order_id = orderId;
    memory.last_order_code = orderCode;
    memory.order_id = orderId;
    memory.order_code = orderCode;
    memory.current_state = 'ORDER_CONFIRMED';
    const confirmedTotal = memory.total;
    const confirmedDeliveryFee = isPickup ? 0 : (memory.delivery_fee || 5000);

    // Wipe cart & financial state so subsequent orders in the same session start completely fresh
    memory.cart = [];
    memory.subtotal = 0;
    memory.delivery_fee = 0;
    memory.total = 0;
    memory.payment_method = undefined;
    memory.cash_amount = undefined;
    memory.change_amount = undefined;
    memory.cart_id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return {
      success: true,
      orderId,
      orderCode,
      total: confirmedTotal,
      delivery_fee: confirmedDeliveryFee,
      items: orderedItems,
      duplicate: false,
    };
  }

  /**
   * Looks up an order by ID or code
   */
  public static async getOrder(tenantId: string, orderIdOrCode: string): Promise<any | null> {
    const supabase = this.getSupabase();
    const clean = orderIdOrCode.trim().toUpperCase();

    // 1. Search by exact UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*))')
        .eq('tenant_id', tenantId)
        .eq('id', clean)
        .maybeSingle();
      if (data) return data;
    }

    // 2. Search by notes short ID
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('tenant_id', tenantId)
      .ilike('notes', `%[ID: ${clean}]%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data || null;
  }

  /**
   * Cancels an order
   */
  public static async cancelOrder(tenantId: string, orderIdOrCode: string): Promise<{ success: boolean; error?: string }> {
    const order = await this.getOrder(tenantId, orderIdOrCode);
    if (!order) return { success: false, error: 'ORDER_NOT_FOUND' };

    if (order.status === 'shipping' || order.status === 'delivered') {
      return { success: false, error: 'ORDER_CANNOT_BE_CANCELLED' };
    }

    const supabase = this.getSupabase();
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', order.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}
