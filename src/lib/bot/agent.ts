import { createClient } from '@supabase/supabase-js';
import { Telegraf } from 'telegraf';
import type { OrderItem, Product } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotState =
  | 'idle'
  | 'selecting_quantity'
  | 'selecting_item_note'
  | 'checkout_cash_amount'
  | 'checkout_address'
  | 'tracking_order'
  | 'awaiting_cancel_confirm'
  | 'contacting_manager'
  | 'awaiting_payment_receipt';

export interface BotSession {
  chatId: number;
  state: BotState;
  cart: OrderItem[];
  selectedProduct?: Product;
  pendingItem?: { product: Product; quantity: number };
  paymentMethod?: 'cash' | 'transfer' | 'ondelivery';
  paymentStatus?: 'pending' | 'paid' | 'pending_verification';
  changeAmount?: number;
  customerName?: string;
  paymentReceiptId?: string;
  pendingCancelOrderId?: string; // ID del pedido pendiente de cancelar
}

export interface BotResponse {
  text: string;
  reply_markup?: object;
}

// ─── Session Store (bot_sessions table) ──────────────────────────────────────────────────────

const TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

async function getSession(chatId: number, username: string): Promise<BotSession> {
  // Intentar leer de bot_sessions primero
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('session_data')
    .eq('chat_id', chatId.toString())
    .eq('tenant_id', TENANT_ID)
    .single();

  if (!error && data?.session_data) {
    return data.session_data as BotSession;
  }

  // Fallback: migrar desde chat_messages si existe una sesión antigua
  const { data: legacy } = await supabase
    .from('chat_messages')
    .select('metadata')
    .eq('content', 'SESSION_STATE')
    .eq('metadata->>chatId', chatId.toString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (legacy?.metadata) {
    const migratedSession = legacy.metadata as BotSession;
    // Limpiar registros viejos y guardar en nueva tabla
    await supabase
      .from('chat_messages')
      .delete()
      .eq('content', 'SESSION_STATE')
      .eq('metadata->>chatId', chatId.toString());
    await saveSession(migratedSession);
    return migratedSession;
  }

  return { chatId, state: 'idle', cart: [], customerName: username };
}

async function saveSession(session: BotSession): Promise<void> {
  const { error } = await supabase
    .from('bot_sessions')
    .upsert(
      {
        chat_id: session.chatId.toString(),
        tenant_id: TENANT_ID,
        session_data: session,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id,tenant_id' }
    );

  if (error) {
    console.warn('Failed to upsert to bot_sessions, falling back to chat_messages:', error.message);
    await supabase.from('chat_messages').insert([{
      direction: 'outbound',
      content: 'SESSION_STATE',
      metadata: session as any
    }]);
  }
}

// ─── Tenant Settings ──────────────────────────────────────────────────────────

interface CachedSettings {
  delivery_fee: number;
  business_hours: { day: string; open: string; close: string; closed: boolean }[];
  coverage_city?: string;
  coverage_department?: string;
  coverage_keywords?: string[];
  coverage_require_keywords?: boolean;
}

let _settingsCache: CachedSettings | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60_000; // refresca cada 1 minuto

async function getTenantSettings(): Promise<CachedSettings> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) {
    return _settingsCache;
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('delivery_fee, business_hours, coverage_city, coverage_department, coverage_keywords, coverage_require_keywords')
    .eq('tenant_id', TENANT_ID)
    .single();

  if (error) {
    console.warn('Failed to query all tenant_settings fields (possibly missing coverage columns):', error.message);
    // Fallback: intentar seleccionar solo campos básicos
    const { data: basicData, error: basicError } = await supabase
      .from('tenant_settings')
      .select('delivery_fee, business_hours')
      .eq('tenant_id', TENANT_ID)
      .single();

    if (basicError) {
      console.error('Failed to query basic tenant_settings:', basicError.message);
      return {
        delivery_fee: 0,
        business_hours: [],
      };
    }

    _settingsCache = {
      delivery_fee: basicData?.delivery_fee ?? 0,
      business_hours: basicData?.business_hours ?? [],
    };
    _settingsCacheAt = now;
    return _settingsCache;
  }

  _settingsCache = {
    delivery_fee: data?.delivery_fee ?? 0,
    business_hours: data?.business_hours ?? [],
    coverage_city: data?.coverage_city,
    coverage_department: data?.coverage_department,
    coverage_keywords: data?.coverage_keywords ?? [],
    coverage_require_keywords: data?.coverage_require_keywords ?? false,
  };
  _settingsCacheAt = now;
  return _settingsCache;
}

/**
 * Verifica si el restaurante está abierto según la configuración de horarios.
 * Retorna true si está abierto, false si está cerrado.
 */
function isRestaurantOpen(hours: CachedSettings['business_hours']): boolean {
  if (!hours || hours.length === 0) return true; // sin configuración = siempre abierto

  const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const now = new Date();
  // Horario Colombia (UTC-5)
  const colombiaOffset = -5 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const colombiaMinutes = ((utcMinutes + colombiaOffset) + 1440) % 1440;
  const colombiaDayIndex = Math.floor(((now.getUTCDay() * 1440 + utcMinutes + colombiaOffset) + 10080) / 1440) % 7;
  const dayName = DAYS_ES[colombiaDayIndex];

  const todayHours = hours.find(h => h.day === dayName);
  if (!todayHours) return true; // día no configurado = abierto
  if (todayHours.closed) return false;

  const [openH, openM] = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return colombiaMinutes >= openMinutes && colombiaMinutes < closeMinutes;
}

/**
 * Valida si la dirección ingresada por el cliente corresponde a la cobertura
 * del restaurante según las palabras clave configuradas.
 * Retorna null si es válida, o un mensaje de error si no lo es.
 */
function validateAddressCoverage(
  address: string,
  settings: CachedSettings
): string | null {
  // Si no hay validación activada o no hay keywords, se acepta todo
  if (!settings.coverage_require_keywords) return null;
  const keywords = settings.coverage_keywords ?? [];
  if (keywords.length === 0) return null;

  const normalizedAddress = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasKeyword = keywords.some(kw =>
    normalizedAddress.includes(kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );

  if (!hasKeyword) {
    const city = settings.coverage_city ? ` en *${settings.coverage_city}*` : '';
    const examples = keywords.slice(0, 4).join(', ');
    return [
      `⚠️ *Dirección fuera de cobertura*`,
      ``,
      `Solo realizamos domicilios${city}.`,
      `Tu dirección debe incluir una referencia como: _${examples}_${keywords.length > 4 ? '...' : ''}.`,
      ``,
      `Por favor ingresa una dirección válida o selecciona *Recoger en el local*:`,
    ].join('\n');
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cartTotal(cart: OrderItem[]) {
  return cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}

function cartSummaryText(cart: OrderItem[]) {
  return cart
    .map((i, idx) => {
      const noteStr = i.notes ? `\n   📝 _Nota: ${i.notes}_` : '';
      return `${idx + 1}. *${i.product.name}* x${i.quantity} — $${(i.unit_price * i.quantity).toLocaleString('es-CO')}${noteStr}`;
    })
    .join('\n');
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function welcomeScreen(isReturning = false): BotResponse {
  const greeting = isReturning
    ? `👋 ¡Bienvenido de nuevo a *ChefFlow*! 👏\n\n¿Qué vas a pedir hoy?`
    : `👋 ¡Bienvenido a *ChefFlow*! 🍔\n\n¿En qué te puedo ayudar hoy?`;
  return {
    text: greeting,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
        [{ text: '🛒 Mi Carrito', callback_data: 'cart' }],
        [{ text: '📦 Rastrear mi pedido', callback_data: 'track_prompt' }],
        [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
      ],
    },
  };
}

async function menuScreen(categoryId?: string): Promise<BotResponse> {
  if (!categoryId) {
    const { data, error } = await supabase.from('categories').select('id, name').eq('is_active', true).order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) return { text: '⚠️ No hay menú disponible en este momento. Intenta más tarde.' };
    
    const buttons = data.map(c => [{ text: `📁 ${c.name}`, callback_data: `cat:${c.id}` }]);
    buttons.push([{ text: '🍔 Ver todo el menú', callback_data: 'cat:all' }]);
    buttons.push([{ text: '🛒 Ver Carrito', callback_data: 'cart' }]);

    return {
      text: '🍽️ *Nuestro Menú*\n\nSelecciona una categoría:',
      reply_markup: { inline_keyboard: buttons },
    };
  } else {
    let query = supabase.from('products').select('id, name, price').eq('is_available', true);
    if (categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }
    
    const { data, error } = await query;
    if (error || !data || data.length === 0) return { text: '⚠️ Categoría vacía o sin productos disponibles.' };

    const products = data as { id: string; name: string; price: number }[];
    const buttons = products.map(p => [
      { text: `${p.name}  •  $${p.price.toLocaleString('es-CO')}`, callback_data: `product:${p.id}` },
    ]);
    buttons.push([{ text: '↩️ Volver a Categorías', callback_data: 'menu' }]);
    buttons.push([{ text: '🛒 Ver Carrito', callback_data: 'cart' }]);

    return {
      text: `🍔 *Elige tu producto*\n\nToca un producto para agregarlo a tu pedido:`,
      reply_markup: { inline_keyboard: buttons },
    };
  }
}

async function productScreen(session: BotSession, productId: string): Promise<BotResponse> {
  const { data } = await supabase.from('products').select('*').eq('id', productId).single();
  if (!data) return { text: '❌ Producto no encontrado. Vuelve al menú.' };

  session.selectedProduct = data as Product;
  session.state = 'selecting_quantity';
  const p = data as Product;
  const cartTotal = session.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const cartInfo = session.cart.length > 0
    ? `\n\n🛒 _Carrito actual: $${cartTotal.toLocaleString('es-CO')} (${session.cart.length} ${session.cart.length === 1 ? 'producto' : 'productos'})_`
    : '';

  return {
    text: `*${p.name}*\n💰 Precio: $${p.price.toLocaleString('es-CO')} c/u${cartInfo}\n\n¿Cuántas unidades deseas?`,
    reply_markup: {
      inline_keyboard: [
        [1, 2, 3].map(n => ({ text: `${n}`, callback_data: `qty:${n}` })),
        [4, 5, 6].map(n => ({ text: `${n}`, callback_data: `qty:${n}` })),
        [{ text: '➕ Otra cantidad', callback_data: 'qty_other' }],
        [{ text: '↩️ Volver al Menú', callback_data: 'menu' }],
      ],
    },
  };
}

function askItemNoteScreen(session: BotSession, qty: number): BotResponse {
  if (!session.selectedProduct) return welcomeScreen();
  session.pendingItem = { product: session.selectedProduct, quantity: qty };
  session.state = 'selecting_item_note';

  return {
    text: `Has elegido *${qty}x ${session.selectedProduct.name}*.\n\n📝 ¿Deseas agregar una instrucción especial? (Ej: *sin cebolla*, *extra salsa*).\n\nEscribe tu nota ahora, o toca el botón para omitir:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '⏭️ Omitir y agregar al carrito', callback_data: 'skip_note' }],
        [{ text: '↩️ Cancelar', callback_data: 'menu' }]
      ],
    },
  };
}

async function addToCartAndConfirm(session: BotSession, note?: string): Promise<BotResponse> {
  if (!session.pendingItem) return welcomeScreen();
  const { product, quantity } = session.pendingItem;

  const existing = session.cart.find(i => i.product.id === product.id && i.notes === note);
  if (existing) existing.quantity += quantity;
  else
    session.cart.push({
      id: Math.random().toString(36).slice(2),
      product,
      quantity,
      unit_price: product.price,
      notes: note,
    });

  session.state = 'idle';
  session.selectedProduct = undefined;
  session.pendingItem = undefined;
  const total = cartTotal(session.cart);

  return {
    text: `✅ ¡Agregado!\n*${quantity}x ${product.name}*\n\n🛒 Total del carrito: *$${total.toLocaleString('es-CO')}*`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Agregar más', callback_data: 'menu' }],
        [{ text: '🛒 Ver Carrito y Pagar', callback_data: 'cart' }],
      ],
    },
  };
}

function cartScreen(session: BotSession): BotResponse {
  if (session.cart.length === 0) {
    return {
      text: '🛒 Tu carrito está vacío.\n\n¿Qué te gustaría pedir hoy?',
      reply_markup: { inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]] },
    };
  }

  const total = cartTotal(session.cart);
  
  const buttons = session.cart.map(i => [{ text: `❌ Quitar ${i.product.name}`, callback_data: `rm:${i.id}` }]);
  buttons.push([{ text: '➕ Seguir comprando', callback_data: 'menu' }]);
  buttons.push([{ text: '💳 Proceder al Pago', callback_data: 'pay' }]);
  buttons.push([{ text: '🗑️ Vaciar todo el carrito', callback_data: 'clear_cart' }]);

  return {
    text: `🛒 *Tu Carrito*\n\n${cartSummaryText(session.cart)}\n\n💰 *TOTAL: $${total.toLocaleString('es-CO')}*`,
    reply_markup: { inline_keyboard: buttons },
  };
}

function paymentOptionsScreen(session: BotSession): BotResponse {
  if (session.cart.length === 0) return cartScreen(session);
  const total = cartTotal(session.cart);
  return {
    text: `💰 *Total a pagar: $${total.toLocaleString('es-CO')}*\n\n¿Cómo deseas pagar?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '💵 Efectivo', callback_data: 'pay_cash' }],
        [{ text: '📱 Nequi / Daviplata / Bancolombia', callback_data: 'pay_digital' }],
        [{ text: '💳 Pago Contra Entrega', callback_data: 'pay_ondelivery' }],
        [{ text: '↩️ Volver al carrito', callback_data: 'cart' }],
      ],
    },
  };
}

