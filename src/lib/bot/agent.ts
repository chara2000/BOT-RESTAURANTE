import { createClient } from '@supabase/supabase-js';
import { Telegraf } from 'telegraf';
import type { OrderItem, Product, AdditionItem } from '@/types';
import { validateQuantity, validateAmount, validateAddress, validateNote, normalizeInput, normalizeAmount } from '@/lib/bot/validators/InputValidator';
import { validatePaymentProof } from '@/lib/bot/validators/PaymentProofValidator';
import { sanitizeNote } from '@/lib/bot/guards/MessageGuard';

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
  | 'awaiting_payment_receipt'
  | 'awaiting_rider_rating';

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
  location?: { latitude: number; longitude: number };
  pendingRatingOrderId?: string; // ID del pedido que el cliente va a calificar
  pendingRiderName?: string;     // Nombre del repartidor que va a calificar
  lastActivityTimestamp?: number; // Marca de tiempo de la última interacción
  reminder1Sent?: boolean;       // Recordatorio intermedio (3.5 - 6 min)
  reminder2Sent?: boolean;       // Recordatorio de advertencia (7 - 9 min)
  tenantId?: string;
}

export interface BotResponse {
  text: string;
  reply_markup?: object;
  image_url?: string;
}

// ─── Session Store (keyed by tenantId:chatId for multi-tenant isolation) ────────────────────

// Sessions: key = `${tenantId}:${chatId}`
const globalSessions = ((globalThis as any).botSessionsV2 as Record<string, BotSession>) || {};
(globalThis as any).botSessionsV2 = globalSessions;

function sessionKey(tenantId: string, chatId: number): string {
  return `${tenantId}:${chatId}`;
}

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 Minutos

