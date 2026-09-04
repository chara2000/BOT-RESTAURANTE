import type { Customer, InventoryItem, Order, OrderItem, Product, TenantSettings } from '@/types';

export function mapProduct(row: Record<string, unknown>): Product {
  let r = row;
  if (Array.isArray(r)) r = r[0] || {};
  const categories = (r.categories || (r as any).category) as { name?: string } | string | null;
  const categoryName = typeof categories === 'string' ? categories : (categories?.name ?? 'General');

  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? 'Producto'),
    category: categoryName,
    category_id: r.category_id ? String(r.category_id) : undefined,
    price: Number(r.price ?? 0),
    description: String(r.description ?? ''),
    image_url: String(r.image_url ?? ''),
    is_available: Boolean(r.is_available ?? true),
    is_combo: Boolean(r.is_combo ?? false),
    additions: Array.isArray(r.additions) ? (r.additions as Product['additions']) : undefined,
  };
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  let cust = row;
  if (Array.isArray(cust)) cust = cust[0] || {};
  return {
    id: String(cust.id ?? ''),
    name: String(cust.name ?? 'Cliente'),
    phone: String(cust.phone ?? ''),
    email: cust.email ? String(cust.email) : undefined,
    telegram_chat_id: cust.telegram_chat_id ? String(cust.telegram_chat_id) : undefined,
    segment: (cust.segment as Customer['segment']) ?? 'new',
    total_spent: Number(cust.total_spent ?? 0),
    order_count: Number(cust.order_count ?? 0),
    address_default: cust.address_default ? String(cust.address_default) : undefined,
  };
}

export function mapOrderItem(row: Record<string, unknown>): OrderItem {
  let productRow = (row.products || (row as any).product) as Record<string, unknown> | null;
  if (Array.isArray(productRow)) productRow = productRow[0] || null;

  const product: Product = productRow
    ? mapProduct(productRow)
    : {
        id: String(row.product_id ?? (row as any).id ?? 'unknown'),
        name: String((row as any).product_name || (row as any).name || 'Producto'),
        category: 'General',
        price: Number(row.unit_price ?? 0),
        description: '',
        image_url: '',
        is_available: true,
      };

  return {
    id: String(row.id ?? row.product_id ?? Math.random().toString()),
    product,
    quantity: Number(row.quantity ?? 1),
    unit_price: Number(row.unit_price ?? product.price ?? 0),
    notes: row.notes ? String(row.notes) : undefined,
  };
}

export function mapOrder(row: Record<string, unknown>): Order {
  let customerRow = row.customers as Record<string, unknown> | null;
  if (Array.isArray(customerRow)) customerRow = customerRow[0] || null;

  const items = (row.order_items as Record<string, unknown>[] | null) ?? (row.items as Record<string, unknown>[] | null) ?? [];

  return {
    id: String(row.id),
    customer: customerRow ? mapCustomer(customerRow) : undefined,
    type: row.type as Order['type'],
    status: row.status as Order['status'],
    payment_method: row.payment_method as Order['payment_method'],
    subtotal: Number(row.subtotal ?? 0),
    delivery_fee: Number(row.delivery_fee ?? 0),
    tips: Number(row.tips ?? 0),
    total: Number(row.total ?? 0),
    delivery_address: row.delivery_address ? String(row.delivery_address) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    items: Array.isArray(items) ? items.map(mapOrderItem) : [],
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    tracking_token: row.tracking_token ? String(row.tracking_token) : undefined,
    delivery_pin: row.delivery_pin ? String(row.delivery_pin) : undefined,
    rider_id: row.rider_id ? String(row.rider_id) : undefined,
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

export function decodePaymentAccounts(phoneString?: string): { nequi_number: string; bancolombia_number: string; bancolombia_type: string } {
  if (!phoneString || !phoneString.includes('|')) {
    return {
      nequi_number: '300 123 4567',
      bancolombia_number: '123-456789-00',
      bancolombia_type: 'Ahorros',
    };
  }

  try {
    const parts = phoneString.split('|');
    const nqMatch = parts[0]?.match(/nq:(.+)/i);
    const bcMatch = parts[1]?.match(/bc:(.+)/i);
    const tp = parts[2] || 'Ahorros';

    return {
      nequi_number: nqMatch ? nqMatch[1].trim() : '300 123 4567',
      bancolombia_number: bcMatch ? bcMatch[1].trim() : '123-456789-00',
      bancolombia_type: tp.trim(),
    };
  } catch (e) {
    return {
      nequi_number: '300 123 4567',
      bancolombia_number: '123-456789-00',
      bancolombia_type: 'Ahorros',
    };
  }
}

export function encodePaymentAccounts(nequi?: string, bancolombia?: string, type?: string): string {
  const nq = (nequi || '300 123 4567').trim();
  const bc = (bancolombia || '123-456789-00').trim();
  const tp = (type || 'Ahorros').trim();
  return `nq:${nq}|bc:${bc}|${tp}`;
}

export function mapSettings(row: Record<string, unknown>): Partial<TenantSettings> {
  const paymentAccounts = decodePaymentAccounts(row.whatsapp_phone ? String(row.whatsapp_phone) : undefined);

  return {
    restaurant_name: String(row.restaurant_name ?? 'ChefFlow'),
    logo_url: row.logo_url ? String(row.logo_url) : undefined,
    delivery_fee: Number(row.delivery_fee ?? 5000),
    telegram_enabled: Boolean(row.telegram_enabled),
    telegram_bot_token: row.telegram_bot_token ? String(row.telegram_bot_token) : undefined,
    whatsapp_enabled: Boolean(row.whatsapp_enabled),
    ai_enabled: Boolean(row.ai_enabled),
    ai_model: String(row.ai_model ?? 'local-chefflow'),
    payment_methods: (row.payment_methods as TenantSettings['payment_methods']) ?? ['cash', 'nequi'],
    // Cuentas de Pago Digital
    nequi_number: row.nequi_number ? String(row.nequi_number) : paymentAccounts.nequi_number,
    bancolombia_number: row.bancolombia_number ? String(row.bancolombia_number) : paymentAccounts.bancolombia_number,
    bancolombia_type: row.bancolombia_type ? String(row.bancolombia_type) : paymentAccounts.bancolombia_type,
    // Carta o Menú PDF (soporta columna dedicada o guardado en logo_url)
    menu_pdf_url: row.menu_pdf_url
      ? String(row.menu_pdf_url)
      : (row.logo_url && String(row.logo_url).toLowerCase().includes('.pdf') ? String(row.logo_url) : undefined),
    // Ubicación exacta del restaurante
    restaurant_lat: row.restaurant_lat != null ? Number(row.restaurant_lat) : undefined,
    restaurant_lng: row.restaurant_lng != null ? Number(row.restaurant_lng) : undefined,
    // Cobertura de domicilio
    coverage_city: row.coverage_city ? String(row.coverage_city) : undefined,
    coverage_department: row.coverage_department ? String(row.coverage_department) : undefined,
    coverage_keywords: row.coverage_keywords ? (row.coverage_keywords as string[]) : undefined,
    coverage_require_keywords: row.coverage_require_keywords != null ? Boolean(row.coverage_require_keywords) : true,
    auto_assign_riders: row.auto_assign_riders != null ? Boolean(row.auto_assign_riders) : false,
    allow_external_riders: row.allow_external_riders != null ? Boolean(row.allow_external_riders) : false,
    // Horarios de servicio
    business_hours: row.business_hours
      ? (row.business_hours as TenantSettings['business_hours'])
      : undefined,
  };
}