function cashAmountScreen(session: BotSession): BotResponse {
  session.state = 'checkout_cash_amount';
  const total = cartTotal(session.cart);
  return {
    text: `💵 *Pago en Efectivo*\n\nTotal: *$${total.toLocaleString('es-CO')}*\n\n✏️ Escribe el valor del billete con el que vas a pagar\n_(ej: 50000)_`,
    reply_markup: {
      inline_keyboard: [[{ text: '↩️ Cancelar y volver al menú', callback_data: 'menu' }]],
    },
  };
}

function handleCashAmount(session: BotSession, text: string): BotResponse {
  const amount = parseFloat(text.replace(/[.$,\s]/g, ''));
  const total = cartTotal(session.cart);

  if (isNaN(amount) || amount <= 0) {
    return { 
      text: '⚠️ Por favor ingresa un valor numérico válido (ej: 50000).',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Cancelar', callback_data: 'menu' }]] }
    };
  }
  if (amount < total) {
    return {
      text: `⚠️ El billete de *$${amount.toLocaleString('es-CO')}* no alcanza.\nEl total es *$${total.toLocaleString('es-CO')}*.\n\nIngresa un billete más grande:`,
      reply_markup: { inline_keyboard: [[{ text: '↩️ Cancelar', callback_data: 'menu' }]] }
    };
  }

  session.changeAmount = amount - total;
  session.paymentMethod = 'cash';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `✅ ¡Listo! Le devolveremos *$${session.changeAmount.toLocaleString('es-CO')}* de cambio.\n\n📍 ¿A dónde enviamos tu pedido?\n\nEscribe tu dirección o toca el botón si vas a recoger:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}

function digitalPaymentScreen(session: BotSession): BotResponse {
  session.paymentMethod = 'transfer';
  session.paymentStatus = 'pending_verification';
  session.state = 'awaiting_payment_receipt';

  return {
    text: `📱 *Pago Digital*\n\n🏦 *Nequi / Daviplata:* 300 123 4567\n💳 *Bancolombia (Ahorros):* 123-456789-00\n\n📸 Realiza la transferencia y **envíame una foto del comprobante** por aquí mismo para continuar.\n\n_(O toca el botón para cancelar)_`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}

function handlePaymentReceipt(session: BotSession, isPhoto: boolean, photoId?: string): BotResponse {
  if (!isPhoto) {
    return {
      text: '⚠️ *No detectamos una imagen.*\nPor favor, asegúrate de enviar una **foto** o **captura de pantalla** del comprobante para poder validar tu pago.',
      reply_markup: {
        inline_keyboard: [[{ text: '↩️ Cambiar método de pago', callback_data: 'pay' }]],
      },
    };
  }

  session.paymentReceiptId = photoId;
  session.state = 'checkout_address';

  return {
    text: `✅ *¡Comprobante recibido!*\n\n📍 ¿A dónde enviamos tu pedido?\n\nEscribe tu dirección o toca el botón si vas a recoger:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}

