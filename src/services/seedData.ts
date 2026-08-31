import type {
  CashSession, Customer, InventoryItem, Order, Product,
  StockMovement, TenantSettings,
} from '@/types';

export const initialProducts: Product[] = [
  { id: '1', name: 'Salchipapa Salvaje Shek', category: 'Salchipapas', price: 28000, description: 'Papa criolla y francesa, salchicha americana, tocineta, queso costeño gratinado, ripio y salsas de la casa.', image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600', is_available: true, stock: 50 },
  { id: '2', name: 'Hamburguesa Shek Doble Queso', category: 'Hamburguesas', price: 26000, description: 'Doble carne a la parrilla, queso cheddar y costeño fundido, tocineta caramelizada y pan brioche.', image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600', is_available: true, stock: 45 },
  { id: '3', name: 'Picada Colombiana Especial', category: 'Picadas & Parrilla', price: 48000, description: 'Chicharrón carnudo crocante, costilla BBQ, chorizo santarrosano, morcilla, papa criolla y patacón.', image_url: 'https://images.unsplash.com/photo-1544025162-d76538d7e027?w=600', is_available: true, stock: 20 },
  { id: '4', name: 'Mazorcada Desgranada Mixta', category: 'Desgranados', price: 24000, description: 'Maíz dulce a la mantequilla, pollo y res a la plancha, queso costeño rallado, tocineta y ripio.', image_url: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600', is_available: true, stock: 30 },
  { id: '5', name: 'Granizado de Milo Supremo', category: 'Bebidas & Granizados', price: 12000, description: 'Cremoso granizado a punto de nieve con abundante Milo, leche condensada y chantilly.', image_url: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600', is_available: true, stock: 80 },
  { id: '6', name: 'Michelada Frutal Mango Biche', category: 'Bebidas & Cócteles', price: 14000, description: 'Cerveza helada con sal, limón, pulpa natural de mango biche fresco y salsa chamoy artesanal.', image_url: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600', is_available: true, stock: 60 },
  { id: '7', name: 'Alitas BBQ Melosas (8 und)', category: 'Alitas & Pollo', price: 24000, description: 'Alitas crocantes bañadas en salsa BBQ de maracuyá ahumada, papas francesas y aderezo ranch.', image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600', is_available: true, stock: 35 },
  { id: '8', name: 'Patacones con Hogao y Queso', category: 'Entradas', price: 16000, description: 'Patacones crocantes de plátano verde con hogao criollo casero y queso campesino rallado.', image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600', is_available: true, stock: 40 },
];

export const initialCustomers: Customer[] = [
  { id: 'c1', name: 'Juan Carlos Gómez', phone: '+57 312 456 7890', telegram_chat_id: '@jc_gomez', segment: 'vip', total_spent: 345000, order_count: 12, address_default: 'Calle 10A #34-56, El Poblado' },
  { id: 'c2', name: 'María Paula Aristizábal', phone: '+57 320 890 1234', telegram_chat_id: '@mapa_aristizabal', segment: 'frequent', total_spent: 124000, order_count: 4 },
  { id: 'c3', name: 'Andrés Felipe Restrepo', phone: '+57 315 234 5678', segment: 'new', total_spent: 42000, order_count: 1 },
  { id: 'c4', name: 'Diana Carolina Hoyos', phone: '+57 300 765 4321', telegram_chat_id: '@diana_hoyos', segment: 'inactive', total_spent: 89000, order_count: 3 },
  { id: 'c5', name: 'Dana White', phone: '+57 301 111 2233', segment: 'frequent', total_spent: 210000, order_count: 7 },
];

export const initialOrders: Order[] = [
  {
    id: 'ORD-001', customer: initialCustomers[0], type: 'delivery', status: 'pending',
    payment_method: 'nequi', subtotal: 74000, delivery_fee: 5000, tips: 3000, total: 82000,
    delivery_address: 'Calle 10A #34-56, El Poblado, Medellín',
    notes: 'Por favor entregar sin cebolla en la hamburguesa.',
    items: [
      { id: 'oi1', product: initialProducts[0], quantity: 1, unit_price: 32000 },
      { id: 'oi2', product: initialProducts[1], quantity: 1, unit_price: 42000 },
    ],
    created_at: '2026-06-18T14:45:00-05:00',
  },
  {
    id: 'ORD-002', customer: initialCustomers[1], type: 'pickup', status: 'preparing',
    payment_method: 'wompi', subtotal: 42000, delivery_fee: 0, tips: 2000, total: 44000,
    items: [{ id: 'oi3', product: initialProducts[1], quantity: 1, unit_price: 42000 }],
    created_at: '2026-06-18T14:50:00-05:00',
  },
  {
    id: 'ORD-003', customer: initialCustomers[2], type: 'dine_in', status: 'ready',
    payment_method: 'card', subtotal: 44000, delivery_fee: 0, tips: 4000, total: 48000,
    items: [
      { id: 'oi4', product: initialProducts[0], quantity: 1, unit_price: 32000 },
      { id: 'oi5', product: initialProducts[2], quantity: 1, unit_price: 12000 },
    ],
    created_at: '2026-06-18T14:58:00-05:00',
  },
  {
    id: 'ORD-004', customer: initialCustomers[4], type: 'delivery', status: 'shipping',
    payment_method: 'daviplata', subtotal: 90000, delivery_fee: 5000, tips: 5000, total: 100000,
    delivery_address: 'Carrera 43A #1-50, El Poblado',
    items: [{ id: 'oi6', product: initialProducts[5], quantity: 3, unit_price: 30000 }],
    created_at: '2026-06-18T15:10:00-05:00',
  },
  {
    id: 'ORD-005', customer: initialCustomers[3], type: 'delivery', status: 'confirmed',
    payment_method: 'cash', subtotal: 56000, delivery_fee: 5000, tips: 0, total: 61000,
    delivery_address: 'Av. El Poblado #5-60',
    items: [
      { id: 'oi7', product: initialProducts[3], quantity: 1, unit_price: 24000 },
      { id: 'oi8', product: initialProducts[4], quantity: 2, unit_price: 9500 },
      { id: 'oi9', product: initialProducts[6], quantity: 1, unit_price: 18000 },
    ],
    created_at: '2026-06-18T15:20:00-05:00',
  },
  {
    id: 'ORD-006', customer: initialCustomers[0], type: 'pickup', status: 'delivered',
    payment_method: 'nequi', subtotal: 64000, delivery_fee: 0, tips: 4000, total: 68000,
    items: [{ id: 'oi10', product: initialProducts[0], quantity: 2, unit_price: 32000 }],
    created_at: '2026-06-18T12:30:00-05:00',
  },
];

export const initialInventory: InventoryItem[] = [
  { id: 'inv1', name: 'Pan Brioche', unit: 'unidades', stock: 45, min_stock: 15 },
  { id: 'inv2', name: 'Carne Madurada 150g', unit: 'unidades', stock: 38, min_stock: 20 },
  { id: 'inv3', name: 'Queso Provolone', unit: 'kg', stock: 4.2, min_stock: 1.5 },
  { id: 'inv4', name: 'Tomate Chonto', unit: 'kg', stock: 12.0, min_stock: 5.0 },
  { id: 'inv5', name: 'Burrata Fresca', unit: 'unidades', stock: 5, min_stock: 8 },
  { id: 'inv6', name: 'Papas Pre-Fritas', unit: 'kg', stock: 25.0, min_stock: 10.0 },
];

export const initialStockMovements: StockMovement[] = [
  { id: 'sm1', inventory_id: 'inv1', inventory_name: 'Pan Brioche', quantity: -3, reason: 'sale', created_at: '2026-06-18T14:50:00-05:00' },
  { id: 'sm2', inventory_id: 'inv2', inventory_name: 'Carne Madurada 150g', quantity: -2, reason: 'sale', created_at: '2026-06-18T14:50:00-05:00' },
  { id: 'sm3', inventory_id: 'inv5', inventory_name: 'Burrata Fresca', quantity: 10, reason: 'purchase', created_at: '2026-06-18T08:00:00-05:00' },
];

export const initialCashSession: CashSession = {
  id: 'CS-101',
  opened_by: 'Orlando Laurentius',
  opening_balance: 150000,
  status: 'open',
  opened_at: '2026-06-18T08:00:00-05:00',
  transactions: [
    { id: 't1', type: 'income', amount: 82000, description: 'Pago Venta ORD-001', created_at: '2026-06-18T14:48:00-05:00' },
    { id: 't2', type: 'expense', amount: 35000, description: 'Pago de gas propano', created_at: '2026-06-18T11:15:00-05:00' },
    { id: 't3', type: 'income', amount: 68000, description: 'Pago Venta ORD-006', created_at: '2026-06-18T12:35:00-05:00' },
  ],
};

export const initialSettings: TenantSettings = {
  restaurant_name: 'ChefFlow Restaurante',
  delivery_fee: 5000,
  telegram_enabled: true,
  telegram_bot_token: '',
  whatsapp_enabled: false,
  whatsapp_phone: '',
  ai_enabled: true,
  ai_model: 'local-chefflow',
  auto_assign_riders: false,
  allow_external_riders: false,
  payment_methods: ['cash', 'nequi', 'daviplata', 'wompi', 'card', 'transfer'],
  // Ubicación por defecto (Bogotá, Colombia)
  restaurant_lat: 4.7110,
  restaurant_lng: -74.0721,
  business_hours: [
    { day: 'Lunes', open: '11:00', close: '22:00', closed: false },
    { day: 'Martes', open: '11:00', close: '22:00', closed: false },
    { day: 'Miércoles', open: '11:00', close: '22:00', closed: false },
    { day: 'Jueves', open: '11:00', close: '23:00', closed: false },
    { day: 'Viernes', open: '11:00', close: '23:30', closed: false },
    { day: 'Sábado', open: '12:00', close: '00:00', closed: false },
    { day: 'Domingo', open: '12:00', close: '22:00', closed: false },
  ],
};

// Re-export for backward compatibility
export * from '@/types';
