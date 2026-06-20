import { createClient } from '@supabase/supabase-js';
import type { OrderItem, Product } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotState =
  | 'idle'
  | 'selecting_quantity'
  | 'checkout_cash_amount'
  | 'checkout_address';

export interface BotSession {
  chatId: number;
  state: BotState;
  cart: OrderItem[];
  selectedProduct?: Product;
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
    .map((i, idx) => `${idx + 1}. *${i.product.name}* x${i.quantity} — $${(i.unit_price * i.quantity).toLocaleString('es-CO')}`)
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

async function addToCartAndConfirm(session: BotSession, qty: number): Promise<BotResponse> {
  if (!session.selectedProduct) return welcomeScreen();
  const product = session.selectedProduct;

  const existing = session.cart.find(i => i.product.id === product.id);
  if (existing) existing.quantity += qty;
  else
    session.cart.push({
      id: Math.random().toString(36).slice(2),
      product,
      quantity: qty,
      unit_price: product.price,
    });

  session.state = 'idle';
  session.selectedProduct = undefined;
  const total = cartTotal(session.cart);

  return {
    text: `✅ ¡Agregado!\n*${qty}x ${product.name}*\n\n🛒 Total del carrito: *$${total.toLocaleString('es-CO')}*`,
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
      ],
    },
  };
}

function cashAmountScreen(session: BotSession): BotResponse {
  session.state = 'checkout_cash_amount';
  const total = cartTotal(session.cart);
  return {
    text: `💵 *Pago en Efectivo*\n\nTotal: *$${total.toLocaleString('es-CO')}*\n\n✏️ Escribe el valor del billete con el que vas a pagar\n_(ej: 50000)_`,
  };
}

function handleCashAmount(session: BotSession, text: string): BotResponse {
  const amount = parseFloat(text.replace(/[.$,\s]/g, ''));
  const total = cartTotal(session.cart);

  if (isNaN(amount) || amount <= 0) {
    return { text: '⚠️ Por favor ingresa un valor numérico válido (ej: 50000).' };
  }
  if (amount < total) {
    return {
      text: `⚠️ El billete de *$${amount.toLocaleString('es-CO')}* no alcanza.\nEl total es *$${total.toLocaleString('es-CO')}*.\n\nIngresa un billete más grande:`,
    };
  }

  session.changeAmount = amount - total;
  session.paymentMethod = 'cash';
  session.paymentStatus = 'pending';
  session.state = 'checkout_address';

  return {
    text: `✅ ¡Listo! Le devolveremos *$${session.changeAmount.toLocaleString('es-CO')}* de cambio.\n\n📍 ¿A dónde enviamos tu pedido?\n\nEscribe tu dirección o toca el botón si vas a recoger:`,
    reply_markup: {
      inline_keyboard: [[{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }]],
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
      inline_keyboard: [[{ text: '🏪 Voy a recoger en el local', callback_data: 'recoger' }]],
    },
  };
}

async function confirmOrderScreen(session: BotSession, address: string): Promise<BotResponse> {
  if (session.cart.length === 0) return welcomeScreen();

  const total = cartTotal(session.cart);
  const orderId = 'T-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  let notes = '';
  if (session.paymentMethod === 'cash' && session.changeAmount !== undefined) {
    notes = `[EFECTIVO] Devuelta: $${session.changeAmount.toLocaleString('es-CO')}`;
  }

  const { error } = await supabase.from('orders').insert([
    {
      id: orderId,
      type: /recoger|mesa|pickup/i.test(address) ? 'dine_in' : 'delivery',
      status: 'pending',
      payment_method: session.paymentMethod || 'cash',
      payment_status: session.paymentStatus || 'pending',
      subtotal: total,
      total,
      delivery_fee: 0,
      tips: 0,
      delivery_address: address,
      notes: notes.trim(),
      items: session.cart,
      customer: { name: session.customerName },
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error('Error Supabase:', error);
    return { text: `❌ Error al guardar el pedido: ${error.message}` };
  }

  // Reset session
  session.cart = [];
  session.state = 'idle';
  session.paymentMethod = undefined;
  session.paymentStatus = undefined;
  session.changeAmount = undefined;

  return {
    text: `🎉 *¡Pedido Confirmado!*\n\n📋 ID: *${orderId}*\n📍 Dirección: ${address}\n💰 Total: *$${total.toLocaleString('es-CO')}*\n\n¡Gracias! Lo estamos preparando con mucho cariño 🍔❤️`,
    reply_markup: {
      inline_keyboard: [[{ text: '🏠 Hacer otro pedido', callback_data: 'menu' }]],
    },
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
    if (!isNaN(qty) && qty >= 1 && qty <= 20) return addToCartAndConfirm(session, qty);
    return { text: '⚠️ Ingresa un número entre 1 y 20.' };
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
  if (callbackData.startsWith('product:')) {
    return productScreen(session, callbackData.replace('product:', ''));
  }
  if (callbackData.startsWith('qty:')) {
    return addToCartAndConfirm(session, parseInt(callbackData.replace('qty:', '')));
  }

  return welcomeScreen();
}
