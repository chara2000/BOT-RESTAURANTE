'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
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
} from '@/services/api';
import type {
  Category, CashSession, Customer, DashboardStats, DeliveryAssignment,
  InventoryItem, Order, OrderStatus, Product, StockMovement, TenantSettings,
} from '@/types';
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
  settings: TenantSettings;
  deliveries: DeliveryAssignment[];
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  addOrder: (order: Order) => void;
  deleteOrder: (orderId: string) => Promise<void>;
  updateOrderDetails: (orderId: string, updates: { notes?: string; total?: number; status?: OrderStatus }) => Promise<void>;
  updateProduct: (product: Product) => Promise<Product | void>;
  addProduct: (product: Product) => Promise<Product | void>;
  deleteProduct: (id: string) => Promise<void>;
  addCategory: (category: Partial<Category>) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  updateInventory: (item: InventoryItem) => Promise<void>;
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  addCashTransaction: (type: 'income' | 'expense', amount: number, description: string) => Promise<void>;
  openCashRegister: (balance: number, openedBy: string) => Promise<void>;
  closeCashRegister: (actualCash: number) => Promise<void>;
  updateSettings: (settings: Partial<TenantSettings>) => Promise<void>;
  assignRider: (orderId: string, riderName: string) => Promise<void>;
  updateRiderPosition: (orderId: string, lat: number, lng: number) => Promise<void>;
  stats: DashboardStats;
  lowStockCount: number;
  activeOrdersCount: number;
  isLoading: boolean;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function computeStats(orders: Order[], customers: Customer[], products: Product[]): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);
  const delivered = orders.filter((o) => o.status === 'delivered');
  const todayOrders = delivered.filter((o) => o.created_at.startsWith(today));
  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;

  const weekOrders = delivered.filter((o) => new Date(o.created_at).getTime() >= weekAgo);
  const monthOrders = delivered.filter((o) => new Date(o.created_at).getTime() >= monthAgo);

  const sum = (list: Order[]) => list.reduce((a, o) => a + o.total, 0);
  const active = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

  const productSales = new Map<string, { name: string; sold: number; revenue: number }>();
  delivered.forEach((o) =>
    o.items.forEach((i) => {
      const cur = productSales.get(i.product.id) ?? { name: i.product.name, sold: 0, revenue: 0 };
      cur.sold += i.quantity;
      cur.revenue += i.unit_price * i.quantity;
      productSales.set(i.product.id, cur);
    })
  );

  return {
    salesToday: sum(todayOrders),
    salesWeek: sum(weekOrders),
    salesMonth: sum(monthOrders),
    activeOrders: active.length,
    deliveredOrders: delivered.length,
    avgTicket: delivered.length ? sum(delivered) / delivered.length : 0,
    newCustomers: customers.filter((c) => c.segment === 'new').length,
    returningCustomers: customers.filter((c) => ['frequent', 'vip'].includes(c.segment)).length,
    topProducts: [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    salesByHour: [
      { hour: '10h', amount: 45000 }, { hour: '12h', amount: 128000 },
      { hour: '14h', amount: 185000 }, { hour: '16h', amount: 92000 },
      { hour: '18h', amount: 210000 }, { hour: '20h', amount: 165000 },
      { hour: '22h', amount: 78000 },
    ],
    salesByDay: [
      { day: 'Lun', amount: 420000 }, { day: 'Mar', amount: 580000 },
      { day: 'Mié', amount: 490000 }, { day: 'Jue', amount: 720000 },
      { day: 'Vie', amount: 890000 }, { day: 'Sáb', amount: 1100000 },
      { day: 'Dom', amount: 650000 },
    ],
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
  const [isLoading, setIsLoading] = useState(useSupabase);

  const buildDeliveries = useCallback((orderList: Order[]): DeliveryAssignment[] =>
    orderList
      .filter((o) => o.type === 'delivery')
      .map((o, i) => ({
        order_id: o.id,
        order: o,
        status: o.status === 'delivered' ? 'delivered' as const : i === 0 ? 'assigned' as const : 'searching' as const,
        latitude: 6.2088 + i * 0.01,
        longitude: -75.5678 + i * 0.01,
      })), []);

  const syncFromSupabase = useCallback(async () => {
    try {
      const data = await loadDashboardData();
      if (!data) return;
      if (data.categories) setCategories(data.categories);
      setOrders(data.orders);
      setProducts(data.products);
      setCustomers(data.customers);
      setInventory(data.inventory);
      if (data.stockMovements) setStockMovements(data.stockMovements);
      setDeliveries(data.deliveries?.length ? data.deliveries : buildDeliveries(data.orders));
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
      if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      setDataSource('supabase');
    } finally {
      setIsLoading(false);
    }
  }, [buildDeliveries]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) return;
    let active = true;

    syncFromSupabase().catch(logSupabaseError);

    const supabase = createClient();
    if (!supabase) return () => { active = false; };

    function playNotificationSound() {
      if (typeof window === 'undefined') return;
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const ctx = new AudioCtxClass();

        ctx.resume().then(() => {
          // Play 3 ding tones in sequence: high → low → high
          const tones = [1046, 784, 1046]; // C6, G5, C6
          tones.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const startAt = ctx.currentTime + i * 0.22;
            gain.gain.setValueAtTime(0, startAt);
            gain.gain.linearRampToValueAtTime(0.8, startAt + 0.02); // fast attack
            gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4); // decay

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startAt);
            osc.stop(startAt + 0.4);
          });
        }).catch(err => {
          console.warn('Audio resume failed:', err);
        });
      } catch (err) {
        console.warn('Audio bell failed', err);
      }
    }

    const channel = supabase
      .channel('chefflow-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${DEMO_TENANT_ID}` },
        (payload) => {
          if (active) {
            syncFromSupabase().catch(logSupabaseError);
            if (payload.eventType === 'INSERT') playNotificationSound();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${DEMO_TENANT_ID}` },
        () => { if (active) syncFromSupabase().catch(logSupabaseError); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${DEMO_TENANT_ID}` },
        () => { if (active) syncFromSupabase().catch(logSupabaseError); }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [syncFromSupabase, user]);

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

    if (prevOrder) {
      const shortId = prevOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${orderId.slice(0, 6).toUpperCase()}`;
      const wasAlreadyIncome = prevOrder.status === 'confirmed' || prevOrder.status === 'delivered';
      const isNewIncome = status === 'confirmed' || status === 'delivered';

      if (isNewIncome && !wasAlreadyIncome) {
        if (cashSession.status === 'open') {
          if (dataSource === 'supabase' && cashSession.id) {
            try {
              await cashService.addTransaction(cashSession.id, 'income', prevOrder.total, `Pedido ${shortId} - ${status === 'confirmed' ? 'Confirmado' : 'Entregado'}`);
            } catch (_) {}
          }
          setCashSession((prev) => ({
            ...prev,
            transactions: [{ id: `t${Date.now()}`, type: 'income', amount: prevOrder.total, description: `Pedido ${shortId}`, created_at: new Date().toISOString() }, ...prev.transactions],
          }));
        }
      } else if (status === 'cancelled' && wasAlreadyIncome) {
        if (cashSession.status === 'open') {
          if (dataSource === 'supabase' && cashSession.id) {
            try {
              await cashService.addTransaction(cashSession.id, 'expense', prevOrder.total, `Cancelación Pedido ${shortId}`);
            } catch (_) {}
          }
          setCashSession((prev) => ({
            ...prev,
            transactions: [{ id: `t${Date.now()}`, type: 'expense', amount: prevOrder.total, description: `Cancelación Pedido ${shortId}`, created_at: new Date().toISOString() }, ...prev.transactions],
          }));
        }
      }
    }

    if (dataSource === 'supabase') {
      try {
        await ordersService.updateStatus(orderId, status);
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders, cashSession]);

  const deleteOrder = useCallback(async (orderId: string) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setDeliveries((prev) => prev.filter((d) => d.order_id !== orderId));

    if (prevOrder && (prevOrder.status === 'confirmed' || prevOrder.status === 'delivered')) {
      const shortId = prevOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${orderId.slice(0, 6).toUpperCase()}`;
      if (cashSession.status === 'open') {
        if (dataSource === 'supabase' && cashSession.id) {
          try {
            await cashService.addTransaction(cashSession.id, 'expense', prevOrder.total, `Eliminación Pedido ${shortId}`);
          } catch (_) {}
        }
        setCashSession((prev) => ({
          ...prev,
          transactions: [{ id: `t${Date.now()}`, type: 'expense', amount: prevOrder.total, description: `Eliminación Pedido ${shortId}`, created_at: new Date().toISOString() }, ...prev.transactions],
        }));
      }
    }

    if (dataSource === 'supabase') {
      try {
        const supabase = createClient();
        if (supabase) {
          await supabase.from('orders').delete().eq('id', orderId);
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders, cashSession]);

  const updateOrderDetails = useCallback(async (orderId: string, updates: { notes?: string; total?: number; status?: OrderStatus }) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    if (!prevOrder) return;

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (dataSource === 'supabase') {
      try {
        const supabase = createClient();
        if (supabase) {
          const { error } = await supabase.from('orders').update({
            notes: updates.notes ?? prevOrder.notes,
            total: updates.total ?? prevOrder.total,
            status: updates.status ?? prevOrder.status,
            updated_at: new Date().toISOString()
          }).eq('id', orderId);
          if (error) throw error;
        }
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase, orders]);

  const addOrder = useCallback((order: Order) => {
    setOrders((prev) => [order, ...prev]);
    if (order.type === 'delivery') {
      setDeliveries((prev) => [
        ...prev,
        { order_id: order.id, order, status: 'searching', latitude: 6.2088, longitude: -75.5678 },
      ]);
    }
  }, []);

  const updateProduct = useCallback(async (product: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    if (dataSource === 'supabase') {
      try {
        const saved = await productsService.update(product);
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        return saved;
      } catch (err) {
        logSupabaseError(err);
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
        return saved;
      } catch (err) {
        logSupabaseError(err);
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        throw err;
      }
    }
  }, [dataSource]);

  const deleteProduct = useCallback(async (id: string) => {
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (dataSource === 'supabase') {
      try {
        await productsService.remove(id);
      } catch (err) {
        logSupabaseError(err);
        setProducts(previous);
        throw err;
      }
    }
  }, [dataSource, products]);

  const addCategory = useCallback(async (category: Partial<Category>) => {
    if (dataSource === 'supabase') {
      try {
        const saved = await categoriesService.create(category);
        setCategories((prev) => [...prev, saved].sort((a, b) => a.sort_order - b.sort_order));
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
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase]);

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
    if (dataSource === 'supabase') {
      const closed = await cashService.close(cashSession, actualCash);
      setCashSession((prev) => ({ ...prev, ...closed }));
      return;
    }
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
  }, [cashSession, dataSource]);

  const updateSettings = useCallback(async (partial: Partial<TenantSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    if (dataSource === 'supabase') {
      try {
        const saved = await settingsService.update(partial);
        setSettings((prev) => ({ ...prev, ...saved }));
      } catch (err) {
        logSupabaseError(err);
        await syncFromSupabase();
        throw err;
      }
    }
  }, [dataSource, syncFromSupabase]);

  const assignRider = useCallback(async (orderId: string, riderName: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.order_id === orderId ? { ...d, rider_name: riderName, status: 'assigned' } : d))
    );
    if (dataSource === 'supabase') {
      try {
        await deliveryService.update(orderId, { rider_name: riderName, status: 'assigned' });
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

  const stats = useMemo(() => computeStats(orders, customers, products), [orders, customers, products]);
  const lowStockCount = inventory.filter((i) => i.stock <= i.min_stock).length;
  const activeOrdersCount = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;

  const value = useMemo(
    () => ({
      categories, orders, products, customers, inventory, stockMovements, cashSession, settings, deliveries,
      updateOrderStatus, addOrder, deleteOrder, updateOrderDetails, updateProduct, addProduct, deleteProduct, addCategory, updateCategory, updateInventory,
      addInventoryItem, deleteInventoryItem,
      addCashTransaction, openCashRegister, closeCashRegister, updateSettings,
      assignRider, updateRiderPosition, stats, lowStockCount, activeOrdersCount, isLoading,
    }),
    [
      categories, orders, products, customers, inventory, stockMovements, cashSession, settings, deliveries,
      updateOrderStatus, addOrder, deleteOrder, updateOrderDetails, updateProduct, addProduct, deleteProduct, addCategory, updateCategory, updateInventory,
      addInventoryItem, deleteInventoryItem,
      addCashTransaction, openCashRegister, closeCashRegister, updateSettings,
      assignRider, updateRiderPosition, stats, lowStockCount, activeOrdersCount, isLoading,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
