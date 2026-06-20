import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { mapOrder } from '@/services/supabaseMapper';
import type { Order, OrderType, PaymentMethod } from '@/types';

export interface CreateOrderPayload {
  order: {
    type: OrderType;
    payment_method: PaymentMethod;
    customer_id?: string;
    subtotal: number;
    delivery_fee: number;
    tips: number;
    total: number;
    delivery_address?: string;
    notes?: string;
  };
  items: { product_id: string; quantity: number; unit_price: number }[];
}

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export async function createOrderInSupabase(payload: CreateOrderPayload): Promise<Order> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { order, items } = payload;
  const deliveryFee = order.type === 'delivery' ? (order.delivery_fee || 5000) : 0;

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: DEMO_TENANT_ID,
      branch_id: DEMO_BRANCH_ID,
      customer_id: order.customer_id ?? null,
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

  const orderItems = items.map((item) => ({
    order_id: orderRow.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.quantity,
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
