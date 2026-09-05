import { createClient } from '@supabase/supabase-js';
import { Telegraf } from 'telegraf';
import type { OrderItem, Product, AdditionItem } from '@/types';
import { validateQuantity, validateAmount, validateAddress, validateNote, normalizeInput, normalizeAmount } from '@/lib/bot/validators/InputValidator';
import { validatePaymentProof } from '@/lib/bot/validators/PaymentProofValidator';
import { sanitizeNote } from '@/lib/bot/guards/MessageGuard';
import { sendWhatsAppMessage, getTenantCreds } from './whatsapp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotState =
  | 'idle'
  | 'selecting_quantity'
  | 'selecting_item_note'
  | 'checkout_delivery_mode'
  | 'checkout_address'
  | 'checkout_home_address'
  | 'checkout_cash_amount'
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
  deliveryMode?: 'delivery' | 'pickup';
  deliveryAddress?: string;
  pendingReverseAddress?: string;
  pendingRatingOrderId?: string; // ID del pedido que el cliente va a calificar
  pendingRiderName?: string;     // Nombre del repartidor que va a calificar
  lastActivityTimestamp?: number; // Marca de tiempo de la última interacción
  reminder1Sent?: boolean;       // Recordatorio intermedio (15 min)
  reminder2Sent?: boolean;       // Recordatorio de advertencia (30 min)
  tenantId?: string;
  platform?: 'telegram' | 'whatsapp';
  whatsappRecipient?: string;
  whatsappFrom?: string;
}

export interface BotResponse {
  text: string;
  reply_markup?: object;
  image_url?: string;
  document_url?: string;
  document_filename?: string;
  document_caption?: string;
}

// ─── Session Store (keyed by tenantId:chatId for multi-tenant isolation) ────────────────────

// Sessions: key = `${tenantId}:${chatId}`
const globalSessions = ((globalThis as any).botSessionsV2 as Record<string, BotSession>) || {};
(globalThis as any).botSessionsV2 = globalSessions;

function sessionKey(tenantId: string, chatId: number): string {
  return `${tenantId}:${chatId}`;
}

