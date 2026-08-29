import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { mapOrder } from '@/services/supabaseMapper';
import type { Order, OrderType, PaymentMethod } from '@/types';

export interface CreateOrderPayload {
  order: {
    tenant_id?: string;
    branch_id?: string;
    type: OrderType;
    payment_method: PaymentMethod;
    customer_id?: string;
    customer_name?: string;
    customer_phone?: string;
    phone?: string;
    subtotal: number;
    delivery_fee: number;
    tips: number;
    total: number;
    delivery_address?: string;
    notes?: string;
  };
  items: { product_id: string; quantity: number; unit_price: number; notes?: string }[];
}

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export async function createOrderInSupabase(payload: CreateOrderPayload, explicitTenantId?: string): Promise<Order> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { order, items } = payload;
  const targetTenantId = order.tenant_id || explicitTenantId || DEMO_TENANT_ID;
  const deliveryFee = order.type === 'delivery' ? (order.delivery_fee || 5000) : 0;

  // 1. Resolve branch for this tenant
  let branchId = order.branch_id || DEMO_BRANCH_ID;
  if (!order.branch_id && targetTenantId) {
    try {
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', targetTenantId)
        .limit(1)
        .maybeSingle();
      if (branch?.id) branchId = branch.id;
    } catch {}
  }

  // 2. Resolve customer (find by UUID, or find/create by name and phone)
  let resolvedCustomerId: string | null = null;
  const rawCustId = order.customer_id ? String(order.customer_id).trim() : '';
  const custPhone = order.customer_phone || (order as any).phone || '';
  const custName = order.customer_name || (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCustId) ? rawCustId : '');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCustId);

  if (isUuid) {
    resolvedCustomerId = rawCustId;
    if (custPhone) {
      await supabase.from('customers').update({ phone: custPhone.trim() }).eq('id', rawCustId);
    }
  } else if (custName || custPhone) {
    const finalName = custName || 'Cliente General';
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', targetTenantId)
      .eq('name', finalName)
      .limit(1)
      .maybeSingle();

    if (existingCust?.id) {
      resolvedCustomerId = existingCust.id;
      if (custPhone) {
        await supabase.from('customers').update({
          phone: custPhone.trim(),
          address_default: order.delivery_address?.trim() || undefined,
        }).eq('id', existingCust.id);
      }
    } else {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({
          tenant_id: targetTenantId,
          name: finalName,
          phone: custPhone ? custPhone.trim() : '0000000000',
          address_default: order.delivery_address?.trim() || null,
          segment: 'new',
          total_spent: 0,
          order_count: 0,
        })
        .select('id')
        .single();
      if (newCust?.id) {
        resolvedCustomerId = newCust.id;
      }
    }
  }

  // 3. Insert order
  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: targetTenantId,
      branch_id: branchId,
      customer_id: resolvedCustomerId,
      type: order.type,
      status: 'pending',
      payment_method: order.payment_method,
      subtotal: order.subtotal,
      delivery_fee: deliveryFee,
      tips: order.tips ?? 0,
      total: order.total,
      delivery_address: order.delivery_address ?? null,
      notes: order.notes ?? null,
    })
    .select('id')
    .single();

  if (orderError || !orderRow) throw new Error(orderError?.message ?? 'Error creando pedido');

  // 4. Insert order items
  const orderItems = items.map((item) => ({
    order_id: orderRow.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.quantity,
    notes: item.notes ?? null,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
  if (itemsError) throw new Error(itemsError.message);

  if (order.type === 'delivery') {
    await supabase.from('delivery_details').insert({
      order_id: orderRow.id,
      status: 'searching',
      latitude: 6.2088,
      longitude: -75.5678,
    });
  }

  const { data: fullOrder, error: fetchError } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderRow.id)
    .single();

  if (fetchError || !fullOrder) throw new Error(fetchError?.message ?? 'Error cargando pedido');
  return mapOrder(fullOrder as Record<string, unknown>);
}

