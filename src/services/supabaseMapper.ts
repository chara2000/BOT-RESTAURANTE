import type { Customer, InventoryItem, Order, OrderItem, Product, TenantSettings } from '@/types';

export function mapProduct(row: Record<string, unknown>): Product {
  const categories = row.categories as { name?: string } | null;
  return {
    id: String(row.id),
    name: String(row.name),
    category: categories?.name ?? 'General',
    category_id: row.category_id ? String(row.category_id) : undefined,
    price: Number(row.price),
    description: String(row.description ?? ''),
    image_url: String(row.image_url ?? ''),
    is_available: Boolean(row.is_available ?? true),
    is_combo: Boolean(row.is_combo ?? false),
  };
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    email: row.email ? String(row.email) : undefined,
    telegram_chat_id: row.telegram_chat_id ? String(row.telegram_chat_id) : undefined,
    segment: (row.segment as Customer['segment']) ?? 'new',
    total_spent: Number(row.total_spent ?? 0),
    order_count: Number(row.order_count ?? 0),
    address_default: row.address_default ? String(row.address_default) : undefined,
  };
}

export function mapOrderItem(row: Record<string, unknown>): OrderItem {
  const productRow = row.products as Record<string, unknown> | null;
  const product: Product = productRow
    ? mapProduct(productRow)
    : {
        id: String(row.product_id ?? 'unknown'),
        name: 'Producto',
        category: 'General',
        price: Number(row.unit_price ?? 0),
        description: '',
        image_url: '',
        is_available: true,
      };

  return {
    id: String(row.id),
    product,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    notes: row.notes ? String(row.notes) : undefined,
  };
}

export function mapOrder(row: Record<string, unknown>): Order {
  const customerRow = row.customers as Record<string, unknown> | null;
  const items = (row.order_items as Record<string, unknown>[] | null) ?? [];

  return {
    id: String(row.id),
    customer: customerRow ? mapCustomer(customerRow) : undefined,
    type: row.type as Order['type'],
    status: row.status as Order['status'],
    payment_method: row.payment_method as Order['payment_method'],
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    tips: Number(row.tips),
    total: Number(row.total),
    delivery_address: row.delivery_address ? String(row.delivery_address) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    items: items.map(mapOrderItem),
    created_at: String(row.created_at),
  };
}

export function mapInventory(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit),
    stock: Number(row.stock),
    min_stock: Number(row.min_stock),
  };
}

export function mapSettings(row: Record<string, unknown>): Partial<TenantSettings> {
  return {
    restaurant_name: String(row.restaurant_name ?? 'ChefFlow'),
    delivery_fee: Number(row.delivery_fee ?? 5000),
    telegram_enabled: Boolean(row.telegram_enabled),
    whatsapp_enabled: Boolean(row.whatsapp_enabled),
    ai_enabled: Boolean(row.ai_enabled),
    ai_model: String(row.ai_model ?? 'local-chefflow'),
    payment_methods: (row.payment_methods as TenantSettings['payment_methods']) ?? ['cash', 'nequi'],
  };
}