const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000; // 45 Minutos (30–60 min)

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
  restaurant_name?: string;
  delivery_fee: number;
  business_hours: { day: string; open: string; close: string; closed: boolean }[];
  additions?: AdditionItem[];
  coverage_city?: string;
  coverage_department?: string;
  coverage_keywords?: string[];
  coverage_require_keywords?: boolean;
  coverage_radius_km?: number;
  restaurant_lat?: number;
  restaurant_lng?: number;
  nequi_number?: string;
  bancolombia_number?: string;
  bancolombia_type?: string;
  menu_pdf_url?: string;
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
    .select('delivery_fee, business_hours, coverage_city, coverage_department, coverage_keywords, coverage_require_keywords, restaurant_lat, restaurant_lng, whatsapp_phone, logo_url')
    .eq('tenant_id', tenantId)
    .single();

  if (error) {
    console.warn('Failed to query tenant_settings:', error.message);
    return { delivery_fee: 5000, business_hours: [] };
  }

  let restaurantName = 'ChefFlow';
  try {
    const { data: tRow } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();
    if (tRow?.name) {
      restaurantName = tRow.name;
    }
  } catch {
    // fallback
  }

  const accounts = decodePaymentAccounts(data?.whatsapp_phone);

  const settings: CachedSettings = {
    restaurant_name: restaurantName,
    delivery_fee: data?.delivery_fee ?? 5000,
    business_hours: data?.business_hours ?? [],
    coverage_city: data?.coverage_city,
    coverage_department: data?.coverage_department,
    coverage_keywords: data?.coverage_keywords ?? [],
    coverage_require_keywords: data?.coverage_require_keywords ?? false,
    restaurant_lat: data?.restaurant_lat != null ? Number(data.restaurant_lat) : undefined,
    restaurant_lng: data?.restaurant_lng != null ? Number(data.restaurant_lng) : undefined,
    nequi_number: accounts.nequi_number,
    bancolombia_number: accounts.bancolombia_number,
    bancolombia_type: accounts.bancolombia_type || 'Ahorros',
    menu_pdf_url: (data as any)?.menu_pdf_url || (data?.logo_url && String(data.logo_url).toLowerCase().includes('.pdf') ? data.logo_url : undefined),
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

  const DEFAULT_NOMENCLATURE = [
    'calle', 'cll', 'cl', 'carrera', 'cra', 'cr', 'diagonal', 'diag', 'dg',
    'transversal', 'transv', 'tv', 'avenida', 'av', 'circular', 'autopista',
    'manzana', 'mz', 'lote', 'barrio', 'b/', 'conjunto', 'urbanizacion', 'urb',
    'edificio', 'torre', 'casa', 'apto', 'apartamento', 'vereda', 'sector', 'km',
    'norte', 'sur', 'este', 'oeste', 'parque', 'centro', 'frente', 'esquina'
  ];

  const keywords = (settings.coverage_keywords && settings.coverage_keywords.length > 0)
    ? settings.coverage_keywords.filter(Boolean)
    : DEFAULT_NOMENCLATURE;

  const hasKeyword = keywords.some(kw => addr.includes(normalize(kw)));
  const hasCity = city ? addr.includes(city) : false;

  // Si tiene palabras clave (ej: "cra", "calle", "casa") o menciona la ciudad, es válida
  if (hasKeyword || hasCity) {
    return null;
  }

  // Si la validación estricta de palabras clave no está encendida, aceptamos la dirección si tiene longitud mínima
  if (!settings.coverage_require_keywords && addr.length >= 4) {
    return null;
  }

  // Si tiene activa la validación estricta de palabras clave pero no cumple
  if (settings.coverage_require_keywords && !hasKeyword && !hasCity) {
    const cityName = settings.coverage_city ? `*${settings.coverage_city}*` : 'nuestra ciudad';
    return [
      `⚠️ *Dirección no reconocida*`,
      ``,
      `Solo realizamos domicilios en ${cityName}.`,
      `Por favor incluye la nomenclatura o barrio (ej: Calle, Carrera, Manzana, Barrio):`,
      `_Ej: Cra 19 #18-44 Barrio Centro_`,
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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Screens ──────────────────────────────────────────────────────────────────

async function welcomeScreen(isReturning = false, tenantId?: string): Promise<BotResponse> {
  let restaurantName = 'ChefFlow';
  if (tenantId) {
    try {
      const settings = await getTenantSettings(tenantId);
      if (settings.restaurant_name) {
        restaurantName = settings.restaurant_name;
      }
    } catch {
      // ignore
    }
  } else {
    try {
      const { data: firstTenant } = await supabase
        .from('tenants')
        .select('name')
        .limit(1)
        .maybeSingle();
      if (firstTenant?.name) restaurantName = firstTenant.name;
    } catch {
      // ignore
    }
  }

  const motivationalQuote = '🌟 "El ingrediente secreto siempre es el amor con el que cocinamos para ti."';

  const greeting = isReturning
    ? `✨ ¡Qué alegría tenerte de vuelta en *${restaurantName}*! 🍽️❤️\n\n${motivationalQuote}\n\nNos alegra muchísimo que vuelvas a elegirnos. La cocina ya está encendida y lista para preparar tus platillos favoritos. 🍳🔥\n\n¿Qué te gustaría disfrutar hoy?`
    : `✨ ¡Hola! Qué alegría saludarte. ¡Bienvenido a *${restaurantName}*! 🍽️❤️\n\n${motivationalQuote}\n\nHoy es un gran día para deleitarte con algo delicioso y recargar tu mejor energía. ¡Estamos listos para atenderte con toda la pasión y el mejor sabor! 🍳🔥\n\n¿En qué te podemos consentir hoy?`;

  const buttons: { text: string; callback_data: string }[][] = [
    [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
    [{ text: '🛒 Mi Carrito', callback_data: 'cart' }],
    [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
    [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
  ];

  return {
    text: greeting,
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

async function menuScreen(tenantId: string, categoryId?: string): Promise<BotResponse> {
  const settings = await getTenantSettings(tenantId).catch(() => null);

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

    const menuText = '🍽️ *Nuestro Menú*\n\nSelecciona una categoría:';

    return {
      text: menuText,
      document_url: settings?.menu_pdf_url || undefined,
      document_filename: 'Carta_Menu.pdf',
      document_caption: '📖 Aquí tienes nuestra carta completa en PDF con descripciones y precios.',
      image_url: defaultImage || undefined,
      reply_markup: { inline_keyboard: buttons },
    };
  } else {
    let query = supabase.from('products').select('id, name, price, image_url, description').eq('is_available', true).eq('tenant_id', tenantId).order('created_at', { ascending: true });
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

  const descText = p.description ? `\n\n📝 _${p.description.trim()}_\n` : '';

  return {
    text: `*${p.name}*${descText}\n💰 Precio: $${p.price.toLocaleString('es-CO')} c/u${cartInfo}\n\n¿Cuántas unidades deseas?`,
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
  const availableAdditions = (p.additions || []).filter((a: AdditionItem) => a.is_available !== false);

  const buttons: { text: string; callback_data: string }[][] = [];
  if (availableAdditions.length > 0) {
    buttons.push([{ text: `🧀 Ver Adiciones (${availableAdditions.length})`, callback_data: `show_additions:${qty}:${p.id}` }]);
  }
  buttons.push([{ text: '⏭️ Omitir / Agregar', callback_data: `skip_note:${qty}:${p.id}` }]);
  buttons.push([{ text: '↩️ Cancelar', callback_data: 'menu' }]);

  const additionsHint = availableAdditions.length > 0
    ? `\n\n🧀 *Este plato cuenta con ${availableAdditions.length} adición(es) disponible(s).*`
    : '';

  return {
    text: `Has elegido *${qty}x ${p.name}*.\n\n📝 *¿Deseas agregar una instrucción especial o adición?*${additionsHint}\n\n_Escribe tu nota ahora (ej: "sin cebolla") o selecciona una opción:_`,
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

async function showAdditionsScreen(session: BotSession, qty: number, productId: string, tenantId: string): Promise<BotResponse> {
  let p = session.selectedProduct;
  if (productId && (!p || p.id !== productId)) {
    const { data } = await supabase.from('products').select('*').eq('id', productId).single();
    if (data) {
      session.selectedProduct = data as Product;
      p = data as Product;
    }
  }
  if (!session.pendingItem && p) {
    session.pendingItem = { product: p, quantity: qty };
  }
  const productName = p?.name || 'este platillo';

  // Dish-level additions
  const additionsList: AdditionItem[] = (p?.additions || []).filter((a: AdditionItem) => a.is_available !== false);

  if (additionsList.length === 0) {
    return {
      text: `🧀 *El platillo "${productName}" no tiene adiciones configuradas.*\n\n¿Deseas agregarlo directamente al carrito?`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Sí, agregar', callback_data: `skip_note:${qty}:${productId}` }],
          [{ text: '↩️ Volver', callback_data: `ask_note:${qty}:${productId}` }],
        ],
      },
    };
  }

  const buttons: { text: string; callback_data: string }[][] = [];

  for (let i = 0; i < additionsList.length; i++) {
    const a = additionsList[i];
    buttons.push([{
      text: `${a.name} (+$${a.price.toLocaleString('es-CO')})`,
      callback_data: `add_ad:${i}:${qty}`,
    }]);
  }

  buttons.push([{ text: '⏭️ Omitir Adiciones', callback_data: `skip_note:${qty}:${productId}` }]);
  buttons.push([{ text: '↩️ Volver', callback_data: `ask_note:${qty}:${productId}` }]);

  return {
    text: `🧀 *Adiciones disponibles para:* ${qty}x ${productName}\n\nSelecciona una adición:`,
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
        [{ text: '🛒 Carrito y Pago', callback_data: 'cart' }],
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

  const buttons: { text: string; callback_data: string }[][] = [
    [{ text: '💳 Proceder al Pago', callback_data: 'pay' }],
    [{ text: '🍽️ Seguir comprando', callback_data: 'menu' }],
    [{ text: '🗑️ Vaciar Carrito', callback_data: 'clear_cart' }],
  ];

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
        [{ text: '📱 Nequi / Daviplata', callback_data: 'pay_digital' }],
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
      inline_keyboard: [[{ text: '↩️ Cancelar y volver', callback_data: 'pay' }]],
    },
  };
}

async function handleCashAmount(session: BotSession, text: string, tenantId: string): Promise<BotResponse> {
  const settings = await getTenantSettings(tenantId);
  const subtotal = cartTotal(session.cart);
  const deliveryFee = Math.round(settings.delivery_fee ?? 5000);
  const finalTotal = Math.round(subtotal) + deliveryFee;

  // Usar InputValidator.validateAmount (aritmética de enteros COP)
  const amountResult = validateAmount(text, finalTotal);
  if (!amountResult.valid) {
    return {
      text: amountResult.errorMessage,
      reply_markup: { inline_keyboard: [[{ text: '↩️ Cancelar y volver', callback_data: 'pay' }]] },
    };
  }

  session.changeAmount = amountResult.value.change;
  session.paymentMethod = 'cash';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `✅ ¡Listo! Le devolveremos *$${session.changeAmount.toLocaleString('es-CO')}* de cambio.\n\n📍 *¿A dónde enviamos tu pedido?*\n\n🗺️ Puedes escribir tu dirección O compartir tu ubicación GPS para mayor precisión:`,
    reply_markup: {
      keyboard: [
        [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
        [{ text: '🏪 Voy a recoger en el local' }],
      ],
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar y volver', callback_data: 'cart' }],
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
  const isPickup = session.deliveryMode === 'pickup';
  const deliveryFee = isPickup ? 0 : (settings.delivery_fee ?? 5000);
  const finalTotal = cartTotal(session.cart) + deliveryFee;

  const nequi = settings.nequi_number || '300 123 4567';
  const bancoNum = settings.bancolombia_number || '123-456789-00';
  const bancoType = settings.bancolombia_type || 'Ahorros';

  return {
    text: `📱 *Pago Digital por Transferencia*\n\n💰 *Total a Transferir:* *$${finalTotal.toLocaleString('es-CO')}*\n\n🏦 *Nequi / Daviplata:* \`${nequi}\`\n💳 *Bancolombia (${bancoType}):* \`${bancoNum}\`\n\n📸 *Paso siguiente:* Realiza la transferencia y **envíame una foto o captura del comprobante** por aquí mismo para registrar tu pedido.\n\n_(O toca un botón para cambiar o cancelar)_`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ Cambiar método de pago', callback_data: 'pay' }],
        [{ text: '❌ Cancelar pedido', callback_data: 'menu' }]
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
      text: '⚠️ *No detectamos una imagen.*\n\nPor favor, envía una *foto o captura de pantalla* del comprobante de pago para continuar.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Intentar de nuevo', callback_data: 'pay_digital' }],
          [{ text: '↩️ Cambiar método', callback_data: 'pay' }],
        ],
      },
    };
  }

  // Obtener total esperado para validación del comprobante
  const settings = await getTenantSettings(tenantId);
  const subtotal = Math.round(cartTotal(session.cart));
  const isPickup = session.deliveryMode === 'pickup';
  const deliveryFee = isPickup ? 0 : Math.round(settings.delivery_fee ?? 5000);
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
    proofResult = null;
  }

  // Si el comprobante fue rechazado (duplicado o claramente inválido), detener aquí
  if (proofResult?.status === 'REJECTED') {
    return {
      text: proofResult.user_message,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Enviar otro comprobante', callback_data: 'pay_digital' }],
          [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
          [{ text: '↩️ Cambiar método', callback_data: 'pay' }],
        ],
      },
    };
  }

  // Guardar datos del comprobante en la sesión
  session.paymentReceiptId = photoId;
  (session as any).proofStatus = proofResult?.status ?? 'MANUAL_REVIEW';
  (session as any).proofScore = proofResult?.score ?? 50;

  const defaultAddr = isPickup ? 'Para Recoger en el local' : (session.deliveryAddress || 'Ubicación registrada');
  return confirmOrderScreen(session, defaultAddr, tenantId);
}

function onDeliveryScreen(session: BotSession): BotResponse {
  session.paymentMethod = 'ondelivery';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `💳 *Pago Contra Entrega*\n\nPodrás pagar al recibir tu pedido.\n\n📍 *¿A dónde enviamos tu pedido?*\n\n🗺️ Puedes escribir tu dirección O compartir tu ubicación GPS para mayor precisión:`,
    reply_markup: {
      keyboard: [
        [{ text: '📍 Compartir mi ubicación GPS', request_location: true }],
        [{ text: '🏪 Voy a recoger en el local' }],
      ],
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar', callback_data: 'cart' }],
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
  const isPickup = session.deliveryMode === 'pickup' || /recoger|mesa|pickup/i.test(address);
  const deliveryFee = isPickup ? 0 : (tenantSettings.delivery_fee ?? 5000);
  const orderType: 'delivery' | 'pickup' | 'dine_in' = isPickup ? 'pickup' : 'delivery';
  const finalTotal = total + deliveryFee;
  if (isPickup) {
    notes += ` | [RECOGER EN LOCAL]`;
  }

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
          [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
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
  session.deliveryMode = undefined;
  session.deliveryAddress = undefined;
  session.pendingReverseAddress = undefined;

  const isDelivery = orderType === 'delivery';

  return {
    text: [
      `🎉 *¡Pedido Confirmado!*`,
      ``,
      `📋 Código: *${shortId}*`,
      isPickup ? `🏪 Modalidad: *Recoger en punto físico (Local)*` : `📍 Dirección: ${address}`,
      ``,
      `🛒 *Resumen de tu pedido:*`,
      cartSummaryText(cartSnapshot),
      ``,
      deliveryFee > 0 ? `🛵 Domicilio: *$${deliveryFee.toLocaleString('es-CO')}*` : `🏪 Sin costo de domicilio`,
      `💰 *TOTAL: $${finalTotal.toLocaleString('es-CO')}*`,
      ``,
      `⏱️ Tiempo estimado: *${etaText}*`,
      ``,
      isDelivery ? `📡 Puedes rastrear tu pedido en tiempo real con el botón de abajo.` : `🏪 Te esperamos en nuestro local cuando esté listo.`,
      `¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
    ].filter(l => l !== '').join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Rastrear Pedido', callback_data: `track:${shortId}` }],
        [{ text: '🍽️ Nuevo Pedido', callback_data: 'menu' }],
        [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
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
        const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
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
    'confirmed': '✅ Confirmado (En cola de cocina)',
    'preparing': '🍳 En preparación (Cocinando)',
    'ready': '🛍️ Listo para entregar / despachar',
    'shipping': '🛵 En camino (Repartidor en ruta)',
    'delivered': '🎉 ¡Entregado con éxito!',
    'cancelled': '❌ Cancelado'
  };

  const statusText = statusMap[order.status] || order.status;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bot-restaurante-sigma.vercel.app';
  const trackingToken = (order as any).tracking_token || order.id || cleanCode;
  const trackingUrl = `${baseUrl}/public/rastreo/${trackingToken}`;

  const buttons = [
    [{ text: '🔄 Actualizar estado', callback_data: `track:${cleanCode}` }],
    [{ text: '🍽️ Nuevo Pedido', callback_data: 'menu' }],
    [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
  ];

  return {
    text: [
      `📦 *Estado de tu pedido (${cleanCode})*`,
      ``,
      `👉 *Estado actual:*`,
      `*${statusText}*`,
      ``,
      `🌐 *Rastreo en tiempo real (Mapa en vivo):*`,
      `${trackingUrl}`,
      ``,
      `_Toca el enlace para ver la ruta y posición en vivo del repartidor._`
    ].join('\n'),
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
            [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
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
  extra?: {
    isPhoto?: boolean;
    photoId?: string;
    location?: { latitude: number; longitude: number };
    platform?: 'telegram' | 'whatsapp';
    whatsappRecipient?: string;
    whatsappFrom?: string;
  },
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
      platform: extra?.platform,
      whatsappRecipient: extra?.whatsappRecipient,
      whatsappFrom: extra?.whatsappFrom,
    };
    await saveSession(freshSession, tenantId);
  }

  const session = await getSession(chatId, username, tenantId);
  if (extra?.platform) session.platform = extra.platform;
  if (extra?.whatsappRecipient) session.whatsappRecipient = extra.whatsappRecipient;
  if (extra?.whatsappFrom) session.whatsappFrom = extra.whatsappFrom;

  // Si la sesión expiró por superar los 45 minutos de inactividad
  if ((session as any).wasExpiredDueToInactivity) {
    delete (session as any).wasExpiredDueToInactivity;
    if (text.trim() !== '/start') {
      return {
        text: `⏰ *Tu sesión anterior ha expirado por inactividad (+45 minutos).*\n\nHemos reiniciado tu orden para garantizar la frescura de los platillos y disponibilidad de inventario.\n\n👇 *Selecciona una opción del menú para comenzar:*`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
            [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
            [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
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
            [{ text: '🙋 Encargado', callback_data: 'contact_manager' }]
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
  extra?: {
    isPhoto?: boolean;
    photoId?: string;
    location?: { latitude: number; longitude: number };
    platform?: 'telegram' | 'whatsapp';
    whatsappRecipient?: string;
    whatsappFrom?: string;
  },
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
      session.location = extra.location;

      // Obtener restaurante coords para geocercas
      const tenantSettings = await getTenantSettings(tenantId);
      const restaurantLat = tenantSettings.restaurant_lat ?? 3.2311;
      const restaurantLng = tenantSettings.restaurant_lng ?? -76.4167;

      // Calcular distancia Haversine
      const distance = calculateDistance(restaurantLat, restaurantLng, latitude, longitude);
      const maxDistance = tenantSettings.coverage_radius_km ?? 35;
      if (distance > maxDistance) {
        return {
          text: `⚠️ *Ubicación Lejana*\n\nTu ubicación se encuentra a *${distance.toFixed(1)} km* de nuestro local (cobertura habitual: ${maxDistance} km).\n\n¿Deseas continuar con esta ubicación o prefieres recoger en el local?`,
          reply_markup: {
            inline_keyboard: [
              [{ text: '📍 Continuar con esta ubicación', callback_data: 'use_gps_anyway' }],
              [{ text: '🏪 Voy a recoger en el local', callback_data: 'mode_pickup' }],
              [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
            ]
          }
        };
      }

      // Geocodificación inversa por Nominatim
      let reverseAddress = `Ubicación GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
          headers: { 'User-Agent': 'ChefFlow-Restaurant-Bot/1.0 (contact@chefflow.app)' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            const road = data.address?.road || data.address?.pedestrian || data.address?.suburb || '';
            const neighbourhood = data.address?.neighbourhood || data.address?.residential || '';
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
            const shortAddr = [road, neighbourhood, city].filter(Boolean).join(', ');
            reverseAddress = shortAddr || data.display_name.split(',').slice(0, 3).join(',');
          }
        }
      } catch (err) {
        console.warn('Reverse geocoding failed:', err);
      }

      session.deliveryMode = 'delivery';
      session.deliveryAddress = reverseAddress;
      return confirmOrderScreen(session, reverseAddress, tenantId);
    }

    let address = text.trim();
    // Detectar botón de teclado de recoger (reply keyboard envía texto, no callback)
    if (/recoger|pickup|voy a recoger|en el local/i.test(address)) {
      session.deliveryMode = 'pickup';
      session.deliveryAddress = 'Para Recoger en el local';
      return confirmOrderScreen(session, 'Para Recoger en el local', tenantId);
    }

    // Validar longitud mínima de la dirección
    if (address.length < 4) {
      return {
        text: `⚠️ La dirección es muy corta.\n\nPor favor escribe tu calle, carrera, avenida o barrio (ej: *Calle 15 con Carrera 4*):`,
      };
    }

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
    // se la concatenamos suavemente al final
    if (tenantSettings.coverage_city) {
      const cityNormalized = tenantSettings.coverage_city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const addressNormalized = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (!addressNormalized.includes(cityNormalized)) {
        address = `${address}, ${tenantSettings.coverage_city}`;
      }
    }

    session.deliveryMode = 'delivery';
    session.deliveryAddress = address;
    return confirmOrderScreen(session, address, tenantId);
  }

  // Si la sesión está en 'idle' pero el usuario envía un texto
  if (session.state === 'idle') {
    // Usar normalizeInput del InputValidator (consistente en todo el sistema)
    const rawText = normalizeInput(text);

    // Comandos de navegación por texto
    if (/^(ver\s+)?todo(\s+el)?\s*(men[uú]|carta)$|^todo$|^todos$|^(ver\s+)?todos\s+los\s+platos$/i.test(rawText)) {
      return menuScreen(tenantId, 'all');
    }
    if (['menu', 'ver menu', 'carta', 'ver carta', 'pedido', 'quiero pedir'].includes(rawText)) {
      return menuScreen(tenantId);
    }
    if (['carrito', 'mi carrito', 'ver carrito'].includes(rawText)) {
      return cartScreen(session);
    }
    if (/^(proceder\s+al\s+pago|pagar|pago|comprar|finalizar|hacer\s+pedido)$/i.test(rawText)) {
      if (session.cart.length === 0) return cartScreen(session);
      return paymentOptionsScreen(session, tenantId);
    }
    if (/^(vaciar\s+carrito|limpiar\s+carrito|vaciar\s+todo\s+el\s+carrito)$/i.test(rawText)) {
      session.cart = [];
      session.state = 'idle';
      return { text: '🗑️ Carrito vaciado.', reply_markup: { inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]] } };
    }
    if (['rastrear', 'rastrear pedido', 'donde esta mi pedido', 'estado'].includes(rawText)) {
      return promptTrackOrderScreen(session, tenantId);
    }
    if (['hola', 'buenas', 'buenos', 'hi', 'hello', 'start', '/start', 'saludos', 'buenas tardes', 'buenos dias', 'buenas noches', 'empezar'].some(w => rawText.startsWith(w) || rawText === w)) {
      return welcomeScreen(false, tenantId);
    }
    const cleanCmd = rawText.toLowerCase().trim();
    if (['carta', 'ver carta', 'pdf', 'ver pdf', 'menu pdf', 'carta pdf', 'descargar carta', 'la carta'].some(k => cleanCmd === k || cleanCmd.startsWith(k) || cleanCmd.endsWith(k) || cleanCmd.includes('carta') || cleanCmd.includes('pdf'))) {
      const settings = await getTenantSettings(tenantId);
      if (settings.menu_pdf_url) {
        return {
          text: `📄 *Carta Digital en PDF*\n\nAquí tienes nuestra carta completa con descripciones y precios adjunta.`,
          document_url: settings.menu_pdf_url,
          document_filename: 'Carta_Menu.pdf',
          document_caption: '📖 Aquí tienes nuestra carta completa en PDF con descripciones y precios.',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🍽️ Ver Menú Interactivo', callback_data: 'menu' }],
              [{ text: '🛒 Ver Carrito', callback_data: 'cart' }],
            ],
          },
        };
      }
    }
    return welcomeScreen(false, tenantId);
  }

  // Fallback para otros estados interactivos donde se espera una interacción con botones en lugar de texto
  const buttonOnlyStates = ['checkout_payment', 'awaiting_cancel_confirm'];
  if (buttonOnlyStates.includes(session.state)) {
    return {
      text: `👆 *Por favor, selecciona una de las opciones presionando los botones de arriba:*`,
    };
  }

  // Default
  return welcomeScreen(false, tenantId);
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
  botCredentials?: { botToken?: string; adminChatId?: string },
  extra?: {
    platform?: 'telegram' | 'whatsapp';
    whatsappRecipient?: string;
    whatsappFrom?: string;
  }
): Promise<BotResponse> {
  const session = await getSession(chatId, username, tenantId);
  if (extra?.platform) session.platform = extra.platform;
  if (extra?.whatsappRecipient) session.whatsappRecipient = extra.whatsappRecipient;
  if (extra?.whatsappFrom) session.whatsappFrom = extra.whatsappFrom;

  // Si la sesión expiró por superar los 45 minutos de inactividad
  if ((session as any).wasExpiredDueToInactivity) {
    delete (session as any).wasExpiredDueToInactivity;
    if (callbackData !== 'menu' && !callbackData.startsWith('cat:')) {
      return {
        text: `⏰ *Tu sesión anterior ha expirado por inactividad (+45 minutos).*\n\nHemos reiniciado tu orden para garantizar la frescura de los platillos y disponibilidad de inventario.\n\n👇 *Selecciona una opción del menú para comenzar:*`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú', callback_data: 'menu' }],
            [{ text: '📦 Rastrear Pedido', callback_data: 'track_prompt' }],
            [{ text: '🙋 Encargado', callback_data: 'contact_manager' }],
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
    callbackData === 'view_pdf_menu' ||
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
            [{ text: '🙋 Encargado', callback_data: 'contact_manager' }]
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
  if (callbackData === 'view_pdf_menu') {
    const settings = await getTenantSettings(tenantId);
    if (settings.menu_pdf_url) {
      return {
        text: `📄 *Carta Digital en PDF*\n\nAquí tienes nuestra carta completa con descripciones y precios adjunta.`,
        document_url: settings.menu_pdf_url,
        document_filename: 'Carta_Menu.pdf',
        document_caption: '📖 Aquí tienes nuestra carta completa en PDF con las descripciones y precios.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú Interactivo', callback_data: 'menu' }],
            [{ text: '🛒 Ver Carrito', callback_data: 'cart' }],
          ],
        },
      };
    } else {
      return {
        text: '⚠️ La carta en PDF aún no ha sido cargada. Puedes consultar el menú interactivo tocando el botón abajo:',
        reply_markup: {
          inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]],
        },
      };
    }
  }
  if (callbackData === 'use_gps_anyway') {
    const defaultAddr = session.location ? `Ubicación GPS (${session.location.latitude.toFixed(4)}, ${session.location.longitude.toFixed(4)})` : 'Ubicación GPS';
    session.deliveryMode = 'delivery';
    return confirmOrderScreen(session, defaultAddr, tenantId);
  }
  if (callbackData === 'pay') return paymentOptionsScreen(session, tenantId);
  if (callbackData === 'pay_cash') return cashAmountScreen(session, tenantId);
  if (callbackData === 'pay_digital') return digitalPaymentScreen(session, tenantId);
  if (callbackData === 'pay_ondelivery') return onDeliveryScreen(session);
  if (callbackData === 'recoger' || callbackData === 'mode_pickup') {
    session.deliveryMode = 'pickup';
    return confirmOrderScreen(session, 'Para Recoger en el local', tenantId);
  }
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
  if (callbackData === 'view_pdf_menu') {
    const settings = await getTenantSettings(tenantId);
    if (settings.menu_pdf_url) {
      return {
        text: `📄 *Carta Digital en PDF*\n\nAquí tienes nuestra carta completa con descripciones y precios adjunta.`,
        document_url: settings.menu_pdf_url,
        document_filename: 'Carta_Menu.pdf',
        document_caption: '📖 Aquí tienes nuestra carta completa en PDF con descripciones y precios.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍽️ Ver Menú Interactivo', callback_data: 'menu' }],
            [{ text: '🛒 Ver Carrito', callback_data: 'cart' }],
          ],
        },
      };
    }
    return {
      text: '⚠️ La carta en PDF no se encuentra configurada en este momento.',
      reply_markup: {
        inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]],
      },
    };
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
    const addIdx = parseInt(parts[0], 10);
    const qty = parseInt(parts[1]) || 1;
    const prodId = parts[2];
    let p = session.selectedProduct || session.pendingItem?.product;
    if (!p && prodId) {
      const { data } = await supabase.from('products').select('*').like('id', `${prodId}%`).limit(1).maybeSingle();
      if (data) {
        session.selectedProduct = data as Product;
        p = data as Product;
      }
    }
    const additions = (p?.additions || []).filter((a: AdditionItem) => a.is_available !== false);
    const addition = !isNaN(addIdx) && additions[addIdx]
      ? additions[addIdx]
      : (p?.additions || []).find((a: AdditionItem) => a.id === parts[0] || a.name === parts[0]);
    const additionName = addition?.name || 'Adición Extra';
    const additionPrice = addition?.price || 0;
    return addToCartAndConfirm(session, `Con adición: ${additionName}`, qty, p?.id || prodId, additionPrice);
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
 * por inactividad (15 min, 30 min) o libera carritos y cierra sesión a los 45 min.
 * Soporta tanto Telegram como WhatsApp de forma transparente.
 */