async function getSession(chatId: number, username: string, tenantId: string): Promise<BotSession> {
  const key = sessionKey(tenantId, chatId);
  let session: BotSession | null = null;

  // 1. Usar memoria global si existe
  if (globalSessions[key]) {
    session = globalSessions[key];
    session.customerName = username || session.customerName;
  } else {
    // 2. Intentar leer de chat_messages
    try {
      const { data: legacy } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('content', 'SESSION_STATE')
        .eq('tenant_id', tenantId)
        .eq('metadata->>chatId', chatId.toString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (legacy?.metadata) {
        session = legacy.metadata as BotSession;
        session.customerName = username || session.customerName;
        globalSessions[key] = session;
      }
    } catch (e) {
      // Ignorar si no existe registro
    }
  }

  const now = Date.now();

  if (!session) {
    session = {
      chatId,
      state: 'idle',
      cart: [],
      customerName: username,
      lastActivityTimestamp: now,
      tenantId,
      reminder1Sent: false,
      reminder2Sent: false,
    };
    globalSessions[key] = session;
    return session;
  }

  // 3. Comprobar si la sesión previa expiró por inactividad (> 10 minutos)
  if (session.lastActivityTimestamp && (now - session.lastActivityTimestamp > INACTIVITY_TIMEOUT_MS)) {
    const hadActiveProcess = session.state !== 'idle' || (session.cart && session.cart.length > 0);
    session.state = 'idle';
    session.cart = [];
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    session.paymentMethod = undefined;
    session.changeAmount = undefined;
    session.pendingCancelOrderId = undefined;
    session.reminder1Sent = false;
    session.reminder2Sent = false;
    if (hadActiveProcess) {
      (session as any).wasExpiredDueToInactivity = true;
    }
  }

  session.lastActivityTimestamp = now;
  session.tenantId = tenantId;
  return session;
}

async function saveSession(session: BotSession, tenantId: string): Promise<void> {
  const key = sessionKey(tenantId, session.chatId);
  session.tenantId = tenantId;
  if (!session.lastActivityTimestamp) {
    session.lastActivityTimestamp = Date.now();
  }
  // 1. Guardar en memoria siempre
  globalSessions[key] = session;

  // 2. Persistir en chat_messages en segundo plano
  try {
    await supabase.from('chat_messages').insert([{
      tenant_id: tenantId,
      direction: 'outbound',
      content: 'SESSION_STATE',
      metadata: session as any,
    }]);
  } catch (err) {
    console.warn('Failed to save session to chat_messages:', err);
  }
}

function decodePaymentAccounts(phoneString?: string): { nequi_number: string; bancolombia_number: string; bancolombia_type: string } {
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

// ─── Tenant Settings ──────────────────────────────────────────────────────────

interface CachedSettings {
  delivery_fee: number;
  business_hours: { day: string; open: string; close: string; closed: boolean }[];
  additions?: AdditionItem[];
  coverage_city?: string;
  coverage_department?: string;
  coverage_keywords?: string[];
  coverage_require_keywords?: boolean;
  restaurant_lat?: number;
  restaurant_lng?: number;
  nequi_number?: string;
  bancolombia_number?: string;
  bancolombia_type?: string;
}

// Per-tenant settings cache: key = tenantId
const _settingsCacheMap = new Map<string, { data: CachedSettings; at: number }>();
const SETTINGS_TTL_MS = 5_000; // refresca cada 5 segundos para reflejar adiciones y ajustes al instante

async function getTenantSettings(tenantId: string): Promise<CachedSettings> {
  const now = Date.now();
  const cached = _settingsCacheMap.get(tenantId);
  if (cached && now - cached.at < SETTINGS_TTL_MS) {
    return cached.data;
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('delivery_fee, business_hours, coverage_city, coverage_department, coverage_keywords, coverage_require_keywords, restaurant_lat, restaurant_lng, whatsapp_phone, additions')
    .eq('tenant_id', tenantId)
    .single();

  if (error) {
    console.warn('Failed to query tenant_settings:', error.message);
    return { delivery_fee: 5000, business_hours: [] };
  }

  const accounts = decodePaymentAccounts(data?.whatsapp_phone);

  const settings: CachedSettings = {
    delivery_fee: data?.delivery_fee ?? 5000,
    business_hours: data?.business_hours ?? [],
    additions: (data as any)?.additions,
    coverage_city: data?.coverage_city,
    coverage_department: data?.coverage_department,
    coverage_keywords: data?.coverage_keywords ?? [],
    coverage_require_keywords: data?.coverage_require_keywords ?? false,
    restaurant_lat: data?.restaurant_lat != null ? Number(data.restaurant_lat) : undefined,
    restaurant_lng: data?.restaurant_lng != null ? Number(data.restaurant_lng) : undefined,
    nequi_number: accounts.nequi_number,
    bancolombia_number: accounts.bancolombia_number,
    bancolombia_type: accounts.bancolombia_type,
  };
  _settingsCacheMap.set(tenantId, { data: settings, at: now });
  return settings;
}


/**
 * Obtiene la fecha y hora actual en la zona horaria de Colombia (UTC-5).
 * Devuelve { dayName, minutesOfDay } para comparar con los horarios.
 */
function getColombiaTime(): { dayName: string; minutesOfDay: number } {
  // Colombia siempre UTC-5, sin cambio de horario de verano
  const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
  const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const nowUtc = Date.now();
  const colombiaMs = nowUtc + COLOMBIA_OFFSET_MS;
  const dt = new Date(colombiaMs);

  const dayName = DAYS_ES[dt.getUTCDay()];
  const minutesOfDay = dt.getUTCHours() * 60 + dt.getUTCMinutes();

  return { dayName, minutesOfDay };
}

/**
 * Verifica si el restaurante está abierto según la configuración de horarios.
 * Retorna true si está abierto, false si está cerrado.
 */
function isRestaurantOpen(hours: CachedSettings['business_hours']): boolean {
  if (!hours || hours.length === 0) return true; // sin configuración = siempre abierto

  const { dayName, minutesOfDay } = getColombiaTime();

  const todayHours = hours.find(h => normalize(h.day) === normalize(dayName));
  if (!todayHours) return true; // día no configurado = abierto
  if (todayHours.closed) return false;

  // Validar que open y close estén bien definidos
  if (!todayHours.open || !todayHours.close) return true;

  const [openH, openM] = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Soporte para horarios que cruzan medianoche (ej: 22:00 - 02:00)
  if (closeMinutes < openMinutes) {
    return minutesOfDay >= openMinutes || minutesOfDay < closeMinutes;
  }

  return minutesOfDay >= openMinutes && minutesOfDay < closeMinutes;
}

/**
 * Formatea los horarios de atención para mostrar al cliente cuando el local está cerrado.
 */
function formatBusinessHours(hours: CachedSettings['business_hours']): string {
  if (!hours || hours.length === 0) return 'Sin horarios configurados.';
  
  return hours.map(h => {
    if (h.closed) {
      return `• *${h.day}*: Cerrado`;
    }
    return `• *${h.day}*: ${h.open} – ${h.close}`;
  }).join('\n');
}

/** Normaliza texto: minúsculas + sin tildes */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .trim();
}

/**
 * Valida si la dirección ingresada por el cliente corresponde a la cobertura
 * del restaurante. Verifica palabras clave de nomenclatura (calle, cra, etc.).
 * Retorna null si es válida, o un mensaje de error si no lo es.
 */
function validateAddressCoverage(
  address: string,
  settings: CachedSettings
): string | null {
  const addr = normalize(address);
  const city = settings.coverage_city ? normalize(settings.coverage_city) : '';
  const dept = settings.coverage_department ? normalize(settings.coverage_department) : '';

  const keywords = (settings.coverage_keywords ?? []).filter(Boolean);
  const hasKeyword = keywords.length > 0 ? keywords.some(kw => addr.includes(normalize(kw))) : false;
  const hasCity = city ? addr.includes(city) : false;

  // Si tiene palabras clave (ej: "cra", "calle") pero no menciona la ciudad,
  // la aceptamos automáticamente completando internamente la ciudad para que el mapa funcione.
  if (hasKeyword && !hasCity && settings.coverage_city) {
    // Retornamos null (es válida), y el bot guardará la dirección más adelante concatenada
    return null; 
  }

  // Si no tiene la ciudad Y tampoco tiene una palabra clave de nomenclatura válida, se rechaza
  if (city && !hasCity && !hasKeyword) {
    const cityName = settings.coverage_city ? `*${settings.coverage_city}*` : '';
    const deptName = settings.coverage_department ? `, ${settings.coverage_department}` : '';
    const examples = keywords.slice(0, 4).join(', ');
    return [
      `⚠️ *Dirección incompleta o no reconocida*`,
      ``,
      `Solo realizamos entregas en el municipio de ${cityName}${deptName}.`,
      `Asegúrate de escribir la calle/carrera o incluir el nombre del municipio:`,
      `_Ej: Cra 19 #18-44 Barrio Centro, ${settings.coverage_city}_`,
    ].join('\n');
  }

  // Si tiene activa la validación estricta de palabras clave pero no cumple ninguna regla
  if (settings.coverage_require_keywords && keywords.length > 0 && !hasKeyword && !hasCity) {
    const cityName = settings.coverage_city ? `*${settings.coverage_city}*` : 'nuestra ciudad';
    const deptName = settings.coverage_department ? `, ${settings.coverage_department}` : '';
    const examples = keywords.slice(0, 4).join(', ');
    return [
      `⚠️ *Dirección no reconocida*`,
      ``,
      `Solo realizamos domicilios en ${cityName}${deptName}.`,
      `Tu dirección debe incluir la nomenclatura de la ciudad:`,
      `_Ej: ${examples}${keywords.length > 4 ? '...' : ''}_`,
      ``,
      `✏️ Escribe tu dirección completa (Ej: *Cra 19 #18-44 Barrio Centro*) o selecciona recoger en el local:`,
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
      const noteStr = i.notes ? `\n   ➕ _Adición/Nota: ${i.notes}_` : '';
      return `${idx + 1}. *${i.product.name}* x${i.quantity} — $${(i.unit_price * i.quantity).toLocaleString('es-CO')}${noteStr}`;
    })
    .join('\n');
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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

async function menuScreen(tenantId: string, categoryId?: string): Promise<BotResponse> {
  if (!categoryId) {
    const { data, error } = await supabase.from('categories').select('id, name').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) return { text: '⚠️ No hay menú disponible en este momento. Intenta más tarde.' };
    
    const buttons = data.map(c => [{ text: `📁 ${c.name}`, callback_data: `cat:${c.id}` }]);
    buttons.push([{ text: '🍔 Ver todo el menú', callback_data: 'cat:all' }]);
    buttons.push([{ text: '🛒 Ver Carrito', callback_data: 'cart' }]);

    // Obtener una imagen por defecto de algún producto disponible como banner del menú
    let defaultImage: string | undefined;
    try {
      const { data: prodWithImg } = await supabase
        .from('products')
        .select('image_url')
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .not('image_url', 'is', null)
        .limit(1);
      if (prodWithImg && prodWithImg.length > 0) {
        defaultImage = prodWithImg[0].image_url;
      }
    } catch (e) {
      console.warn('Failed to query default menu image:', e);
    }

    return {
      text: '🍽️ *Nuestro Menú*\n\nSelecciona una categoría:',
      image_url: defaultImage || undefined,
      reply_markup: { inline_keyboard: buttons },
    };
  } else {
    let query = supabase.from('products').select('id, name, price, image_url').eq('is_available', true).eq('tenant_id', tenantId);
    if (categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }
    
    const { data, error } = await query;
    if (error || !data || data.length === 0) return { text: '⚠️ Categoría vacía o sin productos disponibles.' };

    const products = data as Product[];
    const buttons = products.map(p => [
      { text: `${p.name}  •  $${p.price.toLocaleString('es-CO')}`, callback_data: `product:${p.id}` },
    ]);
    buttons.push([{ text: '↩️ Volver a Categorías', callback_data: 'menu' }]);
    buttons.push([{ text: '🛒 Ver Carrito', callback_data: 'cart' }]);

    const categoryImage = products.find(p => p.image_url)?.image_url;

    return {
      text: `🍔 *Elige tu producto*\n\nToca un producto para agregarlo a tu pedido:`,
      image_url: categoryImage || undefined,
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
    image_url: p.image_url || undefined,
    reply_markup: {
      inline_keyboard: [
        [1, 2, 3].map(n => ({ text: `${n}`, callback_data: `qty:${n}:${p.id}` })),
        [4, 5, 6].map(n => ({ text: `${n}`, callback_data: `qty:${n}:${p.id}` })),
        [{ text: '➕ Otra cantidad', callback_data: `qty_other:${p.id}` }],
        [{ text: '↩️ Volver al Menú', callback_data: 'menu' }],
      ],
    },
  };
}

async function askItemNoteScreen(session: BotSession, qty: number, productId?: string, tenantId?: string): Promise<BotResponse> {
  if (productId) {
    const { data } = await supabase.from('products').select('*').eq('id', productId).single();
    if (data) session.selectedProduct = data as Product;
  }
  if (!session.selectedProduct) return welcomeScreen();
  session.pendingItem = { product: session.selectedProduct, quantity: qty };
  session.state = 'selecting_item_note';

  const p = session.selectedProduct;

  return {
    text: `Has elegido *${qty}x ${p.name}*.\n\n📝 *¿Deseas agregar una instrucción especial?* (Ej: sin cebolla, extra salsa).\n\nEscribe tu nota ahora, o toca el botón para omitir:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Agregar adición', callback_data: `show_additions:${qty}:${p.id}` }],
        [{ text: '⏭️ Omitir y agregar al carrito', callback_data: `skip_note:${qty}:${p.id}` }],
        [{ text: '↩️ Cancelar', callback_data: 'menu' }],
      ],
    },
  };
}

async function showAdditionsScreen(session: BotSession, qty: number, productId: string, tenantId: string): Promise<BotResponse> {
  if (productId && !session.selectedProduct) {
    const { data } = await supabase.from('products').select('*').eq('id', productId).single();
    if (data) session.selectedProduct = data as Product;
  }
  const p = session.selectedProduct;
  const productName = p?.name || 'este platillo';

  const settings = await getTenantSettings(tenantId);
  const additionsList: AdditionItem[] = (settings.additions || []).filter((a: AdditionItem) => a.is_available !== false);

  if (additionsList.length === 0) {
    return {
      text: `🧀 *No hay adiciones configuradas* para *${productName}* en este restaurante.\n\n¿Deseas agregar el producto directamente al carrito?`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Sí, agregar al carrito', callback_data: `skip_note:${qty}:${productId}` }],
          [{ text: '↩️ Volver', callback_data: `ask_note:${qty}:${productId}` }],
        ],
      },
    };
  }

  const buttons: { text: string; callback_data: string }[][] = [];
  
  for (let i = 0; i < additionsList.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    const a1 = additionsList[i];
    row.push({
      text: `${a1.name} (+$${a1.price.toLocaleString('es-CO')})`,
      callback_data: `add_ad:${a1.id}:${qty}`,
    });
    if (additionsList[i + 1]) {
      const a2 = additionsList[i + 1];
      row.push({
        text: `${a2.name} (+$${a2.price.toLocaleString('es-CO')})`,
        callback_data: `add_ad:${a2.id}:${qty}`,
      });
    }
    buttons.push(row);
  }

  buttons.push([{ text: '⏭️ Omitir adiciones y agregar', callback_data: `skip_note:${qty}:${productId}` }]);
  buttons.push([{ text: '↩️ Volver', callback_data: `ask_note:${qty}:${productId}` }]);

  return {
    text: `🧀 *Adiciones disponibles para:* ${qty}x ${productName}\n\nSelecciona una o más adiciones:`,
    reply_markup: { inline_keyboard: buttons },
  };
}

async function addToCartAndConfirm(
  session: BotSession,
  note?: string,
  qtyFallback?: number,
  prodIdFallback?: string,
  extraPrice: number = 0
): Promise<BotResponse> {
  if (!session.pendingItem && prodIdFallback && qtyFallback) {
    const { data } = await supabase.from('products').select('*').eq('id', prodIdFallback).single();
    if (data) session.pendingItem = { product: data as Product, quantity: qtyFallback };
  }
  if (!session.pendingItem) return welcomeScreen();
  const { product, quantity } = session.pendingItem;

  const itemPrice = product.price + extraPrice;
  const existing = session.cart.find(i => i.product.id === product.id && i.notes === note && i.unit_price === itemPrice);
  if (existing) existing.quantity += quantity;
  else
    session.cart.push({
      id: Math.random().toString(36).slice(2),
      product,
      quantity,
      unit_price: itemPrice,
      notes: note,
    });

  session.state = 'idle';
  session.selectedProduct = undefined;
  session.pendingItem = undefined;
  const total = cartTotal(session.cart);

  return {
    text: `✅ ¡Agregado!\n*${quantity}x ${product.name}*${note ? `\n📝 _Nota: ${note}_` : ''}\n\n🛒 Total del carrito: *$${total.toLocaleString('es-CO')}*`,
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

  const subtotal = cartTotal(session.cart);
  const deliveryFee = 5000;
  const finalTotal = subtotal + deliveryFee;
  
  const buttons = session.cart.map(i => [{ text: `❌ Quitar ${i.product.name}`, callback_data: `rm:${i.id}` }]);
  buttons.push([{ text: '➕ Seguir comprando', callback_data: 'menu' }]);
  buttons.push([{ text: '💳 Proceder al Pago', callback_data: 'pay' }]);
  buttons.push([{ text: '🗑️ Vaciar todo el carrito', callback_data: 'clear_cart' }]);

  return {
    text: `🛒 *Tu Carrito*\n\n${cartSummaryText(session.cart)}\n\n📦 *Productos:* $${subtotal.toLocaleString('es-CO')}\n🛵 *Domicilio estimado:* $${deliveryFee.toLocaleString('es-CO')}\n💰 *TOTAL FINAL: $${finalTotal.toLocaleString('es-CO')}*`,
    reply_markup: { inline_keyboard: buttons },
  };
}

async function paymentOptionsScreen(session: BotSession, tenantId: string): Promise<BotResponse> {
  if (session.cart.length === 0) return cartScreen(session);
  const settings = await getTenantSettings(tenantId);
  const subtotal = cartTotal(session.cart);
  const deliveryFee = settings.delivery_fee ?? 5000;
  const finalTotal = subtotal + deliveryFee;

  return {
    text: `🛒 *Resumen del Pedido*\n\n📦 Productos: *$${subtotal.toLocaleString('es-CO')}*\n🛵 Domicilio: *$${deliveryFee.toLocaleString('es-CO')}*\n💰 *Total Final: $${finalTotal.toLocaleString('es-CO')}*\n\n¿Confirmas tu pedido por *$${finalTotal.toLocaleString('es-CO')}*?\n\nSelecciona tu método de pago:`,
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

async function cashAmountScreen(session: BotSession, tenantId: string): Promise<BotResponse> {
  session.state = 'checkout_cash_amount';
  const settings = await getTenantSettings(tenantId);
  const subtotal = cartTotal(session.cart);
  const deliveryFee = settings.delivery_fee ?? 5000;
  const finalTotal = subtotal + deliveryFee;

  return {
    text: `💵 *Pago en Efectivo*\n\n📦 Productos: *$${subtotal.toLocaleString('es-CO')}*\n🛵 Domicilio: *$${deliveryFee.toLocaleString('es-CO')}*\n💰 *Total a Pagar: $${finalTotal.toLocaleString('es-CO')}*\n\n✏️ Escribe el valor del billete con el que vas a pagar\n_(ej: 50000 o 100000)_`,
    reply_markup: {
      inline_keyboard: [[{ text: '↩️ Cancelar y volver al menú', callback_data: 'menu' }]],
    },
  };
}

async function handleCashAmount(session: BotSession, text: string, tenantId: string): Promise<BotResponse> {
  const settings = await getTenantSettings(tenantId);
  const subtotal = cartTotal(session.cart);
  // Usar integer para evitar errores de punto flotante
  const deliveryFee = Math.round(settings.delivery_fee ?? 5000);
  const finalTotal = Math.round(subtotal) + deliveryFee;

  // Usar InputValidator.validateAmount (aritmética de enteros COP)
  const amountResult = validateAmount(text, finalTotal);
  if (!amountResult.valid) {
    return {
      text: amountResult.errorMessage,
      reply_markup: { inline_keyboard: [[{ text: '↩️ Cancelar', callback_data: 'menu' }]] },
    };
  }

  // Aritmética de enteros — sin floats
  session.changeAmount = amountResult.value.change;
  session.paymentMethod = 'cash';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `✅ ¡Listo! Le devolveremos *$${session.changeAmount.toLocaleString('es-CO')}* de cambio.\n\n📍 ¿A dónde enviamos tu pedido?\n\n🗺️ Puedes escribir tu dirección *O* compartir tu ubicación GPS para mayor precisión:`,
    reply_markup: {
      keyboard: [
        [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
        [{ text: '🏪 Voy a recoger en el local' }],
      ],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  };
}


async function digitalPaymentScreen(session: BotSession, tenantId: string): Promise<BotResponse> {
  session.paymentMethod = 'transfer';
  session.paymentStatus = 'pending_verification';
  session.state = 'awaiting_payment_receipt';

  const settings = await getTenantSettings(tenantId);
  const nequi = settings.nequi_number || '300 123 4567';
  const bancoNum = settings.bancolombia_number || '123-456789-00';
  const bancoType = settings.bancolombia_type || 'Ahorros';

  return {
    text: `📱 *Pago Digital*\n\n🏦 *Nequi / Daviplata:* ${nequi}\n💳 *Bancolombia (${bancoType}):* ${bancoNum}\n\n📸 Realiza la transferencia y **envíame una foto del comprobante** por aquí mismo para continuar.\n\n_(O toca el botón para cancelar)_`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}



async function handlePaymentReceipt(
  session: BotSession,
  isPhoto: boolean,
  tenantId: string,
  photoId?: string
): Promise<BotResponse> {
  if (!isPhoto || !photoId) {
    return {
      text: '⚠️ *No detectamos una imagen.*\n\nPor favor, envía una *foto o captura de pantalla* del comprobante de pago aprobado para continuar.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Intentar de nuevo', callback_data: 'pay_digital' }],
          [{ text: '↩️ Cambiar método de pago', callback_data: 'pay' }],
        ],
      },
    };
  }

  // Obtener total esperado para validación del comprobante
  const settings = await getTenantSettings(tenantId);
  const subtotal = Math.round(cartTotal(session.cart));
  const deliveryFee = Math.round(settings.delivery_fee ?? 5000);
  const expectedTotal = subtotal + deliveryFee;

  // Validar comprobante con PaymentProofValidator
  let proofResult;
  try {
    proofResult = await validatePaymentProof({
      imageUrl: photoId,
      expectedAmountCop: expectedTotal,
      paymentMethod: 'transfer',
      nequiNumber: settings.nequi_number,
      bancolombiaNumber: settings.bancolombia_number,
    });
  } catch (err) {
    console.error('[handlePaymentReceipt] PaymentProofValidator error:', (err as Error).message);
    // Fallback seguro: ir a revisión manual
    proofResult = null;
  }

  // Si el comprobante fue rechazado (duplicado o claramente inválido), detener aquí
  if (proofResult?.status === 'REJECTED') {
    return {
      text: proofResult.user_message,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Enviar otro comprobante', callback_data: 'pay_digital' }],
          [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
          [{ text: '↩️ Cambiar método de pago', callback_data: 'pay' }],
        ],
      },
    };
  }

  // Guardar datos del comprobante en la sesión
  session.paymentReceiptId = photoId;
  // Guardar estado de verificación para el pedido
  (session as any).proofStatus = proofResult?.status ?? 'MANUAL_REVIEW';
  (session as any).proofScore = proofResult?.score ?? 50;
  session.state = 'checkout_address';

  const statusMsg = proofResult?.user_message ?? [
    `✅ *¡Comprobante recibido!*`,
    ``,
    `📋 Ha sido enviado al encargado para su validación.`,
  ].join('\n');

  return {
    text: `${statusMsg}\n\n📍 *¿A dónde enviamos tu pedido?*\n\n🗺️ Escribe tu dirección *O* comparte tu ubicación GPS:`,
    reply_markup: {
      keyboard: [
        [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
        [{ text: '🏪 Voy a recoger en el local' }],
      ],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  };
}

function onDeliveryScreen(session: BotSession): BotResponse {
  session.paymentMethod = 'ondelivery';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `💳 *Pago Contra Entrega*\n\nPodrás pagar en efectivo o con datáfono cuando recibas tu pedido.\n\n📍 ¿A dónde enviamos tu pedido?\n\n🗺️ Puedes escribir tu dirección *O* compartir tu ubicación GPS para mayor precisión:`,
    reply_markup: {
      keyboard: [
        [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
        [{ text: '🏪 Voy a recoger en el local' }],
      ],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  };
}

async function getOrCreateCustomer(session: BotSession, tenantId: string): Promise<string> {
  const idStr = session.chatId.toString();
  
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`telegram_chat_id.eq.${idStr},whatsapp_id.eq.${idStr}`)
    .limit(1)
    .single();

  if (existing) return existing.id;

  const newId = crypto.randomUUID();
  const isWhatsApp = idStr.length > 10;

  const insertData: any = {
    id: newId,
    tenant_id: tenantId,
    name: session.customerName || (isWhatsApp ? 'Cliente WhatsApp' : 'Cliente Telegram'),
    phone: isWhatsApp ? idStr : 'Por registrar',
    segment: 'new',
    total_spent: 0,
    order_count: 0
  };

  if (isWhatsApp) {
    insertData.whatsapp_id = idStr;
  } else {
    insertData.telegram_chat_id = idStr;
  }

  await supabase.from('customers').insert([insertData]);

  return newId;
}

async function confirmOrderScreen(session: BotSession, address: string, tenantId: string): Promise<BotResponse> {
  if (session.cart.length === 0) return welcomeScreen();

  const customerId = await getOrCreateCustomer(session, tenantId);
  const total = cartTotal(session.cart);
  const orderId = crypto.randomUUID();
  const shortId = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  
  let notes = `[ID: ${shortId}] [CHAT_ID: ${session.chatId}] [Cliente: ${session.customerName}]`;
  if (session.paymentMethod === 'cash' && session.changeAmount !== undefined) {
    notes += ` | [EFECTIVO] Devuelta: $${session.changeAmount.toLocaleString('es-CO')}`;
  } else if (session.paymentMethod === 'transfer') {
    notes += ` | [TRANSFERENCIA] Pendiente de validación`;
    if (session.paymentReceiptId) notes += ` | [COMPROBANTE: ${session.paymentReceiptId}]`;
  } else if (session.paymentMethod === 'ondelivery') {
    notes += ` | [PAGO CONTRA ENTREGA] Llevar datáfono/cambio`;
  }

  // 1. Obtener configuración del tenant (delivery_fee, etc.)
  const tenantSettings = await getTenantSettings(tenantId);
  const deliveryFee = /recoger|mesa|pickup/i.test(address) ? 0 : tenantSettings.delivery_fee;
  const orderType: 'delivery' | 'pickup' | 'dine_in' = /recoger|mesa|pickup/i.test(address) ? 'dine_in' : 'delivery';
  const finalTotal = total + deliveryFee;

  // Fetch default branch for this tenant (use first branch or fallback)
  let branchId = 'b0000000-0000-4000-8000-000000000001';
  try {
    const { data: branch } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).limit(1).single();
    if (branch?.id) branchId = branch.id;
  } catch { /* use fallback */ }

  // 2. Crear la orden
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert([
      {
        id: orderId,
        tenant_id: tenantId,
        branch_id: branchId,
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
    ])
    .select('tracking_token')
    .single();

  if (orderError) {
    // NUNCA exponer detalles internos de DB al usuario
    console.error('[confirmOrderScreen] Supabase order insert error:', orderError.code, orderError.message);
    return {
      text: '⚠️ No pudimos registrar tu pedido en este momento.\n\nPor favor, intenta de nuevo en unos segundos o contacta al encargado.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Intentar de nuevo', callback_data: 'pay' }],
          [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
        ],
      },
    };
  }

  // 3. Crear los items de la orden
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
    }
  }

  // 4. Si compartieron ubicación por GPS en el bot, la guardamos en delivery_details
  if (session.location) {
    const { error: deliveryError } = await supabase.from('delivery_details').upsert({
      order_id: orderId,
      latitude: session.location.latitude,
      longitude: session.location.longitude,
      status: 'searching',
      updated_at: new Date().toISOString()
    }, { onConflict: 'order_id' });
    if (deliveryError) {
      console.error('Error inserting delivery details:', deliveryError);
    }
  }

  // 5. Calcular ETA Dinámico consultando pedidos en preparación
  let etaText = '25–40 minutos';
  try {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed', 'preparing']);

    const activeCount = count ?? 0;
    if (activeCount >= 7) {
      etaText = '50–70 minutos';
    } else if (activeCount >= 3) {
      etaText = '35–50 minutos';
    } else {
      etaText = '20–35 minutos';
    }
  } catch (err) {
    console.warn('Failed to calculate dynamic ETA:', err);
  }

  // Save cart snapshot BEFORE clearing session
  const cartSnapshot = [...session.cart];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const trackingToken = orderData?.tracking_token || orderId;
  const trackingUrl = `${baseUrl}/public/rastreo/${trackingToken}`;

  // Reset session
  session.cart = [];
  session.state = 'idle';
  session.paymentMethod = undefined;
  session.paymentStatus = undefined;
  session.changeAmount = undefined;
  session.paymentReceiptId = undefined;
  session.location = undefined;

  const isDelivery = orderType === 'delivery';

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
      `⏱️ Tiempo estimado: *${etaText}*`,
      ``,
      isDelivery ? `📡 Puedes rastrear tu pedido en tiempo real con el botón de abajo.` : '',
      `¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
    ].filter(l => l !== '').join('\n'),
    reply_markup: {
      inline_keyboard: [
        ...(isDelivery ? [[{ text: '🛵 Rastrear en tiempo real 📍', url: trackingUrl }]] : []),
        [{ text: '❌ Cancelar mi pedido', callback_data: `cancel_order:${orderId}` }],
        [{ text: '🏠 Hacer otro pedido', callback_data: 'menu' }]
      ],
    },
  };
}

async function promptTrackOrderScreen(session: BotSession, tenantId: string): Promise<BotResponse> {
  session.state = 'idle'; // Will only go to tracking_order if no orders found

  // Buscar pedidos del cliente por su telegram_chat_id o whatsapp_id
  const idStr = session.chatId.toString();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`telegram_chat_id.eq.${idStr},whatsapp_id.eq.${idStr}`)
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
    .select('id, status, created_at, tracking_token')
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const trackingToken = (order as any).tracking_token || cleanCode;
  const trackingUrl = `${baseUrl}/public/rastreo/${trackingToken}`;

  const buttons = [
    [{ text: '🛵 Seguir en tiempo real 📍', url: trackingUrl }],
    [{ text: '🔄 Actualizar estado', callback_data: `track:${cleanCode}` }]
  ];
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

async function handleContactManager(
  session: BotSession,
  text: string,
  botToken?: string,
  adminChatId?: string
): Promise<BotResponse> {
  session.state = 'idle';
  
  // Use per-tenant credentials, fall back to global env vars
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  const adminId = adminChatId || process.env.ADMIN_CHAT_ID;

  if (token && adminId) {
    try {
      const bot = new Telegraf(token);
      await bot.telegram.sendMessage(
        adminId,
        `📩 *Nuevo mensaje de cliente*\n\n👤 *Cliente:* ${session.customerName} (ID: ${session.chatId})\n💬 *Mensaje:* ${text}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[handleContactManager] Failed to send to admin:', e);
    }
  } else {
    console.warn('[handleContactManager] No token or admin chat ID configured for this tenant.');
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
  tenantId: string,
  extra?: { isPhoto: boolean; photoId?: string; location?: { latitude: number; longitude: number } },
  botCredentials?: { botToken?: string; adminChatId?: string }
): Promise<BotResponse> {
  if (text.trim() === '/start') {
    const freshSession: BotSession = {
      chatId,
      state: 'idle',
      cart: [],
      customerName: username,
      lastActivityTimestamp: Date.now(),
      tenantId,
      reminder1Sent: false,
      reminder2Sent: false,
    };
    await saveSession(freshSession, tenantId);
  }

  const session = await getSession(chatId, username, tenantId);

  // Si la sesión expiró por superar los 10 minutos de inactividad
  if ((session as any).wasExpiredDueToInactivity) {
    delete (session as any).wasExpiredDueToInactivity;
    if (text.trim() !== '/start') {
      return {
        text: `⏰ *Tu sesión anterior ha expirado por inactividad (más de 10 minutos).*\n\nHemos reiniciado tu orden para garantizar la frescura de los platillos y disponibilidad de inventario.\n\n👇 *Selecciona una opción del menú para comenzar:*`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
            [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
            [{ text: '🙋 Hablar con el Encargado', callback_data: 'contact_manager' }],
          ],
        },
      };
    }
  }

  // Verificar horario de atención antes de procesar el mensaje
  const tenantSettings = await getTenantSettings(tenantId);
  if (!isRestaurantOpen(tenantSettings.business_hours)) {
    if (session.state !== 'contacting_manager' && session.state !== 'awaiting_payment_receipt' && text.trim() !== '/start') {
      const city = tenantSettings.coverage_city ? ` en ${tenantSettings.coverage_city}` : '';
      const hoursList = formatBusinessHours(tenantSettings.business_hours);
      return {
        text: `🕐 *Restaurante Cerrado*\n\nLo sentimos, en este momento no estamos atendiendo${city}.\n\n📅 *Nuestros Horarios de Atención:*\n${hoursList}\n\nPuedes dejar tu mensaje al encargado o explorar el menú con los botones de abajo.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú (para explorar)', callback_data: 'menu' }],
            [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }]
          ],
        },
      };
    }
  }

  const response = await handleProcessMessage(session, text, tenantId, extra, botCredentials);
  await saveSession(session, tenantId);
  return response;
}

