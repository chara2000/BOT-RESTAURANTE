export type UserRole = 'super_admin' | 'admin' | 'operator' | 'kitchen' | 'delivery';
export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipping' | 'delivered' | 'cancelled';
export type OrderType = 'delivery' | 'pickup' | 'dine_in';
export type PaymentMethod = 'cash' | 'card' | 'nequi' | 'daviplata' | 'wompi' | 'transfer';
export type CustomerSegment = 'new' | 'frequent' | 'vip' | 'inactive';
export type TransactionType = 'income' | 'expense';

export interface Product {
  id: string;
  name: string;
  category: string;
  category_id?: string;
  price: number;
  description: string;
  image_url: string;
  is_available: boolean;
  stock?: number;
  is_combo?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  telegram_chat_id?: string;
  whatsapp_id?: string;
  segment: CustomerSegment;
  total_spent: number;
  order_count: number;
  address_default?: string;
}

export interface Order {
  id: string;
  customer?: Customer;
  type: OrderType;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status?: 'pending' | 'paid' | 'failed';
  change_amount?: number;
  subtotal: number;
  delivery_fee: number;
  tips: number;
  total: number;
  delivery_address?: string;
  notes?: string;
  items: OrderItem[];
  created_at: string;
  rider_id?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
}

export interface StockMovement {
  id: string;
  inventory_id: string;
  inventory_name: string;
  quantity: number;
  reason: string;
  created_at: string;
}

export interface CashSession {
  id: string;
  opened_by: string;
  opening_balance: number;
  closing_balance?: number;
  actual_cash?: number;
  difference?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  transactions: CashTransaction[];
}

export interface CashTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  created_at: string;
}

export interface DeliveryAssignment {
  order_id: string;
  order: Order;
  rider_name?: string;
  status: 'searching' | 'assigned' | 'picked_up' | 'delivered' | 'failed';
  latitude: number;
  longitude: number;
  estimated_arrival?: string;
}

export interface DashboardStats {
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  activeOrders: number;
  deliveredOrders: number;
  avgTicket: number;
  newCustomers: number;
  returningCustomers: number;
  topProducts: { name: string; sold: number; revenue: number }[];
  salesByHour: { hour: string; amount: number }[];
  salesByDay: { day: string; amount: number }[];
}

export interface TenantSettings {
  restaurant_name: string;
  delivery_fee: number;
  telegram_bot_token?: string;
  telegram_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_phone?: string;
  ai_enabled: boolean;
  ai_model: string;
  payment_methods: PaymentMethod[];
  business_hours: { day: string; open: string; close: string; closed: boolean }[];
  // Cobertura de domicilio
  coverage_city?: string;           // Nombre de la ciudad/municipio (ej: "Puerto Tejada")
  coverage_department?: string;     // Departamento (ej: "Cauca")
  coverage_keywords?: string[];     // Palabras clave que deben aparecer en la dirección
  coverage_require_keywords?: boolean; // Si true, la dirección debe contener al menos una keyword
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  shipping: 'En Camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const ORDER_STATUS_COLUMNS: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered', 'cancelled',
];

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  new: 'Nuevo',
  frequent: 'Frecuente',
  vip: 'VIP',
  inactive: 'Inactivo',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  wompi: 'Wompi',
  transfer: 'Transferencia',
};
