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
  | 'contacting_manager';

export interface BotSession {
  chatId: number;
  state: BotState;
  cart: OrderItem[];
  selectedProduct?: Product;
  pendingItem?: { product: Product; quantity: number };
  paymentMethod?: 'cash' | 'transfer';
  paymentStatus?: 'pending' | 'paid';
  changeAmount?: number;
  customerName?: string;
}

export interface BotResponse {
  text: string;
  reply_markup?: object;
}

// ─── Session Store ────────────────────────────────────────────────────────────

const globalSessions = (
  (globalThis as Record<string, unknown>).botSessions as Record<number, BotSession>
) || {};
(globalThis as Record<string, unknown>).botSessions = globalSessions;

function getSession(chatId: number, username: string): BotSession {
  if (!globalSessions[chatId]) {
    globalSessions[chatId] = { chatId, state: 'idle', cart: [], customerName: username };
  }
  return globalSessions[chatId];
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

function welcomeScreen(): BotResponse {
  return {
    text: `👋 ¡Bienvenido a *ChefFlow*! 🍔\n\n¿En qué te puedo ayudar hoy?`,
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

async function menuScreen(): Promise<BotResponse> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('is_available', true);

  if (error || !data || data.length === 0) {
    return { text: '⚠️ No hay productos disponibles en este momento. Intenta más tarde.' };
  }

  const products = data as { id: string; name: string; price: number }[];
  const buttons = products.map(p => [
    { text: `${p.name}  •  $${p.price.toLocaleString('es-CO')}`, callback_data: `product:${p.id}` },
  ]);
  buttons.push([{ text: '🛒 Ver Carrito', callback_data: 'cart' }]);

  return {
    text: '🍽️ *Nuestro Menú*\n\nToca un producto para agregarlo a tu pedido:',
    reply_markup: { inline_keyboard: buttons },
  };
}

async function productScreen(session: BotSession, productId: string): Promise<BotResponse> {
  const { data } = await supabase.from('products').select('*').eq('id', productId).single();
  if (!data) return { text: '❌ Producto no encontrado. Vuelve al menú.' };

  session.selectedProduct = data as Product;
  session.state = 'selecting_quantity';
  const p = data as Product;

  return {
    text: `*${p.name}*\n💰 Precio: $${p.price.toLocaleString('es-CO')} c/u\n\n¿Cuántas unidades deseas?`,
    reply_markup: {
      inline_keyboard: [
        [1, 2, 3].map(n => ({ text: `${n}`, callback_data: `qty:${n}` })),
        [4, 5, 6].map(n => ({ text: `${n}`, callback_data: `qty:${n}` })),
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
  return {
    text: `🛒 *Tu Carrito*\n\n${cartSummaryText(session.cart)}\n\n💰 *TOTAL: $${total.toLocaleString('es-CO')}*`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Seguir comprando', callback_data: 'menu' }],
        [{ text: '💳 Proceder al Pago', callback_data: 'pay' }],
        [{ text: '🗑️ Vaciar carrito', callback_data: 'clear_cart' }],
      ],
    },
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
        [{ text: '📱 Nequi / Daviplata / Transferencia', callback_data: 'pay_digital' }],
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
  const payId = Math.random().toString(36).slice(2, 10).toUpperCase();
  session.paymentMethod = 'transfer';
  session.paymentStatus = 'paid';
  session.state = 'checkout_address';

  return {
    text: `📱 *Pago Digital*\n\n🔗 Enlace de pago:\nhttps://pay.breve.link/${payId}\n\n✅ Realiza el pago y luego indica tu dirección de entrega:\n\nO toca el botón si prefieres recoger:`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }],
        [{ text: '↩️ Cancelar pedido', callback_data: 'menu' }]
      ],
    },
  };
}