async function handleProcessMessage(
  session: BotSession,
  text: string,
  tenantId: string,
  extra?: { isPhoto: boolean; photoId?: string; location?: { latitude: number; longitude: number } },
  botCredentials?: { botToken?: string; adminChatId?: string }
): Promise<BotResponse> {

  // Handle free-text states
  if (session.state === 'selecting_quantity') {
    // Usar InputValidator: acepta números Y lenguaje natural ("dos", "tres"...)
    const qtyResult = validateQuantity(text.trim());
    if (!qtyResult.valid) {
      return { text: qtyResult.errorMessage };
    }
    return askItemNoteScreen(session, qtyResult.value);
  }

  if (session.state === 'selecting_item_note') {
    // Sanitizar y validar la nota antes de agregarla
    const noteResult = validateNote(text.trim());
    const safeNote = noteResult.valid ? noteResult.value : sanitizeNote(text.trim());
    return addToCartAndConfirm(session, safeNote);
  }

  if (session.state === 'contacting_manager') {
    return handleContactManager(session, text.trim(), botCredentials?.botToken, botCredentials?.adminChatId);
  }

  if (session.state === 'awaiting_cancel_confirm') {
    return { text: '👆 Por favor, usa los botones de arriba para confirmar o abortar la cancelación.' };
  }

  if (session.state === 'awaiting_payment_receipt') {
    return handlePaymentReceipt(session, extra?.isPhoto || false, tenantId, extra?.photoId);
  }

  if (session.state === 'tracking_order') {
    return handleTrackOrder(session, text.trim());
  }

  if (session.state === 'awaiting_rider_rating') {
    return handleRiderRating(session, text.trim(), tenantId);
  }

  if (session.state === 'checkout_cash_amount') {
    return handleCashAmount(session, text.trim(), tenantId);
  }

  if (session.state === 'checkout_address') {
    // 1. Detectar si el usuario envió una ubicación GPS compartida
    if (extra?.location) {
      const { latitude, longitude } = extra.location;
      // Obtener restaurante coords para geocercas
      const tenantSettings = await getTenantSettings(tenantId);
      const restaurantLat = tenantSettings.restaurant_lat ?? 3.2311;
      const restaurantLng = tenantSettings.restaurant_lng ?? -76.4167;
      
      // Calcular distancia Haversine
      const distance = calculateDistance(restaurantLat, restaurantLng, latitude, longitude);
      if (distance > 8) {
        return {
          text: `⚠️ *Fuera de Cobertura*\n\nTu ubicación se encuentra a *${distance.toFixed(1)} km* de nuestro local, lo cual excede nuestro límite de cobertura de *8 km*.\n\n¿Deseas recoger el pedido en nuestro local?`,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
              [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
            ]
          }
        };
      }

      // Geocodificación inversa por Nominatim
      let reverseAddress = `Ubicación GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
          headers: { 'User-Agent': 'ChefFlow-Restaurant-Bot/1.0' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            reverseAddress = data.display_name;
          }
        }
      } catch (err) {
        console.warn('Reverse geocoding failed:', err);
      }

      session.location = extra.location;
      return confirmOrderScreen(session, reverseAddress, tenantId);
    }

    let address = text.trim();
    // Detectar botón de teclado de recoger (reply keyboard envía texto, no callback)
    if (/recoger|pickup|voy a recoger/i.test(address)) {
      address = 'Para Recoger en el local';
    }
    // Solo validar cobertura si NO es para recoger
    if (!/recoger|mesa|pickup/i.test(address)) {
      // Validar formato de dirección con InputValidator antes de coverage check
      const addrResult = validateAddress(address);
      if (!addrResult.valid) {
        return {
          text: addrResult.errorMessage,
          reply_markup: {
            keyboard: [
              [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
              [{ text: '🏪 Voy a recoger en el local' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        };
      }
      address = addrResult.value;

      const tenantSettings = await getTenantSettings(tenantId);
      const coverageError = validateAddressCoverage(address, tenantSettings);
      if (coverageError) {
        return {
          text: coverageError,
          reply_markup: {
            keyboard: [
              [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
              [{ text: '🏪 Voy a recoger en el local' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        };
      }
      
      // Si la validacion paso y se configuro ciudad, pero la direccion NO contiene la ciudad explicitamente,
      // se la concatenamos automaticamente para que se guarde de forma correcta y aparezca en el mapa.
      if (tenantSettings.coverage_city) {
        const cityNormalized = tenantSettings.coverage_city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const addressNormalized = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (!addressNormalized.includes(cityNormalized)) {
          address = `${address}, ${tenantSettings.coverage_city}`;
        }
      }
    }
    return confirmOrderScreen(session, address, tenantId);
  }

  // Si la sesión está en 'idle' pero el usuario envía un texto
  if (session.state === 'idle') {
    // Usar normalizeInput del InputValidator (consistente en todo el sistema)
    const rawText = normalizeInput(text);

    // Comandos de navegación por texto
    if (['menu', 'ver menu', 'carta', 'ver carta', 'pedido', 'quiero pedir'].includes(rawText)) {
      return menuScreen(tenantId);
    }
    if (['carrito', 'mi carrito', 'ver carrito'].includes(rawText)) {
      return cartScreen(session);
    }
    if (['rastrear', 'rastrear pedido', 'donde esta mi pedido', 'estado'].includes(rawText)) {
      return promptTrackOrderScreen(session, tenantId);
    }
    if (rawText !== 'start' && rawText !== '/start') {
      return {
        text: `🤔 *No logré entender esa opción.*\n\nUsa los botones del menú para realizar tu pedido:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
            [{ text: '🛒 Mi Carrito', callback_data: 'cart' }],
            [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
            [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }],
          ],
        },
      };
    }
  }

  // Fallback para otros estados interactivos donde se espera una interacción con botones en lugar de texto
  const buttonOnlyStates = ['checkout_payment', 'awaiting_cancel_confirm'];
  if (buttonOnlyStates.includes(session.state)) {
    return {
      text: `👆 *Por favor, selecciona una de las opciones presionando los botones de arriba:*`,
    };
  }

  // Default
  return welcomeScreen();
}

