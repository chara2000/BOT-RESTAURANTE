import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { mapOrder } from '@/services/supabaseMapper';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { notifyCustomerOrderStatus } from '@/lib/bot/orderNotifications';

export const dynamic = 'force-dynamic';

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const tenantId = request.headers.get('x-tenant-id') || getTenantId(request) || DEMO_TENANT_ID;
    const body = await request.json();
    const { notes, total, status, type, delivery_address, delivery_fee, items } = body;

    // 1. Update order row
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) updateData.notes = notes;
    if (total !== undefined) updateData.total = total;
    if (status !== undefined) updateData.status = status;
    if (type !== undefined) updateData.type = type;
    if (delivery_address !== undefined) updateData.delivery_address = delivery_address;
    if (delivery_fee !== undefined) updateData.delivery_fee = delivery_fee;

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      console.error('[api/orders/[id]] Update order error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Update order_items if provided
    if (Array.isArray(items) && items.length > 0) {
      // Delete existing order items
      await supabase.from('order_items').delete().eq('order_id', orderId);

      const orderItemRows = items.map((item: any) => {
        const productId = item.product_id || item.product?.id;
        const unitPrice = Number(item.unit_price ?? item.product?.price ?? 0);
        const quantity = Number(item.quantity ?? 1);
        return {
          order_id: orderId,
          product_id: productId,
          quantity,
          unit_price: unitPrice,
          total_price: unitPrice * quantity,
          notes: item.notes || null,
        };
      });

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemRows);
      if (itemsError) {
        console.warn('[api/orders/[id]] Reinsert order_items error:', itemsError);
      }
    }

    // 3. Fetch and return full updated order
    const { data: fullOrder, error: fetchError } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .maybeSingle();

    if (status) {
      try {
        await notifyCustomerOrderStatus(orderId, status);
      } catch (e) {
        console.warn('[api/orders/[id]] Error notificando cliente:', e);
      }
    }

    return NextResponse.json({
      success: true,
      order: mapOrder(fullOrder as Record<string, unknown>),
    });
  } catch (err) {
    console.error('[api/orders/[id]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al actualizar pedido' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    // Delete cascading dependencies first if needed
    try {
      await supabase.from('order_items').delete().eq('order_id', orderId);
      await supabase.from('delivery_details').delete().eq('order_id', orderId);
      await supabase.from('payment_proofs').delete().eq('order_id', orderId);
    } catch (e) {
      console.warn('[api/orders/[id]] Cascade clean notice:', e);
    }

    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      console.error('[api/orders/[id]] DELETE error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: orderId });
  } catch (err) {
    console.error('[api/orders/[id]] DELETE general error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al eliminar pedido' },
      { status: 500 }
    );
  }
}