function onDeliveryScreen(session: BotSession): BotResponse {
  session.paymentMethod = 'ondelivery';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `💳 *Pago Contra Entrega*\n\nPodrás pagar en efectivo o con datáfono cuando recibas tu pedido.\n\n📍 ¿A dónde enviamos tu pedido?\n\nEscribe tu dirección o toca el botón si vas a recoger:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}

async function getOrCreateCustomer(session: BotSession): Promise<string> {
  const telegramId = session.chatId.toString();
  
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('telegram_chat_id', telegramId)
    .limit(1)
    .single();

  if (existing) return existing.id;

  const newId = crypto.randomUUID();
  await supabase.from('customers').insert([{
    id: newId,
    tenant_id: TENANT_ID,
    name: session.customerName || 'Cliente Telegram',
    telegram_chat_id: telegramId,
    phone: 'Por registrar',
    segment: 'new',
    total_spent: 0,
    order_count: 0
  }]);

  return newId;
}

async function confirmOrderScreen(session: BotSession, address: string): Promise<BotResponse> {
  if (session.cart.length === 0) return welcomeScreen();

  const customerId = await getOrCreateCustomer(session);
  const total = cartTotal(session.cart);
  const orderId = crypto.randomUUID();
  const shortId = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  
  let notes = `[ID: ${shortId}] [Cliente: ${session.customerName}]`;
  if (session.paymentMethod === 'cash' && session.changeAmount !== undefined) {
    notes += ` | [EFECTIVO] Devuelta: $${session.changeAmount.toLocaleString('es-CO')}`;
  } else if (session.paymentMethod === 'transfer') {
    notes += ` | [TRANSFERENCIA] Pendiente de validación`;
    if (session.paymentReceiptId) notes += ` | [COMPROBANTE: ${session.paymentReceiptId}]`;
  } else if (session.paymentMethod === 'ondelivery') {
    notes += ` | [PAGO CONTRA ENTREGA] Llevar datáfono/cambio`;
  }

  // 1. Obtener configuración del tenant (delivery_fee, etc.)
  const tenantSettings = await getTenantSettings();
  const deliveryFee = /recoger|mesa|pickup/i.test(address) ? 0 : tenantSettings.delivery_fee;
  const orderType: 'delivery' | 'pickup' | 'dine_in' = /recoger|mesa|pickup/i.test(address) ? 'dine_in' : 'delivery';
  const finalTotal = total + deliveryFee;

  // 2. Crear la orden
  const { error: orderError } = await supabase.from('orders').insert([
    {
      id: orderId,
      tenant_id: TENANT_ID,
      branch_id: 'b0000000-0000-4000-8000-000000000001',
      customer_id: customerId,
      type: orderType,
      status: 'pending',
      payment_method: session.paymentMethod || 'cash',
      subtotal: total,
      total: finalTotal,
      delivery_fee: deliveryFee,
      tips: 0,
      delivery_address: address,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    },
  ]);

  if (orderError) {
    console.error('Error Supabase Order:', orderError);
    return { text: `❌ Error al guardar el pedido: ${orderError.message}` };
  }

  // 2. Crear los items de la orden
  if (session.cart.length > 0) {
    const itemsData = session.cart.map(item => ({
      order_id: orderId,
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      notes: item.notes || null,
    }));
    
    const { error: itemsError } = await supabase.from('order_items').insert(itemsData);
    if (itemsError) {
      console.error('Error Supabase Order Items:', itemsError);
      // No cancelamos todo, pero lo registramos
    }
  }

  // Save cart snapshot BEFORE clearing session
  const cartSnapshot = [...session.cart];

  // Reset session
  session.cart = [];
  session.state = 'idle';
  session.paymentMethod = undefined;
  session.paymentStatus = undefined;
  session.changeAmount = undefined;
  session.paymentReceiptId = undefined;

  return {
    text: [
      `🎉 *¡Pedido Confirmado!*`,
      ``,
      `📋 Código: *${shortId}*`,
      `📍 Dirección: ${address}`,
      ``,
      `🛒 *Resumen de tu pedido:*`,
      cartSummaryText(cartSnapshot),
      ``,
      deliveryFee > 0 ? `🛵 Domicilio: *$${deliveryFee.toLocaleString('es-CO')}*` : `🏪 Recoges en el local (sin cargo de domicilio)`,
      `💰 *TOTAL: $${finalTotal.toLocaleString('es-CO')}*`,
      ``,
      `⏱️ Tiempo estimado: *25–40 minutos*`,
      ``,
      `¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Rastrear mi pedido', callback_data: 'track_prompt' }],
        [{ text: '❌ Cancelar mi pedido', callback_data: `cancel_order:${orderId}` }],
        [{ text: '🏠 Hacer otro pedido', callback_data: 'menu' }]
      ],
    },
  };
}