async function handleRiderRating(session: BotSession, text: string, tenantId: string): Promise<BotResponse> {
  const rating = parseInt(text);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return {
      text: '⚠️ Por favor, ingresa solo un número del 1 al 5 para calificar.',
    };
  }

  try {
    if (session.pendingRatingOrderId) {
      // tenantId available if needed for future use
      void tenantId;
      // First find the rider for this order
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('rider_id')
        .eq('order_id', session.pendingRatingOrderId)
        .single();
      
      if (delivery && delivery.rider_id) {
        // Here we could ideally calculate the average rating based on past ratings.
        // For simplicity, we just save this rating directly or you'd save it in an order_ratings table.
        // But since rider_profiles has a "rating" column, we'll update it directly (or simulate an average calculation).
        // Let's just update the rider rating directly for now.
        const { data: profile } = await supabase
          .from('rider_profiles')
          .select('rating')
          .eq('id', delivery.rider_id)
          .single();

        let newRating = rating;
        if (profile && profile.rating) {
          // Simple running average
          newRating = (profile.rating + rating) / 2;
        }

        await supabase
          .from('rider_profiles')
          .update({ rating: newRating })
          .eq('id', delivery.rider_id);
      }
    }
  } catch (error) {
    console.error('Error saving rating:', error);
  }

  session.state = 'idle';
  session.pendingRatingOrderId = undefined;
  session.pendingRiderName = undefined;

  return {
    text: `✅ ¡Gracias por tu calificación de ${rating} estrellas!\n\nEsperamos volver a atenderte pronto.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🍽️ Volver al Menú Principal', callback_data: 'menu' }]
      ]
    }
  };
}

export async function processCallback(
  chatId: number,
  callbackData: string,
  username: string,
  tenantId: string,
  botCredentials?: { botToken?: string; adminChatId?: string }
): Promise<BotResponse> {
  const session = await getSession(chatId, username, tenantId);

  // Si la sesión expiró por superar los 10 minutos de inactividad
  if ((session as any).wasExpiredDueToInactivity) {
    delete (session as any).wasExpiredDueToInactivity;
    if (callbackData !== 'menu' && !callbackData.startsWith('cat:')) {
      return {
        text: `⏰ *Tu sesión anterior ha expirado por inactividad (más de 10 minutos).*\n\nHemos reiniciado tu orden para garantizar la frescura de los platillos y disponibilidad de inventario.\n\n👇 *Selecciona una opción del menú para comenzar:*`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
            [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
            [{ text: '🙋 Hablar con el Encargado', callback_data: 'contact_manager' }],
          ],
        },
      };
    }
  }

  const response = await handleProcessCallback(session, callbackData, tenantId, botCredentials);
  await saveSession(session, tenantId);
  return response;
}

async function handleProcessCallback(
  session: BotSession,
  callbackData: string,
  tenantId: string,
  botCredentials?: { botToken?: string; adminChatId?: string }
): Promise<BotResponse> {
  // Acciones permitidas siempre (aún estando cerrado)
  const isAllowedAction = 
    callbackData === 'menu' ||
    callbackData.startsWith('cat:') ||
    callbackData.startsWith('product:') ||
    callbackData.startsWith('quick_add:') ||
    callbackData.startsWith('show_additions:') ||
    callbackData.startsWith('add_ad:') ||
    callbackData.startsWith('add_addition:') ||
    callbackData.startsWith('ask_note:') ||
    callbackData.startsWith('skip_note') ||
    callbackData.startsWith('cancel_order:') ||
    callbackData === 'confirm_cancel' ||
    callbackData === 'abort_cancel' ||
    callbackData === 'track_prompt' ||
    callbackData.startsWith('track:') ||
    callbackData.startsWith('rate_rider:') ||
    callbackData === 'contact_manager';

  if (!isAllowedAction) {
    const tenantSettings = await getTenantSettings(tenantId);
    if (!isRestaurantOpen(tenantSettings.business_hours)) {
      const city = tenantSettings.coverage_city ? ` en ${tenantSettings.coverage_city}` : '';
      const hoursList = formatBusinessHours(tenantSettings.business_hours);
      return {
        text: `🕐 *Restaurante Cerrado*\n\nLo sentimos, en este momento no estamos atendiendo${city}.\n\n📅 *Nuestros Horarios de Atención:*\n${hoursList}\n\nPuedes dejar tu mensaje al encargado o explorar el menú con los botones de abajo.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú (para explorar)', callback_data: 'menu' }],
            [{ text: '🙋 Hablar con el encargado', callback_data: 'contact_manager' }]
          ],
        },
      };
    }
  }

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

  if (callbackData === 'menu') {
    session.state = 'idle';
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    return menuScreen(tenantId);
  }
  if (callbackData === 'cart') {
    session.state = 'idle';
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    return cartScreen(session);
  }
  if (callbackData === 'pay') return paymentOptionsScreen(session, tenantId);
  if (callbackData === 'pay_cash') return cashAmountScreen(session, tenantId);
  if (callbackData === 'pay_digital') return digitalPaymentScreen(session, tenantId);
  if (callbackData === 'pay_ondelivery') return onDeliveryScreen(session);
  if (callbackData === 'recoger') return confirmOrderScreen(session, 'Para Recoger en el local', tenantId);
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
    session.state = 'idle';
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    return menuScreen(tenantId, callbackData.replace('cat:', ''));
  }
  if (callbackData === 'track_prompt') {
    session.state = 'idle';
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    return promptTrackOrderScreen(session, tenantId);
  }
  if (callbackData === 'contact_manager') {
    session.selectedProduct = undefined;
    session.pendingItem = undefined;
    return contactManagerScreen(session);
  }
  if (callbackData.startsWith('track:')) return handleTrackOrder(session, callbackData.replace('track:', ''));
  if (callbackData.startsWith('show_additions:')) {
    const parts = callbackData.replace('show_additions:', '').split(':');
    const qty = parseInt(parts[0]) || 1;
    const prodId = parts[1];
    return showAdditionsScreen(session, qty, prodId, tenantId);
  }

  if (callbackData.startsWith('add_ad:')) {
    const parts = callbackData.replace('add_ad:', '').split(':');
    const addId = parts[0];
    const qty = parseInt(parts[1]) || 1;
    const settings = await getTenantSettings(tenantId);
    const addition = (settings.additions || []).find((a: AdditionItem) => a.id === addId);
    const additionName = addition?.name || 'Adición Extra';
    const additionPrice = addition?.price || 0;
    return addToCartAndConfirm(session, `Con adición: ${additionName}`, qty, undefined, additionPrice);
  }

  if (callbackData.startsWith('add_addition:')) {
    const parts = callbackData.replace('add_addition:', '').split(':');
    const additionName = parts[0];
    const additionPrice = parseInt(parts[1]) || 0;
    const qty = parseInt(parts[2]) || 1;
    const prodId = parts[3];
    return addToCartAndConfirm(session, `Con adición: ${additionName}`, qty, prodId, additionPrice);
  }

  if (callbackData.startsWith('ask_note:')) {
    const parts = callbackData.replace('ask_note:', '').split(':');
    const qty = parseInt(parts[0]) || 1;
    const prodId = parts[1];
    return askItemNoteScreen(session, qty, prodId, tenantId);
  }

  if (callbackData.startsWith('quick_add:')) {
    const parts = callbackData.replace('quick_add:', '').split(':');
    const note = parts[0];
    const qty = parts[1] ? parseInt(parts[1]) : undefined;
    const prodId = parts[2];
    return addToCartAndConfirm(session, note, qty, prodId);
  }

  if (callbackData.startsWith('skip_note')) {
    const parts = callbackData.replace('skip_note:', '').replace('skip_note', '').split(':').filter(Boolean);
    const qty = parts[0] ? parseInt(parts[0]) : undefined;
    const prodId = parts[1];
    return addToCartAndConfirm(session, undefined, qty, prodId);
  }

  // Calificación del repartidor
  if (callbackData.startsWith('rate_rider:')) {
    const parts = callbackData.replace('rate_rider:', '').split(':');
    const orderId = parts[0];
    const riderName = parts.slice(1).join(':');
    session.pendingRatingOrderId = orderId;
    session.pendingRiderName = riderName;
    session.state = 'awaiting_rider_rating';
    return {
      text: `⭐ *Califica a tu repartidor: ${riderName}*\n\nEscribe un número del 1 al 5 para calificar:\n1 = Muy malo\n2 = Regular\n3 = Bueno\n4 = Muy bueno\n5 = Excelente\n\n¡Tu opinión nos ayuda a mejorar!`,
    };
  }
  
  if (callbackData.startsWith('product:')) {
    return productScreen(session, callbackData.replace('product:', ''));
  }
  if (callbackData.startsWith('qty_other')) {
    const prodId = callbackData.replace('qty_other:', '').replace('qty_other', '');
    if (prodId) {
      const { data } = await supabase.from('products').select('*').eq('id', prodId).single();
      if (data) session.selectedProduct = data as Product;
    }
    session.state = 'selecting_quantity';
    return { text: '⌨️ Por favor, escribe en el chat el número exacto de unidades que deseas (Ej: 8):' };
  }
  if (callbackData.startsWith('qty:')) {
    const parts = callbackData.replace('qty:', '').split(':');
    const qty = parseInt(parts[0]);
    const prodId = parts[1];
    return askItemNoteScreen(session, qty, prodId, tenantId);
  }

  return welcomeScreen();
}

