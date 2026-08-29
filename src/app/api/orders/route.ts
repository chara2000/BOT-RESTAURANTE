import { NextResponse } from 'next/server';
import { createOrderInSupabase, type CreateOrderPayload } from '@/lib/orders/createOrder';
import { createOrderViaN8n } from '@/lib/n8n/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
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

    // Resolve customer_id if it's a name (not a UUID)
    if (body.order?.customer_id) {
      const customerIdStr = String(body.order.customer_id).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerIdStr);
      if (!isUuid && customerIdStr) {
        const tenantId = getTenantId(request);
        const supabase = createAdminClient();
        if (supabase) {
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', customerIdStr)
            .maybeSingle();

          if (existingCustomer) {
            body.order.customer_id = existingCustomer.id;
          } else {
            const { data: newCustomerRow, error: createCustError } = await supabase
              .from('customers')
              .insert({
                tenant_id: tenantId,
                name: customerIdStr,
              })
              .select('id')
              .single();
            if (!createCustError && newCustomerRow) {
              body.order.customer_id = newCustomerRow.id;
            } else {
              body.order.customer_id = undefined;
            }
          }
        } else {
          body.order.customer_id = undefined;
        }
      }
    }

    const tenantId = getTenantId(request);

    try {
      // 1. Insert directly into Supabase first for fast response with proper tenant_id
      const order = await createOrderInSupabase(body, tenantId);

      // 2. Fire n8n webhook asynchronously
      createOrderViaN8n(body).catch((n8nErr) => {
        console.warn('[orders] Asynchronous n8n webhook failed:', n8nErr);
      });

      return NextResponse.json({ success: true, source: 'supabase', order });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error creando pedido en la base de datos';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error general creando pedido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