async function promptTrackOrderScreen(session: BotSession): Promise<BotResponse> {
  session.state = 'idle'; // Will only go to tracking_order if no orders found

  // Buscar pedidos del cliente por su telegram_chat_id
  const telegramId = session.chatId.toString();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('telegram_chat_id', telegramId)
    .limit(1)
    .single();

  if (customer) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabase
      .from('orders')
      .select('id, notes, status, created_at')
      .eq('customer_id', customer.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);

    if (orders && orders.length > 0) {
      const statusMap: Record<string, string> = {
        pending: '⏳', confirmed: '✅', preparing: '🍳',
        ready: '🛍️', shipping: '🛵', delivered: '🎉', cancelled: '❌'
      };

      const buttons = orders.map(o => {
        const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0,6).toUpperCase()}`;
        const icon = statusMap[o.status] || '📦';
        return [{ text: `${icon} ${shortId}`, callback_data: `track:${shortId}` }];
      });
      buttons.push([{ text: '↩️ Volver al menú', callback_data: 'menu' }]);

      return {
        text: `📦 *Tus pedidos recientes*\n\nSelecciona uno para ver su estado:`,
        reply_markup: { inline_keyboard: buttons },
      };
    }
  }

  // Fallback: pedir código manualmente si no hay pedidos en el historial
  session.state = 'tracking_order';
  return {
    text: '📦 *Rastrear Pedido*\n\nNo encontramos pedidos anteriores con tu cuenta.\n\n✏️ Escribe el código de tu pedido (Ej: *T-A1B2*):',
    reply_markup: {
      inline_keyboard: [[{ text: '↩️ Volver al menú', callback_data: 'menu' }]],
    },
  };
}

async function handleTrackOrder(session: BotSession, code: string): Promise<BotResponse> {
  session.state = 'idle';
  const cleanCode = code.trim().toUpperCase();
  
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, created_at')
    .ilike('notes', `%[ID: ${cleanCode}]%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return {
      text: `❌ No encontramos ningún pedido con el código *${cleanCode}*.\nPor favor verifica e intenta de nuevo.`,
      reply_markup: { inline_keyboard: [[{ text: '📦 Intentar de nuevo', callback_data: 'track_prompt' }], [{ text: '🏠 Menú principal', callback_data: 'menu' }]] }
    };
  }

  const order = data[0];
  const statusMap: Record<string, string> = {
    'pending': '⏳ Pendiente (Esperando confirmación)',
    'confirmed': '✅ Confirmado (En cola)',
    'preparing': '🍳 En preparación (Cocinando)',
    'ready': '🛍️ Listo para entregar',
    'shipping': '🛵 En camino (Repartidor asignado)',
    'delivered': '🎉 Entregado',
    'cancelled': '❌ Cancelado'
  };

  const statusText = statusMap[order.status] || order.status;

  const buttons = [[{ text: '🔄 Actualizar estado', callback_data: `track:${cleanCode}` }]];
  if (['pending', 'confirmed'].includes(order.status)) {
    buttons.push([{ text: `❌ Cancelar pedido`, callback_data: `cancel_order:${order.id}` }]);
  }
  buttons.push([{ text: '🏠 Menú principal', callback_data: 'menu' }]);

  return {
    text: `📦 *Estado de tu pedido (${cleanCode})*\n\nEstado actual:\n👉 *${statusText}*`,
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

function askCancelConfirmScreen(session: BotSession, orderId: string): BotResponse {
  session.pendingCancelOrderId = orderId;
  session.state = 'awaiting_cancel_confirm';
  return {
    text: '⚠️ *¿Estás seguro de que deseas cancelar tu pedido?*\n\nEsta acción no se puede deshacer.',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Sí, cancelar mi pedido', callback_data: 'confirm_cancel' }],
        [{ text: '↩️ No, mantener mi pedido', callback_data: 'abort_cancel' }],
      ],
    },
  };
}