export async function checkInactivityAndSendReminders(defaultBotToken?: string): Promise<{ checked: number; remindersSent: number; expired: number }> {
  const now = Date.now();
  const REMINDER_1_MS = 15 * 60 * 1000; // 15 min
  const REMINDER_2_MS = 30 * 60 * 1000; // 30 min
  const TIMEOUT_MS = 45 * 60 * 1000;     // 45 min

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

    const isWhatsApp = session.platform === 'whatsapp' || !!session.whatsappRecipient || session.chatId > 10000000000;
    const name = session.customerName ? ` ${session.customerName}` : '';
    const itemCount = (session.cart || []).reduce((acc, i) => acc + i.quantity, 0);
    const subtotal = (session.cart || []).reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
    const cartInfo = (session.cart && session.cart.length > 0)
      ? `\n\n🛍️ *Tienes ${itemCount} producto(s) en tu pedido:* $${subtotal.toLocaleString('es-CO')}`
      : '';

    // 1. Primer Recordatorio (15 - 29.9 minutos)
    if (elapsed >= REMINDER_1_MS && elapsed < REMINDER_2_MS && !session.reminder1Sent) {
      session.reminder1Sent = true;
      const text = `🔔 *¡Hola${name}!* Notamos que tu pedido está en pausa.${cartInfo}\n\n¿Deseas retomar tu orden antes de que expire la sesión? Nuestros cocineros están listos para preparar tus platillos. 🍳`;
      const buttons = [
        { text: '🛒 Ver Carrito', callback_data: 'cart' },
        { text: '🍽️ Ver Menú', callback_data: 'menu' },
        { text: '🗑️ Vaciar Carrito', callback_data: 'clear_cart' },
      ];

      if (isWhatsApp) {
        try {
          const creds = await getTenantCreds(tenantId);
          const toTarget = session.whatsappRecipient || String(session.chatId);
          if (creds?.apiKey && toTarget) {
            const ok = await sendWhatsAppMessage({
              from: creds.phone || session.whatsappFrom || undefined,
              to: toTarget,
              text,
              buttons,
              apiKey: creds.apiKey,
            });
            if (ok) remindersSent++;
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Reminder 1 WA] Failed to send:`, (err as Error).message);
        }
      } else {
        try {
          let token = defaultBotToken || process.env.TELEGRAM_BOT_TOKEN;
          const { data: tSettings } = await supabase
            .from('tenant_settings')
            .select('telegram_bot_token')
            .eq('tenant_id', tenantId)
            .single();
          if (tSettings?.telegram_bot_token) token = tSettings.telegram_bot_token;

          if (token) {
            const botInstance = new Telegraf(token);
            await botInstance.telegram.sendMessage(session.chatId, text, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: buttons.map(b => [b]),
              },
            });
            remindersSent++;
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Reminder 1 TG] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
        }
      }
    }
    // 2. Segundo Recordatorio Urgente (30 - 44.9 minutos)
    else if (elapsed >= REMINDER_2_MS && elapsed < TIMEOUT_MS && !session.reminder2Sent) {
      session.reminder2Sent = true;
      const text = `⏳ *¡Tu pedido sigue esperando!*${cartInfo}\n\nTu sesión se cerrará automáticamente en *15 minutos* por inactividad para garantizar el stock de cocina. ¿Deseas confirmar tu orden ahora? 👇`;
      const buttons = [
        { text: '🛒 Finalizar Pedido', callback_data: 'cart' },
        { text: '🗑️ Cancelar Pedido', callback_data: 'clear_cart' },
      ];

      if (isWhatsApp) {
        try {
          const creds = await getTenantCreds(tenantId);
          const toTarget = session.whatsappRecipient || String(session.chatId);
          if (creds?.apiKey && toTarget) {
            const ok = await sendWhatsAppMessage({
              from: creds.phone || session.whatsappFrom || undefined,
              to: toTarget,
              text,
              buttons,
              apiKey: creds.apiKey,
            });
            if (ok) remindersSent++;
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Reminder 2 WA] Failed to send:`, (err as Error).message);
        }
      } else {
        try {
          let token = defaultBotToken || process.env.TELEGRAM_BOT_TOKEN;
          const { data: tSettings } = await supabase
            .from('tenant_settings')
            .select('telegram_bot_token')
            .eq('tenant_id', tenantId)
            .single();
          if (tSettings?.telegram_bot_token) token = tSettings.telegram_bot_token;

          if (token) {
            const botInstance = new Telegraf(token);
            await botInstance.telegram.sendMessage(session.chatId, text, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: buttons.map(b => [b]),
              },
            });
            remindersSent++;
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Reminder 2 TG] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
        }
      }
    }
    // 3. Expiración Definitiva (> 45 minutos)
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

      const text = `⏰ *Tu sesión ha expirado por inactividad (+45 min).*\n\nHemos liberado tu carrito para asegurar la disponibilidad de inventario. Cuando desees ordenar nuevamente, simplemente presiona el botón abajo o escribe *hola*. ¡Con gusto te atenderemos!`;
      const buttons = [
        { text: '🍽️ Ver Menú Principal', callback_data: 'menu' },
      ];

      if (isWhatsApp) {
        try {
          const creds = await getTenantCreds(tenantId);
          const toTarget = session.whatsappRecipient || String(session.chatId);
          if (creds?.apiKey && toTarget) {
            await sendWhatsAppMessage({
              from: creds.phone || session.whatsappFrom || undefined,
              to: toTarget,
              text,
              buttons,
              apiKey: creds.apiKey,
            });
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Expiry WA] Failed to send:`, (err as Error).message);
        }
      } else {
        try {
          let token = defaultBotToken || process.env.TELEGRAM_BOT_TOKEN;
          const { data: tSettings } = await supabase
            .from('tenant_settings')
            .select('telegram_bot_token')
            .eq('tenant_id', tenantId)
            .single();
          if (tSettings?.telegram_bot_token) token = tSettings.telegram_bot_token;

          if (token) {
            const botInstance = new Telegraf(token);
            await botInstance.telegram.sendMessage(session.chatId, text, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: buttons.map(b => [b]),
              },
            });
            await saveSession(session, tenantId);
          }
        } catch (err) {
          console.warn(`[Inactivity Expiry TG] Failed to send to chatId ${session.chatId}:`, (err as Error).message);
        }
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