async function confirmOrderScreen(session: BotSession, address: string): Promise<BotResponse> {
  if (session.cart.length === 0) return welcomeScreen();

  const total = cartTotal(session.cart);
  const orderId = crypto.randomUUID();
  const shortId = 'T-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  
  let notes = `[ID: ${shortId}] [Cliente: ${session.customerName}]`;
  if (session.paymentMethod === 'cash' && session.changeAmount !== undefined) {
    notes += ` | [EFECTIVO] Devuelta: $${session.changeAmount.toLocaleString('es-CO')}`;
  }

  // 1. Crear la orden
  const { error: orderError } = await supabase.from('orders').insert([
    {
      id: orderId,
      tenant_id: 'a0000000-0000-4000-8000-000000000001',
      branch_id: 'b0000000-0000-4000-8000-000000000001',
      customer_id: 'd1000000-0000-4000-8000-000000000001',
      type: /recoger|mesa|pickup/i.test(address) ? 'dine_in' : 'delivery',
      status: 'pending',
      payment_method: session.paymentMethod || 'cash',
      subtotal: total,
      total,
      delivery_fee: 0,
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

  // Reset session
  session.cart = [];
  session.state = 'idle';
  session.paymentMethod = undefined;
  session.paymentStatus = undefined;
  session.changeAmount = undefined;

  return {
    text: `🎉 *¡Pedido Confirmado!*\n\n📋 Código de seguimiento: *${shortId}*\n📍 Dirección: ${address}\n💰 Total: *$${total.toLocaleString('es-CO')}*\n\n¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Rastrear mi pedido', callback_data: 'track_prompt' }],
        [{ text: '🏠 Hacer otro pedido', callback_data: 'menu' }]
      ],
    },
  };
}

function promptTrackOrderScreen(session: BotSession): BotResponse {
  session.state = 'tracking_order';
  return {
    text: '📦 *Rastrear Pedido*\n\n✏️ Por favor, escribe el código de seguimiento de tu pedido (Ej: *T-A1B2*):',
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
    .select('status, created_at')
    .ilike('notes', `%[ID: ${cleanCode}]%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return {
      text: `❌ No encontramos ningún pedido con el código *${cleanCode}*.\nPor favor verifica e intenta de nuevo.`,
      reply_markup: { inline_keyboard: [[{ text: '📦 Intentar de nuevo', callback_data: 'track_prompt' }], [{ text: '🏠 Menú principal', callback_data: 'menu' }]] }
    };
  }

  const statusMap: Record<string, string> = {
    'pending': '⏳ Pendiente (Esperando confirmación)',
    'confirmed': '✅ Confirmado (En cola)',
    'preparing': '🍳 En preparación (Cocinando)',
    'ready': '🛍️ Listo para entregar',
    'shipping': '🛵 En camino (Repartidor asignado)',
    'delivered': '🎉 Entregado',
    'cancelled': '❌ Cancelado'
  };

  const statusText = statusMap[data[0].status] || data[0].status;

  return {
    text: `📦 *Estado de tu pedido (${cleanCode})*\n\nEstado actual:\n👉 *${statusText}*`,
    reply_markup: {
      inline_keyboard: [[{ text: '🔄 Actualizar estado', callback_data: `track:${cleanCode}` }], [{ text: '🏠 Menú principal', callback_data: 'menu' }]],
    },
  };
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
  username: string
): Promise<BotResponse> {
  if (text.trim() === '/start') {
    delete globalSessions[chatId];
    return welcomeScreen();
  }

  const session = getSession(chatId, username);

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

  if (session.state === 'tracking_order') {
    return handleTrackOrder(session, text.trim());
  }

  if (session.state === 'checkout_cash_amount') {
    return handleCashAmount(session, text.trim());
  }

  if (session.state === 'checkout_address') {
    return confirmOrderScreen(session, text.trim());
  }

  // Default
  return welcomeScreen();
}

export async function processCallback(
  chatId: number,
  callbackData: string,
  username: string
): Promise<BotResponse> {
  const session = getSession(chatId, username);

  if (callbackData === 'menu') return menuScreen();
  if (callbackData === 'cart') return cartScreen(session);
  if (callbackData === 'pay') return paymentOptionsScreen(session);
  if (callbackData === 'pay_cash') return cashAmountScreen(session);
  if (callbackData === 'pay_digital') return digitalPaymentScreen(session);
  if (callbackData === 'recoger') return confirmOrderScreen(session, 'Para Recoger en el local');
  if (callbackData === 'clear_cart') {
    session.cart = [];
    session.state = 'idle';
    return { text: '🗑️ Carrito vaciado.', reply_markup: { inline_keyboard: [[{ text: '🍽️ Ver Menú', callback_data: 'menu' }]] } };
  }
  if (callbackData === 'track_prompt') return promptTrackOrderScreen(session);
  if (callbackData === 'contact_manager') return contactManagerScreen(session);
  if (callbackData.startsWith('track:')) return handleTrackOrder(session, callbackData.replace('track:', ''));
  if (callbackData === 'skip_note') return addToCartAndConfirm(session);
  
  if (callbackData.startsWith('product:')) {
    return productScreen(session, callbackData.replace('product:', ''));
  }
  if (callbackData.startsWith('qty:')) {
    return askItemNoteScreen(session, parseInt(callbackData.replace('qty:', '')));
  }

  return welcomeScreen();
}