/**
 * Escanea todas las sesiones activas en el bot y envía recordatorios automáticos
 * por inactividad (3.5 min, 7 min) o libera carritos y cierra sesión a los 10 min.
 */
export async function checkInactivityAndSendReminders(defaultBotToken?: string): Promise<{ checked: number; remindersSent: number; expired: number }> {
  const now = Date.now();
  const REMINDER_1_MS = 3.5 * 60 * 1000; // 3.5 min
  const REMINDER_2_MS = 7 * 60 * 1000;   // 7 min
  const TIMEOUT_MS = 10 * 60 * 1000;     // 10 min

  let remindersSent = 0;
  let expired = 0;
  let checked = 0;

  for (const [key, session] of Object.entries(globalSessions)) {
    if (!session || !session.lastActivityTimestamp) continue;
    const hasPendingOrder = (session.cart && session.cart.length > 0) || session.state !== 'idle';
    if (!hasPendingOrder) continue;

    checked++;
    const elapsed = now - session.lastActivityTimestamp;
    const tenantId = session.tenantId || key.split(':')[0] || 'a0000000-0000-4000-8000-000000000001';

    let token = defaultBotToken || process.env.TELEGRAM_BOT_TOKEN;
    try {
      const { data: tSettings } = await supabase
        .from('tenant_settings')
        .select('telegram_bot_token')
        .eq('tenant_id', tenantId)
        .single();
      if (tSettings?.telegram_bot_token) {
        token = tSettings.telegram_bot_token;
      }
    } catch (e) {
      // Usar token general por defecto
    }

    if (!token) continue;
    const botInstance = new Telegraf(token);

    // 1. Primer Recordatorio (3.5 - 6.9 minutos)
    if (elapsed >= REMINDER_1_MS && elapsed < REMINDER_2_MS && !session.reminder1Sent) {
      session.reminder1Sent = true;
      try {
        const name = session.customerName ? ` ${session.customerName}` : '';
        const itemCount = (session.cart || []).reduce((acc, i) => acc + i.quantity, 0);
        const subtotal = (session.cart || []).reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
        const cartInfo = (session.cart && session.cart.length > 0)
          ? `\n\n🛍️ *Tienes ${itemCount} producto(s) en tu pedido:* $${subtotal.toLocaleString('es-CO')}`
          : '';

        await botInstance.telegram.sendMessage(
          session.chatId,
          `🔔 *¡Hola${name}!* Notamos que tu pedido está en pausa.${cartInfo}\n\n¿Deseas concluir tu orden antes de que expire la sesión? Nuestros cocineros están listos para preparar tus platillos. 🍳`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Ver Carrito y Concluir Pedido', callback_data: 'cart' }],
                [{ text: '🍽️ Continuar Viendo Menú', callback_data: 'menu' }],
                [{ text: '❌ Cancelar y Empezar de Nuevo', callback_data: 'clear_cart' }],
              ],
            },
          }
        );
        remindersSent++;
        await saveSession(session, tenantId);
      } catch (err) {
        console.warn(`[Inactivity Reminder 1] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
      }
    }
    // 2. Segundo Recordatorio Urgente (7 - 9.9 minutos)
    else if (elapsed >= REMINDER_2_MS && elapsed < TIMEOUT_MS && !session.reminder2Sent) {
      session.reminder2Sent = true;
      try {
        await botInstance.telegram.sendMessage(
          session.chatId,
          `⏳ *¡Tu pedido está a punto de vencer!*\n\nTu sesión se cerrará automáticamente en *3 minutos* por inactividad. ¿Deseas confirmar tu orden ahora? 👇`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Finalizar Mi Pedido Ahora', callback_data: 'cart' }],
                [{ text: '❌ Descartar Pedido', callback_data: 'clear_cart' }],
              ],
            },
          }
        );
        remindersSent++;
        await saveSession(session, tenantId);
      } catch (err) {
        console.warn(`[Inactivity Reminder 2] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
      }
    }
    // 3. Expiración Definitiva (> 10 minutos)
    else if (elapsed >= TIMEOUT_MS) {
      session.state = 'idle';
      session.cart = [];
      session.selectedProduct = undefined;
      session.pendingItem = undefined;
      session.paymentMethod = undefined;
      session.reminder1Sent = false;
      session.reminder2Sent = false;
      session.lastActivityTimestamp = now;
      expired++;

      try {
        await botInstance.telegram.sendMessage(
          session.chatId,
          `⏰ *Tu sesión ha expirado por inactividad (+10 min).*\n\nHemos liberado tu carrito. Cuando desees ordenar nuevamente, simplemente presiona el botón abajo o escribe */start*. ¡Con gusto te atenderemos!`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🍽️ Ver Menú Principal', callback_data: 'menu' }],
              ],
            },
          }
        );
        await saveSession(session, tenantId);
      } catch (err) {
        console.warn(`[Inactivity Expiry] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
      }
    }
  }

  return { checked, remindersSent, expired };
}

// Iniciar worker periódico de inactividad de forma segura
if (typeof setInterval !== 'undefined') {
  if (!(globalThis as any).__botInactivityInterval) {
    (globalThis as any).__botInactivityInterval = setInterval(async () => {
      try {
        await checkInactivityAndSendReminders();
      } catch (e) {
        console.warn('[Bot Inactivity Worker Error]:', e);
      }
    }, 45_000);
  }
}
