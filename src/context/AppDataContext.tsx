'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { safeLocalStorage } from '@/lib/utils/safeStorage';
import {
  cashService,
  categoriesService,
  deliveryService,
  inventoryService,
  isSupabaseConfigured,
  loadDashboardData,
  ordersService,
  productsService,
  settingsService,
  ridersService,
} from '@/services/api';
import { playAlarmSound } from '@/hooks/useAlarmSound';
import type {
  Category, CashSession, Customer, DashboardStats, DeliveryAssignment,
  InventoryItem, Order, OrderStatus, OrderType, Product, StockMovement, TenantSettings,
} from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  initialCashSession, initialCustomers, initialInventory,
  initialOrders, initialProducts, initialSettings, initialStockMovements,
} from '@/services/seedData';

function logSupabaseError(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: string }).message;
    if (msg.includes('fetch failed')) return; // Ignore noisy network errors
    console.error('[Supabase]', msg, err);
  } else {
    console.error('[Supabase]', err);
  }
}

interface AppDataContextValue {
  categories: Category[];
  orders: Order[];
  products: Product[];
  customers: Customer[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  cashSession: CashSession;
  pastCashSessions: CashSession[];
  settings: TenantSettings;
  deliveries: DeliveryAssignment[];
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  addOrder: (order: Order) => void;
  deleteOrder: (orderId: string) => Promise<void>;
  updateOrderDetails: (orderId: string, updates: { notes?: string; total?: number; status?: OrderStatus; type?: OrderType; delivery_address?: string; delivery_fee?: number }, items?: any[]) => Promise<void>;
  updateProduct: (product: Product) => Promise<Product | void>;
  addProduct: (product: Product) => Promise<Product | void>;
  deleteProduct: (id: string) => Promise<void>;
  addCategory: (category: Partial<Category>) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  updateInventory: (item: InventoryItem) => Promise<void>;
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  addCashTransaction: (type: 'income' | 'expense', amount: number, description: string) => Promise<void>;
  openCashRegister: (balance: number, openedBy: string) => Promise<void>;
  closeCashRegister: (actualCash: number) => Promise<void>;
  deleteCashSession: (id: string) => Promise<void>;
  updateCashSession: (id: string, updates: Partial<CashSession>) => Promise<void>;
  createPastCashSession: (data: Partial<CashSession>) => Promise<void>;
  updateSettings: (settings: Partial<TenantSettings>) => Promise<void>;
  assignRider: (orderId: string, riderId: string, riderName: string) => Promise<void>;
  updateRiderPosition: (orderId: string, lat: number, lng: number) => Promise<void>;
  selectedTenantId: string | null;
  activeTenantId: string;
  setSelectedTenantId: (id: string | null) => void;
  allTenants: { id: string; name: string; subdomain: string; plan_type?: string }[];
  stats: DashboardStats;
  lowStockCount: number;
  activeOrdersCount: number;
  isLoading: boolean;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function getLocalDayString(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function computeStats(orders: Order[], customers: Customer[], products: Product[]): DashboardStats {
  const todayStr = getLocalDayString(new Date());
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayStr = getLocalDayString(yesterdayDate);

  const delivered = orders.filter((o) => o.status === 'delivered');
  const validOrders = orders.filter((o) => !['cancelled', 'draft'].includes(o.status));
  const todayOrders = validOrders.filter((o) => getLocalDayString(o.created_at) === todayStr);
  const yesterdayOrders = validOrders.filter((o) => getLocalDayString(o.created_at) === yesterdayStr);

  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;

  const weekOrders = validOrders.filter((o) => new Date(o.created_at).getTime() >= weekAgo);
  const monthOrders = validOrders.filter((o) => new Date(o.created_at).getTime() >= monthAgo);

  const sum = (list: Order[]) => list.reduce((a, o) => a + (o.total || 0), 0);
  const active = orders.filter((o) => !['delivered', 'cancelled', 'draft'].includes(o.status));

  // Top products from real order items
  const productSales = new Map<string, { name: string; sold: number; revenue: number }>();
  validOrders.forEach((o) =>
    o.items?.forEach((i) => {
      if (!i.product) return;
      const cur = productSales.get(i.product.id) ?? { name: i.product.name, sold: 0, revenue: 0 };
      cur.sold += i.quantity || 1;
      cur.revenue += (i.unit_price || 0) * (i.quantity || 1);
      productSales.set(i.product.id, cur);
    })
  );

  // Dynamic sales by day of week (Lun-Dom) from last 7 days real orders
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dayMap = new Map<string, number>();
  dayNames.forEach(d => dayMap.set(d, 0));
  
  weekOrders.forEach(o => {
    try {
      const d = new Date(o.created_at);
      const dayName = dayNames[d.getDay()];
      dayMap.set(dayName, (dayMap.get(dayName) || 0) + (o.total || 0));
    } catch {}
  });

  const salesByDay = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => ({
    day: d,
    amount: dayMap.get(d) || 0
  }));

  // Dynamic sales by hour (10h to 22h)
  const hourSlots = ['10h', '12h', '14h', '16h', '18h', '20h', '22h'];
  const hourMap = new Map<string, number>();
  hourSlots.forEach(h => hourMap.set(h, 0));

  todayOrders.forEach(o => {
    try {
      const h = new Date(o.created_at).getHours();
      const slot = `${Math.floor(h / 2) * 2}h`;
      if (hourMap.has(slot)) {
        hourMap.set(slot, (hourMap.get(slot) || 0) + (o.total || 0));
      }
    } catch {}
  });

  const salesByHour = hourSlots.map(h => ({
    hour: h,
    amount: hourMap.get(h) || 0
  }));

  return {
    salesToday: sum(todayOrders),
    salesYesterday: sum(yesterdayOrders),
    salesWeek: sum(weekOrders),
    salesMonth: sum(monthOrders),
    activeOrders: active.length,
    deliveredOrders: delivered.length,
    avgTicket: validOrders.length ? sum(validOrders) / validOrders.length : 0,
    newCustomers: customers.filter((c) => c.segment === 'new').length,
    returningCustomers: customers.filter((c) => ['frequent', 'vip'].includes(c.segment)).length,
    topProducts: [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    salesByHour,
    salesByDay,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const useSupabase = isSupabaseConfigured();
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>(useSupabase ? [] : initialOrders);
  const [products, setProducts] = useState<Product[]>(useSupabase ? [] : initialProducts);
  const [customers, setCustomers] = useState<Customer[]>(useSupabase ? [] : initialCustomers);
  const [dataSource, setDataSource] = useState<'mock' | 'supabase'>(useSupabase ? 'supabase' : 'mock');
  const [inventory, setInventory] = useState<InventoryItem[]>(useSupabase ? [] : initialInventory);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(useSupabase ? [] : initialStockMovements);
  const [cashSession, setCashSession] = useState<CashSession>(initialCashSession);
  const [pastCashSessions, setPastCashSessions] = useState<CashSession[]>([]);
  const [settings, setSettings] = useState<TenantSettings>(initialSettings);
  const [deliveries, setDeliveries] = useState<DeliveryAssignment[]>(
    useSupabase ? [] : initialOrders
      .filter((o) => o.type === 'delivery')
      .map((o, i) => ({
        order_id: o.id,
        order: o,
        rider_name: i === 0 ? 'Carlos M.' : undefined,
        status: i === 0 ? 'assigned' as const : 'searching' as const,
        latitude: 6.2088 + i * 0.01,
        longitude: -75.5678 + i * 0.01,
      }))
  );
  const [selectedTenantId, setSelectedTenantIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('chefflow_selected_tenant_id') ?? DEMO_TENANT_ID;
    }
    return DEMO_TENANT_ID;
  });

  // The actual tenant used for ALL data queries:
  // - super_admin → uses selectedTenantId (can switch)
  // - everyone else → locked to their own profile's tenant_id
  const [ownTenantId, setOwnTenantId] = useState<string>(DEMO_TENANT_ID);

  // Load own tenant_id from profile when user is loaded
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    if (!supabase) return;
    supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tenant_id) setOwnTenantId(data.tenant_id);
      });
  }, [user]);

  // activeTenantId: super_admin can pick any tenant; all other roles are locked to own
  const activeTenantId = (user?.role === 'super_admin' ? selectedTenantId : ownTenantId) || DEMO_TENANT_ID;

  useEffect(() => {
    if (typeof window !== 'undefined' && activeTenantId) {
      safeLocalStorage.setItem('chefflow_selected_tenant_id', activeTenantId);
    }
  }, [activeTenantId]);

  const [allTenants, setAllTenants] = useState<{ id: string; name: string; subdomain: string; plan_type?: string }[]>([
    { id: 'a0000000-0000-4000-8000-000000000001', name: 'ChefFlow Restaurante', subdomain: 'chefflow', plan_type: 'pro' },
    { id: 'a0000000-0000-4000-8000-000000000002', name: 'La Casona Gourmet', subdomain: 'lacasona', plan_type: 'pro' },
    { id: 'a0000000-0000-4000-8000-000000000003', name: 'Burger & Shake House', subdomain: 'burgershake', plan_type: 'starter' },
  ]);

  const [isLoading, setIsLoading] = useState(useSupabase);

  const buildDeliveries = useCallback((orderList: Order[]): DeliveryAssignment[] => {
    const lat = settings?.restaurant_lat ?? 3.2311;
    const lng = settings?.restaurant_lng ?? -76.4167;
    return orderList
      .filter((o) =>
        (o.type === 'delivery' ||
          (o.delivery_address && o.delivery_address !== 'Para Recoger en el local')) &&
        !['cancelled', 'draft'].includes(o.status)
      )
      .map((o, i) => ({
        order_id: o.id,
        order: o,
        status: (o.status === 'delivered'
          ? 'delivered'
          : o.status === 'shipping'
          ? 'assigned'
          : 'searching') as DeliveryAssignment['status'],
        latitude: lat,
        longitude: lng,
      }));
  }, [settings?.restaurant_lat, settings?.restaurant_lng]);

  const syncFromSupabase = useCallback(async (overrideTenantId?: string, isBackground = false) => {
    const tid = overrideTenantId || activeTenantId;
    if (!isBackground) setIsLoading(true);
    try {
      const data = await loadDashboardData(tid, user?.id);
      if (!data) return;
      setCategories(data.categories || []);
      setOrders(data.orders || []);
      setProducts(data.products || []);
      setCustomers(data.customers || []);
      setInventory(data.inventory || []);
      if (data.stockMovements) setStockMovements(data.stockMovements);
      setDeliveries(data.deliveries?.length ? data.deliveries : buildDeliveries(data.orders || []));
      if (data.cashSession) {
        setCashSession(data.cashSession);
      } else {
        setCashSession({
          id: '',
          opened_by: '',
          opening_balance: 0,
          status: 'closed',
          opened_at: new Date().toISOString(),
          transactions: [],
        });
      }
      if (data.pastCashSessions) {
        setPastCashSessions(data.pastCashSessions);
      }
      if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      if (data.allTenants && data.allTenants.length > 0) setAllTenants(data.allTenants);
      setDataSource('supabase');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [activeTenantId, buildDeliveries, user?.id]);

  const setSelectedTenantId = useCallback((id: string | null) => {
    setSelectedTenantIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        safeLocalStorage.setItem('chefflow_selected_tenant_id', id);
      } else {
        safeLocalStorage.removeItem('chefflow_selected_tenant_id');
      }
    }
    if (useSupabase) {
      if (!id && user?.role === 'super_admin') {
        setCategories([]);
        setOrders([]);
        setProducts([]);
        setCustomers([]);
        setInventory([]);
        setStockMovements([]);
        setDeliveries([]);
      } else {
        syncFromSupabase(id || DEMO_TENANT_ID);
      }
    }
  }, [useSupabase, user?.role, syncFromSupabase]);

  useEffect(() => {
    // Fetch all tenants from admin API endpoint to bypass client RLS and get all real restaurants
    fetch('/api/tenants')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tenants && Array.isArray(data.tenants) && data.tenants.length > 0) {
          setAllTenants(data.tenants);
        }
      })
      .catch(() => {
        const supabase = createClient();
        if (!supabase) return;
        supabase.from('tenants').select('id, name, subdomain, plan_type').then(({ data }) => {
          if (data && data.length > 0) {
            setAllTenants(data);
          }
        });
      });
  }, []);

  // Real-time order synchronization listener & 6s polling fallback
  useEffect(() => {
    const handleOrderEvent = () => {
      syncFromSupabase(undefined, true);
    };
    window.addEventListener('new_order', handleOrderEvent);
    window.addEventListener('order_updated', handleOrderEvent);

    const pollingTimer = setInterval(() => {
      syncFromSupabase(undefined, true);
    }, 6000);

    return () => {
      window.removeEventListener('new_order', handleOrderEvent);
      window.removeEventListener('order_updated', handleOrderEvent);
      clearInterval(pollingTimer);
    };
  }, [syncFromSupabase]);



  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    setDeliveries((prev) =>
      prev.map((d) =>
        d.order_id === orderId
          ? { ...d, order: { ...d.order, status }, status: status === 'delivered' ? 'delivered' : d.status }
          : d
      )
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show_toast', {
        detail: { title: 'Estado de Pedido Actualizado', message: `El pedido fue marcado como ${status}`, type: 'success' }
      }));
    }

    if (dataSource === 'supabase') {
      try {
        await ordersService.updateStatus(orderId, status, selectedTenantId || undefined);
        
        // Lógica de Auto-Asignación
        if (status === 'ready' && prevOrder?.type === 'delivery' && settings.auto_assign_riders) {
          const riders = await ridersService.getAll(selectedTenantId || undefined);
          const availableRider = riders.find(r => r.is_available);
          if (availableRider) {
            await deliveryService.update(orderId, { rider_id: availableRider.id, rider_name: availableRider.full_name, status: 'assigned' });
            console.log(`[Auto-Assign] Pedido ${orderId} auto-asignado a ${availableRider.full_name}`);
          }
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders, selectedTenantId, settings.auto_assign_riders]);

  const deleteOrder = useCallback(async (orderId: string) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setDeliveries((prev) => prev.filter((d) => d.order_id !== orderId));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show_toast', {
        detail: { title: 'Pedido Eliminado', message: 'El pedido fue eliminado del sistema correctamente', type: 'warning' }
      }));
    }

    if (dataSource === 'supabase') {
      try {
        await ordersService.delete(orderId, selectedTenantId || undefined);
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders, selectedTenantId]);

  const updateOrderDetails = useCallback(async (
    orderId: string,
    updates: { notes?: string; total?: number; status?: OrderStatus; type?: OrderType; delivery_address?: string; delivery_fee?: number },
    items?: any[]
  ) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    if (!prevOrder) return;

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates, ...(items ? { items } : {}) } : o)));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show_toast', {
        detail: { title: 'Pedido Actualizado', message: 'Los cambios del pedido fueron guardados', type: 'success' }
      }));
    }

    if (dataSource === 'supabase') {
      try {
        const result = await ordersService.update(orderId, updates, items, selectedTenantId || undefined);
        if (result?.order) {
          setOrders((prev) => prev.map((o) => (o.id === orderId ? result.order : o)));
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders, selectedTenantId]);

  const addOrder = useCallback((order: Order) => {
    setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
    if (order.customer && order.customer.name) {
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === order.customer?.id || (order.customer?.name && c.name.toLowerCase() === order.customer.name.toLowerCase()));
        if (!exists && order.customer) {
          return [order.customer, ...prev];
        }
        return prev;
      });
    }
    if (
      order.type === 'delivery' ||
      (order.delivery_address && order.delivery_address !== 'Para Recoger en el local')
    ) {
      const lat = settings?.restaurant_lat ?? 3.2311;
      const lng = settings?.restaurant_lng ?? -76.4167;
      setDeliveries((prev) => [
        { order_id: order.id, order, status: 'searching', latitude: lat, longitude: lng },
        ...prev.filter((d) => d.order_id !== order.id),
      ]);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('new_order', { detail: order }));
      window.dispatchEvent(new CustomEvent('show_toast', {
        detail: {
          title: '🔔 ¡Nuevo Pedido Creado!',
          message: `Pedido #${order.id.slice(0, 6).toUpperCase()} (${formatCurrency(order.total)}) agregado con éxito`,
          type: 'order',
        }
      }));
    }
  }, [settings?.restaurant_lat, settings?.restaurant_lng]);

  const updateProduct = useCallback(async (product: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    if (dataSource === 'supabase') {
      try {
        const saved = await productsService.update(product);
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '✅ Platillo Actualizado', message: `"${saved.name}" fue guardado correctamente`, type: 'success' }
          }));
        }
        return saved;
      } catch (err) {
        logSupabaseError(err);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '❌ Error al Actualizar', message: 'No se pudo guardar el platillo. Verifica tu conexión.', type: 'warning' }
          }));
        }
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase]);

  const addProduct = useCallback(async (product: Product) => {
    setProducts((prev) => [...prev, product]);
    if (dataSource === 'supabase') {
      try {
        const saved = await productsService.create(product);
        setProducts((prev) => prev.map((p) => (p.id === product.id ? saved : p)));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '🍽️ Platillo Creado', message: `"${saved.name}" fue agregado al menú exitosamente`, type: 'success' }
          }));
        }
        return saved;
      } catch (err) {
        logSupabaseError(err);
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '❌ Error al Crear', message: 'No se pudo crear el platillo. Verifica tu conexión.', type: 'warning' }
          }));
        }
        throw err;
      }
    }
  }, [dataSource]);

  const deleteProduct = useCallback(async (id: string) => {
    const previous = products;
    const deletedProduct = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (dataSource === 'supabase') {
      try {
        await productsService.remove(id);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '🗑️ Platillo Eliminado', message: `"${deletedProduct?.name || 'Platillo'}" fue eliminado del menú`, type: 'warning' }
          }));
        }
      } catch (err) {
        logSupabaseError(err);
        setProducts(previous);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '❌ Error al Eliminar', message: 'No se pudo eliminar el platillo', type: 'warning' }
          }));
        }
        throw err;
      }
    }
  }, [dataSource, products]);

  const addCategory = useCallback(async (category: Partial<Category>) => {
    if (dataSource === 'supabase') {
      try {
        const saved = await categoriesService.create(category);
        setCategories((prev) => [...prev, saved].sort((a, b) => a.sort_order - b.sort_order));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '📁 Categoría Creada', message: `"${saved.name}" fue agregada exitosamente`, type: 'success' }
          }));
        }
      } catch (err) {
        logSupabaseError(err);
        throw err;
      }
    }
  }, [dataSource]);

  const updateCategory = useCallback(async (category: Category) => {
    setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)));
    if (dataSource === 'supabase') {
      try {
        const saved = await categoriesService.update(category);
        setCategories((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '📁 Categoría Actualizada', message: `"${saved.name}" fue actualizada correctamente`, type: 'success' }
          }));
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase]);

  const deleteCategory = useCallback(async (id: string) => {
    const previous = categories;
    const deletedCat = categories.find((c) => c.id === id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (dataSource === 'supabase') {
      try {
        await categoriesService.remove(id);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show_toast', {
            detail: { title: '🗑️ Categoría Eliminada', message: `"${deletedCat?.name || 'Categoría'}" fue eliminada del sistema`, type: 'warning' }
          }));
        }
      } catch (err) {
        logSupabaseError(err);
        setCategories(previous);
        throw err;
      }
    }
  }, [dataSource, categories]);


  const updateInventory = useCallback(async (item: InventoryItem) => {
    const prevItem = inventory.find((i) => i.id === item.id);
    const delta = prevItem ? item.stock - prevItem.stock : 0;
    setInventory((prev) => prev.map((i) => (i.id === item.id ? item : i)));

    // Log movement locally for immediate display in Auditoría
    if (delta !== 0) {
      const newMovement = {
        id: `sm-${Date.now()}`,
        inventory_id: item.id,
        inventory_name: item.name,
        quantity: delta,
        reason: delta > 0 ? 'Ajuste manual de entrada' : 'Ajuste manual de salida',
        created_at: new Date().toISOString(),
      };
      setStockMovements((prev) => [newMovement, ...prev]);
    }

    if (dataSource === 'supabase') {
      try {
        const saved = await inventoryService.update(item);
        setInventory((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
        // Persist movement to Supabase (non-blocking)
        if (delta !== 0) {
          const supabase = createClient();
          if (supabase) {
              Promise.resolve(supabase.from('stock_movements').insert({
                inventory_id: item.id,
                quantity: delta,
                reason: delta > 0 ? 'Ajuste manual de entrada' : 'Ajuste manual de salida',
              })).catch(() => {});
            }
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, inventory]);

  const addInventoryItem = useCallback(async (item: Omit<InventoryItem, 'id'>) => {
    if (dataSource === 'supabase') {
      try {
        const saved = await inventoryService.create(item);
        setInventory((prev) => [...prev, saved]);
        // Log creation as a positive movement
        const newMovement = {
          id: `sm-${Date.now()}`,
          inventory_id: saved.id,
          inventory_name: saved.name,
          quantity: saved.stock,
          reason: 'Insumo creado en inventario',
          created_at: new Date().toISOString(),
        };
        setStockMovements((prev) => [newMovement, ...prev]);
        // Persist to Supabase (non-blocking)
        const supabase = createClient();
        if (supabase && saved.stock > 0) {
          Promise.resolve(supabase.from('stock_movements').insert({
            inventory_id: saved.id,
            quantity: saved.stock,
            reason: 'Insumo creado en inventario',
          })).catch(() => {});
        }
      } catch (err) {
        logSupabaseError(err);
        throw err;
      }
    } else {
      const newItem: InventoryItem = { ...item, id: `inv-${Date.now()}` };
      setInventory((prev) => [...prev, newItem]);
      if (newItem.stock > 0) {
        setStockMovements((prev) => [{
          id: `sm-${Date.now()}`,
          inventory_id: newItem.id,
          inventory_name: newItem.name,
          quantity: newItem.stock,
          reason: 'Insumo creado en inventario',
          created_at: new Date().toISOString(),
        }, ...prev]);
      }
    }
  }, [dataSource]);

  const deleteInventoryItem = useCallback(async (id: string) => {
    const previous = inventory;
    const deletedItem = inventory.find((i) => i.id === id);
    setInventory((prev) => prev.filter((i) => i.id !== id));
    // Log deletion as a negative movement
    if (deletedItem) {
      setStockMovements((prev) => [{
        id: `sm-${Date.now()}`,
        inventory_id: id,
        inventory_name: deletedItem.name,
        quantity: -deletedItem.stock,
        reason: 'Insumo eliminado del inventario',
        created_at: new Date().toISOString(),
      }, ...prev]);
    }
    if (dataSource === 'supabase') {
      try {
        await inventoryService.remove(id);
      } catch (err) {
        logSupabaseError(err);
        setInventory(previous);
        throw err;
      }
    }
  }, [dataSource, inventory]);

  const addCashTransaction = useCallback(async (type: 'income' | 'expense', amount: number, description: string) => {
    if (dataSource === 'supabase') {
      const saved = await cashService.addTransaction(cashSession.id, type, amount, description);
      setCashSession((prev) => ({ ...prev, transactions: [saved, ...prev.transactions] }));
      return;
    }
    setCashSession((prev) => ({
      ...prev,
      transactions: [{ id: `t${Date.now()}`, type, amount, description, created_at: new Date().toISOString() }, ...prev.transactions],
    }));
  }, [cashSession.id, dataSource]);

  const openCashRegister = useCallback(async (balance: number, openedBy: string) => {
    if (dataSource === 'supabase') {
      const saved = await cashService.open(balance, openedBy);
      setCashSession(saved);
      return;
    }
    setCashSession({
      id: `CS-${Date.now()}`,
      opened_by: openedBy,
      opening_balance: balance,
      status: 'open',
      opened_at: new Date().toISOString(),
      transactions: [],
    });
  }, [dataSource]);

  const closeCashRegister = useCallback(async (actualCash: number) => {
    // 1. Cerrar caja en Supabase o local
    if (dataSource === 'supabase') {
      const closed = await cashService.close(cashSession, actualCash);
      setCashSession((prev) => ({ ...prev, ...closed }));
    } else {
      setCashSession((prev) => {
        const income = prev.transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
        const expense = prev.transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
        const expected = prev.opening_balance + income - expense;
        return {
          ...prev,
          status: 'closed',
          closing_balance: expected,
          actual_cash: actualCash,
          difference: actualCash - expected,
          closed_at: new Date().toISOString(),
        };
      });
    }

    // 2. Cierre de Venta / Jornada en memoria:
    // Todos los pedidos activos pasan a finalizados ('delivered') para que el tablero Kanban quede en 0
    setOrders((prev) =>
      prev.map((o) =>
        ['pending', 'confirmed', 'preparing', 'ready', 'shipping'].includes(o.status)
          ? {
              ...o,
              status: 'delivered',
              notes: (o.notes || '') + '\n[CIERRE_JORNADA: Finalizado en cierre de venta diario]',
            }
          : o
      )
    );

    // 3. Los domicilios activos pasan a completados
    setDeliveries((prev) =>
      prev.map((d) =>
        d.status !== 'delivered'
          ? { ...d, status: 'delivered' }
          : d
      )
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('show_toast', {
          detail: {
            title: '🏁 Cierre de Venta y Jornada',
            message: 'Caja cerrada y tablero reiniciado a 0 pedidos activos. Los pedidos del día se conservan durante 3 meses para reportes y auditoría.',
            type: 'success',
          },
        })
      );
    }
  }, [cashSession, dataSource]);

  const deleteCashSession = useCallback(async (id: string) => {
    // Optimistic update
    setPastCashSessions((prev) => prev.filter((s) => s.id !== id));
    if (dataSource === 'supabase') {
      try {
        await cashService.delete(id);
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase(activeTenantId);
        throw err;
      }
    }
  }, [dataSource, activeTenantId, syncFromSupabase]);

  const updateCashSession = useCallback(async (id: string, updates: Partial<CashSession>) => {
    if (dataSource === 'supabase') {
      try {
        const updated = await cashService.update(id, updates);
        setPastCashSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase(activeTenantId);
        throw err;
      }
    } else {
      setPastCashSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    }
  }, [dataSource, activeTenantId, syncFromSupabase]);

  const createPastCashSession = useCallback(async (data: Partial<CashSession>) => {
    if (dataSource === 'supabase') {
      try {
        const created = await cashService.createHistorical(data);
        setPastCashSessions((prev) => [created, ...prev]);
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase(activeTenantId);
        throw err;
      }
    } else {
      const manualSession: CashSession = {
        id: `CS-${Date.now()}`,
        opened_by: data.opened_by || 'ChefFlow',
        opening_balance: data.opening_balance || 0,
        closing_balance: data.closing_balance || 0,
        actual_cash: data.actual_cash || 0,
        difference: data.difference || 0,
        status: 'closed',
        opened_at: data.opened_at || new Date().toISOString(),
        closed_at: data.closed_at || new Date().toISOString(),
        transactions: [],
      };
      setPastCashSessions((prev) => [manualSession, ...prev]);
    }
  }, [dataSource, activeTenantId, syncFromSupabase]);

  const updateSettings = useCallback(async (partial: Partial<TenantSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    if (dataSource === 'supabase') {
      try {
        const saved = await settingsService.update(partial, activeTenantId);
        setSettings((prev) => ({ ...prev, ...saved }));
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase(activeTenantId);
        throw err;
      }
    }
  }, [dataSource, activeTenantId, syncFromSupabase]);

  const assignRider = useCallback(async (orderId: string, riderId: string, riderName: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.order_id === orderId ? { ...d, rider_id: riderId, rider_name: riderName, status: 'assigned' } : d))
    );
    if (dataSource === 'supabase') {
      try {
        await deliveryService.update(orderId, { rider_id: riderId, rider_name: riderName, status: 'assigned' });
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase]);

  const updateRiderPosition = useCallback(async (orderId: string, lat: number, lng: number) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.order_id === orderId ? { ...d, latitude: lat, longitude: lng } : d))
    );
    if (dataSource === 'supabase') {
      try {
        await deliveryService.update(orderId, { latitude: lat, longitude: lng });
      } catch (err) {
        logSupabaseError(err);
      }
    }
  }, [dataSource]);

  // Audio & Realtime postgres listeners - Multi-Tenancy Dynamic Re-sub
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    // Use activeTenantId computed from user role (already defined above)
    const tid = activeTenantId;
    if (!isSupabaseConfigured()) return;
    let active = true;

    // Ref or local variable to hold a clean, unlocked audio context
    let unlockedAudioCtx: AudioContext | null = null;
    const resumeAudio = () => {
      try {
        if (unlockedAudioCtx) {
          if (unlockedAudioCtx.state === 'suspended') {
            unlockedAudioCtx.resume().catch(() => {});
          }
          return;
        }
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const ctx = new AudioCtxClass();
          if (ctx.state === 'running') {
            unlockedAudioCtx = ctx;
          } else {
            ctx.resume().then(() => {
              unlockedAudioCtx = ctx;
            }).catch(() => {});
          }
        }
      } catch {
        // Ignore audio initialization before user gesture
      }
    };

    // Listen to common user interaction gestures
    if (typeof window !== 'undefined') {
      window.addEventListener('click', resumeAudio, { once: true });
      window.addEventListener('touchstart', resumeAudio, { once: true });
      window.addEventListener('keydown', resumeAudio, { once: true });
      window.addEventListener('mousedown', resumeAudio, { once: true });
    }

    // Re-fetch data for the newly selected tenant
    syncFromSupabase(tid).catch(logSupabaseError);

    const supabase = createClient();
    if (!supabase) return () => { 
      active = false; 
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
        window.removeEventListener('keydown', resumeAudio);
        window.removeEventListener('mousedown', resumeAudio);
      }
    };

    function playNotificationSound() {
      if (typeof window === 'undefined' || !unlockedAudioCtx || unlockedAudioCtx.state !== 'running') return;
      try {
        const ctx = unlockedAudioCtx;

        const repeats = [0, 0.3, 0.6, 0.9];
        repeats.forEach((delay) => {
          const frequencies = [1174.66, 1567.98]; // D6 & G6 piercing bell frequencies
          frequencies.forEach((freq, idx) => {
            try {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = idx === 0 ? 'sine' : 'triangle';
              osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
              gain.gain.setValueAtTime(0, ctx.currentTime + delay);
              gain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + delay + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);

              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(ctx.currentTime + delay);
              osc.stop(ctx.currentTime + delay + 0.25);
            } catch {
              // Ignore audio creation before gesture
            }
          });
        });
      } catch {
        // Ignore audio context autoplay warnings
      }
    }


    function handleAlarmTrigger() {
      playAlarmSound();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('play_alarm_sound', handleAlarmTrigger);
    }

    const channel = supabase
      .channel(`chefflow-dashboard-${tid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tid}` },
        (payload) => {
          if (active) {
            syncFromSupabase(tid).catch(logSupabaseError);
            if (payload.eventType === 'INSERT') {
              playAlarmSound();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('new_order', { detail: payload.new }));
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tid}` },
        () => { if (active) syncFromSupabase(tid).catch(logSupabaseError); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${tid}` },
        () => { if (active) syncFromSupabase(tid).catch(logSupabaseError); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_details' },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as any;
            setDeliveries((prev) =>
              prev.map((d) =>
                d.order_id === row.order_id
                  ? {
                      ...d,
                      latitude: row.latitude != null ? Number(row.latitude) : d.latitude,
                      longitude: row.longitude != null ? Number(row.longitude) : d.longitude,
                      status: row.status as any,
                    }
                  : d
              )
            );
          } else {
            syncFromSupabase(tid).catch(logSupabaseError);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
        window.removeEventListener('keydown', resumeAudio);
        window.removeEventListener('mousedown', resumeAudio);
      }
      if (unlockedAudioCtx) {
        unlockedAudioCtx.close().catch(() => {});
      }
    };
  }, [user, activeTenantId, syncFromSupabase]);

  const stats = useMemo(() => computeStats(orders, customers, products), [orders, customers, products]);
  const lowStockCount = inventory.filter((i) => i.stock <= i.min_stock).length;
  const activeOrdersCount = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;

  const value = useMemo(
    () => ({
      categories, orders, products, customers, inventory, stockMovements, cashSession, pastCashSessions, settings, deliveries,
      updateOrderStatus, addOrder, deleteOrder, updateOrderDetails, updateProduct, addProduct, deleteProduct, addCategory, updateCategory, deleteCategory, updateInventory,
      addInventoryItem, deleteInventoryItem,
      addCashTransaction, openCashRegister, closeCashRegister, deleteCashSession, updateCashSession, createPastCashSession, updateSettings,
      assignRider, updateRiderPosition, stats, lowStockCount, activeOrdersCount, isLoading,
      selectedTenantId, activeTenantId, setSelectedTenantId, allTenants,
    }),
    [
      categories, orders, products, customers, inventory, stockMovements, cashSession, pastCashSessions, settings, deliveries,
      updateOrderStatus, addOrder, deleteOrder, updateOrderDetails, updateProduct, addProduct, deleteProduct, addCategory, updateCategory, deleteCategory, updateInventory,
      addInventoryItem, deleteInventoryItem,
      addCashTransaction, openCashRegister, closeCashRegister, deleteCashSession, updateCashSession, createPastCashSession, updateSettings,
      assignRider, updateRiderPosition, stats, lowStockCount, activeOrdersCount, isLoading,
      selectedTenantId, activeTenantId, setSelectedTenantId, allTenants,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
