import { NextResponse } from 'next/server';
import { createOrderInSupabase, type CreateOrderPayload } from '@/lib/orders/createOrder';
import { createOrderViaN8n } from '@/lib/n8n/server';
import { createAdminClient } from '@/lib/supabase/server';
import { mapOrder } from '@/services/supabaseMapper';

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

async function loadOrderById(id: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const { data } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
  return data ? mapOrder(data as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderPayload;

    if (!body.items?.length) {
      return NextResponse.json({ error: 'El pedido debe tener al menos un item' }, { status: 400 });
    }

    try {
      const n8nResult = await createOrderViaN8n(body);
      const orderId = n8nResult?.order?.id ?? n8nResult?.order_id;
      const order = orderId ? await loadOrderById(String(orderId)) : null;
      return NextResponse.json({ success: true, source: 'n8n', order: order ?? n8nResult.order ?? n8nResult });
    } catch (n8nErr) {
      console.warn('[orders] n8n fallback:', n8nErr);
      const order = await createOrderInSupabase(body);
      return NextResponse.json({ success: true, source: 'supabase', order });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creando pedido';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
