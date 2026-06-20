import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
import {
  mapCustomer, mapInventory, mapOrder, mapProduct, mapSettings,
} from '@/services/supabaseMapper';
import type { CashSession, DeliveryAssignment } from '@/types';

const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const [ordersRes, productsRes, customersRes, inventoryRes, settingsRes, tenantRes, cashRes, deliveryRes] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('*, categories(name)')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('name'),
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('inventory')
      .select('*')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('name'),
    supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', DEMO_TENANT_ID)
      .maybeSingle(),
    supabase
      .from('tenants')
      .select('name')
      .eq('id', DEMO_TENANT_ID)
      .maybeSingle(),
    supabase
      .from('cash_registers')
      .select('*, cash_transactions(*)')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('delivery_details')
      .select('*, profiles(name)')
      .order('updated_at', { ascending: false }),
  ]);

  const errors = [ordersRes, productsRes, customersRes, inventoryRes, settingsRes, tenantRes, cashRes, deliveryRes]
    .filter((r) => r.error)
    .map((r) => r.error!.message);

  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  const orders = (ordersRes.data ?? []).map((row) => mapOrder(row as Record<string, unknown>));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
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
        rider_name: profile?.name,
        status: row.status as DeliveryAssignment['status'],
        latitude: Number(row.latitude ?? 6.2088),
        longitude: Number(row.longitude ?? -75.5678),
        estimated_arrival: row.estimated_arrival ? String(row.estimated_arrival) : undefined,
      };
    })
    .filter(Boolean) as DeliveryAssignment[];

  return NextResponse.json({
    orders,
    products: (productsRes.data ?? []).map((row) => mapProduct(row as Record<string, unknown>)),
    customers: (customersRes.data ?? []).map((row) => mapCustomer(row as Record<string, unknown>)),
    inventory: (inventoryRes.data ?? []).map((row) => mapInventory(row as Record<string, unknown>)),
    settings: settingsRes.data
      ? mapSettings({ ...(settingsRes.data as Record<string, unknown>), restaurant_name: tenantRes.data?.name })
      : null,
    cashSession,
    deliveries,
  });
}