async function executeCancelOrder(session: BotSession): Promise<BotResponse> {
  session.state = 'idle';
  const orderId = session.pendingCancelOrderId;
  session.pendingCancelOrderId = undefined;
  if (!orderId) return welcomeScreen();

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: session.chatId.toString() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      return { 
        text: `❌ No se pudo cancelar: ${err.error || 'Error'}\n\nSi necesitas ayuda, contacta al encargado.`, 
        reply_markup: { 
          inline_keyboard: [
            [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
            [{ text: '🏠 Volver al menú', callback_data: 'menu' }]
          ] 
        } 
      };
    }
    const data = await res.json();
    return {
      text: `✅ *Pedido ${data.shortId || ''} cancelado.*\n\nSi fue un error, contáctanos.`,
      reply_markup: { inline_keyboard: [[{ text: '🏠 Volver al menú', callback_data: 'menu' }]] },
    };
  } catch (e) {
    return { text: '❌ Error de conexión al cancelar. Intenta de nuevo.', reply_markup: { inline_keyboard: [[{ text: '🏠 Menú', callback_data: 'menu' }]] } };
  }
}

function contactManagerScreen(session: BotSession): BotResponse {
  session.state = 'contacting_manager';
  return {
    text: '🙋 *Contactar al Encargado*\n\nEscribe a continuación tu duda, queja o sugerencia. Se la enviaremos directamente al administrador y nos pondremos en contacto contigo si es necesario.\n\n_(O toca el botón para cancelar)_',
    reply_markup: {
      inline_keyboard: [[{ text: '↩️ Cancelar', callback_data: 'menu' }]]
    }
  };
}

