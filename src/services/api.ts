import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { safeLocalStorage } from '@/lib/utils/safeStorage';

export function getActiveTenantId(): string {
  if (typeof window !== 'undefined') {
    const tid = safeLocalStorage.getItem('chefflow_selected_tenant_id');
    if (tid) return tid;
  }
  return DEMO_TENANT_ID;
}

function getHeaders(extra?: Record<string, string>) {
  const tid = getActiveTenantId();
  return {
    'x-tenant-id': tid,
    ...extra,
  };
}

import {
  mapCustomer, mapInventory, mapOrder, mapProduct, mapSettings,
} from '@/services/supabaseMapper';
import type { CashSession, Customer, DeliveryAssignment, InventoryItem, Order, Product, TenantSettings, Category } from '@/types';
const ORDER_SELECT = `
  *,
  customers(*),
  order_items(*, products(*, categories(name)))
`;

export const ordersService = {
  async getAll(tenantId?: string): Promise<Order[]> {
    const supabase = createClient();
    if (!supabase) return [];
    const tid = tenantId || getActiveTenantId();
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapOrder(row as Record<string, unknown>));
  },

  async updateStatus(orderId: string, status: string) {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error ${res.status}: ${errText || 'No se pudo actualizar el pedido'}`);
    }
    return res.json();
  },
};

export const productsService = {
  async getAll(tenantId?: string): Promise<Product[]> {
    const supabase = createClient();
    if (!supabase) return [];
    const tid = tenantId || getActiveTenantId();
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('tenant_id', tid)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((row) => mapProduct(row as Record<string, unknown>));
  },

  async create(product: Product): Promise<Product> {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(product),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo crear el producto');
    return body;
  },

  async update(product: Product): Promise<Product> {
    const res = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(product),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar el producto');
    return body;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo eliminar el producto');
  },
};

export const customersService = {
  async getAll(tenantId?: string): Promise<Customer[]> {
    const supabase = createClient();
    if (!supabase) return [];
    const tid = tenantId || getActiveTenantId();
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
  },

  async getByTelegram(chatId: string): Promise<Customer | null> {
    const supabase = createClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .single();
    return data ? mapCustomer(data as Record<string, unknown>) : null;
  },
};

export const inventoryService = {
  async getAll(tenantId?: string): Promise<InventoryItem[]> {
    const supabase = createClient();
    if (!supabase) return [];
    const tid = tenantId || getActiveTenantId();
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('tenant_id', tid)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((row) => mapInventory(row as Record<string, unknown>));
  },

  async create(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(item),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo crear el insumo');
    return body;
  },

  async update(item: InventoryItem): Promise<InventoryItem> {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(item),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar inventario');
    return body;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/inventory/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo eliminar el insumo');
  },
};

export const settingsService = {
  async get(tenantId?: string): Promise<Partial<TenantSettings> | null> {
    const supabase = createClient();
    if (!supabase) return null;
    const tid = tenantId || getActiveTenantId();
    const { data, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tid)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSettings(data as Record<string, unknown>) : null;
  },

  async update(settings: Partial<TenantSettings>): Promise<Partial<TenantSettings>> {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar configuracion');
    return mapSettings(body as Record<string, unknown>);
  },
};

export const cashService = {
  async open(opening_balance: number, opened_by: string): Promise<CashSession> {
    const res = await fetch('/api/cash/register', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ opening_balance, opened_by }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo abrir caja');
    return {
      id: String(body.id),
      opened_by,
      opening_balance: Number(body.opening_balance),
      status: body.status,
      opened_at: body.opened_at,
      transactions: [],
    };
  },

  async close(session: CashSession, actual_cash: number): Promise<Partial<CashSession>> {
    const income = session.transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const expense = session.transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    const expected = session.opening_balance + income - expense;
    const res = await fetch('/api/cash/register', {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: session.id, actual_cash, expected }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo cerrar caja');
    return {
      status: body.status,
      closing_balance: Number(body.closing_balance),
      actual_cash: Number(body.actual_cash),
      difference: Number(body.difference),
      closed_at: body.closed_at,
    };
  },

  async addTransaction(register_id: string, type: 'income' | 'expense', amount: number, description: string) {
    const res = await fetch('/api/cash/transactions', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ register_id, type, amount, description }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo registrar movimiento');
    return {
      id: String(body.id),
      type,
      amount: Number(body.amount),
      description: String(body.description ?? ''),
      created_at: String(body.created_at),
    };
  },
};

export const deliveryService = {
  async update(orderId: string, patch: { rider_id?: string; rider_name?: string; latitude?: number; longitude?: number; status?: string }) {
    const res = await fetch(`/api/deliveries/${orderId}`, {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar domicilio');
    return body as DeliveryAssignment;
  },
};

export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const supabase = createClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data as Category[];
  },

  async create(category: Partial<Category>): Promise<Category> {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(category),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo crear la categoría');
    return body;
  },

  async update(category: Category): Promise<Category> {
    const res = await fetch(`/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(category),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar la categoría');
    return body;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo eliminar la categoría');
  },
};


export async function loadDashboardData(tenantId?: string, riderId?: string) {
  if (!isSupabaseConfigured()) return null;

  const fetchData = async (retry = 0): Promise<any> => {
    try {
      let url = tenantId ? `/api/data/bootstrap?tenant_id=${encodeURIComponent(tenantId)}` : '/api/data/bootstrap';
      if (riderId) {
        url += `${url.includes('?') ? '&' : '?'}rider_id=${encodeURIComponent(riderId)}`;
      }
      const res = await fetch(url, {
        cache: 'no-store',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody.error ?? `Error ${res.status} loading data`;
        throw new Error(errMsg);
      }
      return await res.json();
    } catch (err) {
      console.error('[Supabase] bootstrap failed', err);
      if (retry < 1) {
        // simple retry after a short delay
        await new Promise((r) => setTimeout(r, 500));
        return fetchData(retry + 1);
      }
      return null;
    }
  };

  return await fetchData();
}

export const ridersService = {
  async getAll(): Promise<any[]> {
    // Use the server-side API endpoint that uses the admin client,
    // bypassing RLS policies which would otherwise restrict each user
    // to only see their own profile row.
    const res = await fetch('/api/riders', {
      headers: getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async updateAvailability(riderId: string, isAvailable: boolean): Promise<any> {
    const supabase = createClient();
    if (!supabase) throw new Error('Supabase no configurado');
    const { data, error } = await supabase
      .from('rider_profiles')
      .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', riderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getProfile(riderId: string): Promise<any> {
    const supabase = createClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('rider_profiles')
      .select('*')
      .eq('id', riderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
};

export const ratingsService = {
  async create(rating: { order_id: string; food_rating: number; delivery_rating: number; comments?: string }): Promise<any> {
    const supabase = createClient();
    if (!supabase) throw new Error('Supabase no configurado');
    const { data, error } = await supabase
      .from('order_ratings')
      .insert(rating)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getForOrder(orderId: string): Promise<any> {
    const supabase = createClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('order_ratings')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
};

export const routeLogsService = {
  async addLog(deliveryId: string, latitude: number, longitude: number): Promise<any> {
    const supabase = createClient();
    if (!supabase) throw new Error('Supabase no configurado');
    const { data, error } = await supabase
      .from('route_logs')
      .insert({ delivery_id: deliveryId, latitude, longitude })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

export { isSupabaseConfigured };
