import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
import {
  mapCustomer, mapInventory, mapOrder, mapProduct, mapSettings,
} from '@/services/supabaseMapper';
import type { CashSession, DeliveryAssignment, Order } from '@/types';

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export async function GET(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  // Run DB DDL migration to add allow_external_riders if not exists
  try {
    await supabase.rpc('execute_sql', {
      sql: `
        ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS allow_external_riders BOOLEAN DEFAULT false;
        ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS menu_pdf_url TEXT DEFAULT NULL;
        ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS nequi_number TEXT DEFAULT NULL;
        ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS bancolombia_number TEXT DEFAULT NULL;
        ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS bancolombia_type TEXT DEFAULT 'Ahorros';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS additions JSONB DEFAULT '[]'::jsonb;
      `
    });
  } catch (err) {
    console.warn('[Bootstrap] SQL migration skipped/failed:', err);
  }

  const { searchParams } = new URL(request.url);
  const targetTenantId = searchParams.get('tenant_id') || request.headers.get('x-tenant-id') || DEMO_TENANT_ID;

  // Fetch orders first to get order IDs for delivery details filtering
  const ordersRes = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('tenant_id', targetTenantId)
    .order('created_at', { ascending: false });

  const orderIds = (ordersRes.data ?? []).map((o: any) => String(o.id));

  const [categoriesRes, productsRes, customersRes, inventoryRes, settingsRes, tenantRes, cashRes, deliveryRes, stockRes] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*, categories(name)')
      .eq('tenant_id', targetTenantId)
      .not('category_id', 'is', null)
      .order('name'),
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('inventory')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('name'),
    supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .maybeSingle(),
    supabase
      .from('tenants')
      .select('name')
      .eq('id', targetTenantId)
      .maybeSingle(),
    supabase
      .from('cash_registers')
      .select('*, cash_transactions(*)')
      .eq('tenant_id', targetTenantId)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('delivery_details')
      .select('*, profiles(name)')
      .in('order_id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'])
      .order('updated_at', { ascending: false }),
    supabase
      .from('stock_movements')
      .select('*, inventory(name, tenant_id)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const errors = [categoriesRes, ordersRes, productsRes, customersRes, inventoryRes, settingsRes, tenantRes, cashRes, deliveryRes]
    .filter((r) => r.error)
    .map((r) => r.error!.message);

  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  const orders: Order[] = (ordersRes.data ?? []).map((row: any) => mapOrder(row as Record<string, unknown>));

  // If a rider is fetching the data, load extra pool orders from other tenants
  // that have allow_external_riders enabled
  try {
    const riderId = searchParams.get('rider_id');
    
    // 1. Fetch other tenants that have allow_external_riders enabled
    const { data: sharedSettings } = await supabase
      .from('tenant_settings')
      .select('tenant_id')
      .eq('allow_external_riders', true)
      .neq('tenant_id', targetTenantId);
      
    const sharedTenantIds = (sharedSettings ?? []).map((s: any) => s.tenant_id);
    
    // 2. Fetch order ids assigned to this rider in delivery_details or in orders table
    let assignedOrderIds: string[] = [];
    if (riderId) {
      const [myAssignedDelivery, myAssignedOrders] = await Promise.all([
        supabase
          .from('delivery_details')
          .select('order_id')
          .eq('rider_id', riderId),
        supabase
          .from('orders')
          .select('id')
          .eq('rider_id', riderId),
      ]);
      const fromDetails = (myAssignedDelivery.data ?? []).map((a: any) => String(a.order_id));
      const fromOrders = (myAssignedOrders.data ?? []).map((a: any) => String(a.id));
      assignedOrderIds = Array.from(new Set([...fromDetails, ...fromOrders])).filter(Boolean);
    }
    
    // 3. Build query for shared pool and assigned orders
    const queryParts: string[] = [];
    if (sharedTenantIds.length > 0) {
      queryParts.push(`and(tenant_id.in.(${sharedTenantIds.join(',')}),status.eq.ready,type.eq.delivery)`);
    }
    if (assignedOrderIds.length > 0) {
      queryParts.push(`id.in.(${assignedOrderIds.join(',')})`);
    }
    
    if (queryParts.length > 0) {
      const { data: sharedOrdersRes } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .or(queryParts.join(','));
        
      if (sharedOrdersRes && sharedOrdersRes.length > 0) {
        const sharedOrders = sharedOrdersRes.map((row: any) => mapOrder(row as Record<string, unknown>));
        // Add to orders list, avoiding duplicates
        const ownOrderIds = new Set(orders.map((o: Order) => o.id));
        sharedOrders.forEach((o: Order) => {
          if (!ownOrderIds.has(o.id)) {
            orders.push(o);
          }
        });
      }
    }
  } catch (err) {
    console.error('[Bootstrap] Failed to merge shared pool orders:', err);
  }

  const ordersById = new Map<string, Order>(orders.map((order: Order) => [order.id, order]));
  const cashRow = cashRes.data as (Record<string, unknown> & { cash_transactions?: Record<string, unknown>[] }) | null;
  const cashSession: CashSession | null = cashRow ? {
    id: String(cashRow.id),
    opened_by: 'ChefFlow',
    opening_balance: Number(cashRow.opening_balance ?? 0),
    closing_balance: cashRow.closing_balance == null ? undefined : Number(cashRow.closing_balance),
    actual_cash: cashRow.actual_cash == null ? undefined : Number(cashRow.actual_cash),
    difference: cashRow.difference == null ? undefined : Number(cashRow.difference),
    status: cashRow.status as CashSession['status'],
    opened_at: String(cashRow.opened_at),
    closed_at: cashRow.closed_at ? String(cashRow.closed_at) : undefined,
    transactions: (cashRow.cash_transactions ?? []).map((tx) => ({
      id: String(tx.id),
      type: tx.type as 'income' | 'expense',
      amount: Number(tx.amount),
      description: String(tx.description ?? ''),
      created_at: String(tx.created_at),
    })).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  } : null;

  const deliveries: DeliveryAssignment[] = ((deliveryRes.data ?? []) as Record<string, unknown>[])
    .map((row) => {
      const order = ordersById.get(String(row.order_id));
      if (!order) return null;
      const profile = row.profiles as { name?: string } | null;
      return {
        order_id: order.id,
        order,
        rider_id: row.rider_id ? String(row.rider_id) : (order.rider_id || undefined),
        rider_name: profile?.name,
        status: row.status as DeliveryAssignment['status'],
        latitude: Number(row.latitude ?? 6.2088),
        longitude: Number(row.longitude ?? -75.5678),
        estimated_arrival: row.estimated_arrival ? String(row.estimated_arrival) : undefined,
      };
    })
    .filter(Boolean) as DeliveryAssignment[];

  // Mezclar delivery_details y pedidos a domicilio activos
  const finalDeliveries: DeliveryAssignment[] = orders
    .filter(
      (o: Order) =>
        (o.type === 'delivery' || (o.delivery_address && o.delivery_address !== 'Para Recoger en el local')) &&
        !['cancelled', 'draft'].includes(o.status)
    )
    .map((o: Order, i: number) => {
      const existing = deliveries.find((d: DeliveryAssignment) => d.order_id === o.id);
      if (existing) {
        existing.order = o;
        if (!existing.rider_id && o.rider_id) {
          existing.rider_id = o.rider_id;
        }
        return existing;
      }
      return {
        order_id: o.id,
        order: o,
        rider_id: o.rider_id || undefined,
        rider_name: undefined,
        status: (o.status === 'delivered'
          ? 'delivered'
          : (o.status === 'shipping' || o.rider_id)
          ? 'assigned'
          : 'searching') as DeliveryAssignment['status'],
        latitude: 6.2088 + i * 0.005,
        longitude: -75.5678 + i * 0.005,
      };
    });

  // Filter stock movements to only those belonging to this tenant's inventory
  const tenantInventoryIds = new Set((inventoryRes.data ?? []).map((i: any) => String(i.id)));
  const stockMovements = (stockRes.data ?? []).filter((row: any) => {
    const invId = String(row.inventory_id);
    return tenantInventoryIds.has(invId);
  }).map((row: any) => ({
    id: String(row.id),
    inventory_id: String(row.inventory_id),
    inventory_name: String(row.inventory?.name ?? 'Desconocido'),
    quantity: Number(row.quantity),
    reason: String(row.reason),
    created_at: String(row.created_at),
  }));

  return NextResponse.json({
    categories: categoriesRes.data ?? [],
    orders,
    products: (productsRes.data ?? []).map((row) => mapProduct(row as Record<string, unknown>)),
    customers: (customersRes.data ?? []).map((row) => mapCustomer(row as Record<string, unknown>)),
    inventory: (inventoryRes.data ?? []).map((row) => mapInventory(row as Record<string, unknown>)),
    settings: settingsRes.data
      ? mapSettings({ ...(settingsRes.data as Record<string, unknown>), restaurant_name: tenantRes.data?.name })
      : null,
    cashSession,
    deliveries: finalDeliveries,
    stockMovements,
  });
}