async function handleContactManager(session: BotSession, text: string): Promise<BotResponse> {
  session.state = 'idle';
  
  const adminId = process.env.ADMIN_CHAT_ID;
  if (adminId) {
    try {
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
      await bot.telegram.sendMessage(adminId, `📩 *Nuevo mensaje de cliente*\n\n👤 *Cliente:* ${session.customerName} (ID: ${session.chatId})\n💬 *Mensaje:* ${text}`, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Failed to send to admin', e);
    }
  } else {
    console.warn('Mensaje recibido para encargado, pero ADMIN_CHAT_ID no está configurado en las variables de entorno:', text);
  }

  return {
    text: '✅ *¡Mensaje enviado!*\n\nEl encargado ha recibido tu mensaje. Muchas gracias por escribirnos.',
    reply_markup: {
      inline_keyboard: [[{ text: '🏠 Volver al menú', callback_data: 'menu' }]]
    }
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function processMessage(
  chatId: number,
  text: string,
  username: string,
  extra?: { isPhoto: boolean; photoId?: string }
): Promise<BotResponse> {
  if (text.trim() === '/start') {
    const freshSession: BotSession = { chatId, state: 'idle', cart: [], customerName: username };
    await saveSession(freshSession);
    return welcomeScreen();
  }

  const session = await getSession(chatId, username);
  const response = await handleProcessMessage(session, text, extra);
  await saveSession(session);
  return response;
}

async function handleProcessMessage(
  session: BotSession,
  text: string,
  extra?: { isPhoto: boolean; photoId?: string }
): Promise<BotResponse> {

  // Handle free-text states
  if (session.state === 'selecting_quantity') {
    const qty = parseInt(text.trim());
    if (!isNaN(qty) && qty >= 1 && qty <= 20) return askItemNoteScreen(session, qty);
    return { text: '⚠️ Ingresa un número entre 1 y 20.' };
  }

  if (session.state === 'selecting_item_note') {
    return addToCartAndConfirm(session, text.trim());
  }

  if (session.state === 'contacting_manager') {
    return handleContactManager(session, text.trim());
  }

  if (session.state === 'awaiting_cancel_confirm') {
    return { text: '👆 Por favor, usa los botones de arriba para confirmar o abortar la cancelación.' };
  }

  if (session.state === 'awaiting_payment_receipt') {
    return handlePaymentReceipt(session, extra?.isPhoto || false, extra?.photoId);
  }

  if (session.state === 'tracking_order') {
    return handleTrackOrder(session, text.trim());
  }

  if (session.state === 'checkout_cash_amount') {
    return handleCashAmount(session, text.trim());
  }

  if (session.state === 'checkout_address') {
    const address = text.trim();
    // Solo validar cobertura si NO es para recoger
    if (!/recoger|mesa|pickup/i.test(address)) {
      const tenantSettings = await getTenantSettings();
      const coverageError = validateAddressCoverage(address, tenantSettings);
      if (coverageError) {
        return {
          text: coverageError,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
              [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
            ],
          },
        };
      }
    }
    return confirmOrderScreen(session, address);
  }

  // Verificar horario de atención antes de cualquier interacción de pedido
  const tenantSettings = await getTenantSettings();
  if (!isRestaurantOpen(tenantSettings.business_hours)) {
    const city = tenantSettings.coverage_city ? ` en ${tenantSettings.coverage_city}` : '';
    return {
      text: `🕐 *Restaurante Cerrado*\n\nLo sentimos, en este momento no estamos atendiendo${city}.\n\nPuedes consultar nuestros horarios o dejar tu mensaje al encargado.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
          [{ text: '🍽️ Ver Menú (para explorar)', callback_data: 'menu' }],
        ],
      },
    };
  }

  // Default
  return welcomeScreen();
}

export async function processCallback(
  chatId: number,
  callbackData: string,
  username: string
): Promise<BotResponse> {
  const session = await getSession(chatId, username);
  const response = await handleProcessCallback(session, callbackData);
  await saveSession(session);
  return response;
}

async function handleProcessCallback(
  session: BotSession,
  callbackData: string
): Promise<BotResponse> {

  if (callbackData.startsWith('cancel_order:')) {
    const orderId = callbackData.replace('cancel_order:', '');
    return askCancelConfirmScreen(session, orderId);
  }
  if (callbackData === 'confirm_cancel') {
    return executeCancelOrder(session);
  }
  if (callbackData === 'abort_cancel') {
    session.pendingCancelOrderId = undefined;
    session.state = 'idle';
    return welcomeScreen();
  }

  if (callbackData === 'menu') return menuScreen();
  if (callbackData === 'cart') return cartScreen(session);
  if (callbackData === 'pay') return paymentOptionsScreen(session);
  if (callbackData === 'pay_cash') return cashAmountScreen(session);
  if (callbackData === 'pay_digital') return digitalPaymentScreen(session);
  if (callbackData === 'pay_ondelivery') return onDeliveryScreen(session);
  if (callbackData === 'recoger') return confirmOrderScreen(session, 'Para Recoger en el local');
  if (callbackData === 'clear_cart') {
    session.cart = [];
    session.state = 'idle';
    return { text: '🗑️ Carrito vaciado.', reply_markup: { inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]] } };
  }
  if (callbackData.startsWith('rm:')) {
    const rmId = callbackData.replace('rm:', '');
    session.cart = session.cart.filter(i => i.id !== rmId);
    return cartScreen(session);
  }
  if (callbackData.startsWith('cat:')) {
    return menuScreen(callbackData.replace('cat:', ''));
  }
  if (callbackData === 'track_prompt') return promptTrackOrderScreen(session);
  if (callbackData === 'contact_manager') return contactManagerScreen(session);
  if (callbackData.startsWith('track:')) return handleTrackOrder(session, callbackData.replace('track:', ''));
  if (callbackData === 'skip_note') return addToCartAndConfirm(session);
  
  if (callbackData.startsWith('product:')) {
    return productScreen(session, callbackData.replace('product:', ''));
  }
  if (callbackData === 'qty_other') {
    return { text: '⌨️ Por favor, escribe en el chat el número exacto de unidades que deseas (Ej: 8):' };
  }
  if (callbackData.startsWith('qty:')) {
    return askItemNoteScreen(session, parseInt(callbackData.replace('qty:', '')));
  }

  return welcomeScreen();
}
