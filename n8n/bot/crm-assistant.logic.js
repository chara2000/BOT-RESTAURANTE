// Lógica del bot CRM — se inyecta en nodo n8n "Bot ChefFlow"
// Placeholders __SB__, __KEY__, __TENANT__ se reemplazan al desplegar

const enriched = $('Unir Contexto Pedidos').first().json;
const {
  menu = [], categories = [], promotions = [], chatId, userName, userText,
  customer = null, activeOrders = [], lastOrder = null, deliveryFee = 5000,
} = enriched;

const text = (userText || '').trim();
const input = text.toLowerCase();
const SB = '__SB__';
const KEY = '__KEY__';
const TENANT = '__TENANT__';

const STATUS = {
  pending: { label: '📥 Pedido recibido', eta: '45-60 min' },
  confirmed: { label: '✅ Confirmado', eta: '40-50 min' },
  preparing: { label: '👨‍🍳 En preparación', eta: '30-40 min' },
  ready: { label: '📦 Listo para entrega', eta: '15-20 min' },
  shipping: { label: '🛵 En camino', eta: '10-15 min' },
  delivered: { label: '✔️ Entregado', eta: '—' },
  cancelled: { label: '❌ Cancelado', eta: '—' },
};

const PAY = { '1': 'cash', '2': 'nequi', '3': 'daviplata', '4': 'card' };
const PAY_LABEL = { cash: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', card: 'Tarjeta' };

const staticData = $getWorkflowStaticData('global');
if (!staticData.sessions) staticData.sessions = {};

const defaultSession = () => ({
  screen: 'main', cart: [], address: null, payment: null,
  categoryId: null, suggested: false, awaitingHuman: false,
});

let session = staticData.sessions[chatId] || defaultSession();
let reply = '';
let orderData = null;
let updateCustomerAddress = null;

function fmt(n) { return '$' + Number(n).toLocaleString('es-CO'); }
function orderNum(id) { return '#' + String(id).slice(0, 8).toUpperCase(); }

function welcome(isReturning) {
  if (isReturning && lastOrder?.order_items?.length) {
    const items = lastOrder.order_items.map(i => (i.products?.name || 'producto') + ' x' + i.quantity).join('\n');
    return '👋 ¡Qué bueno verte de nuevo, ' + userName + '! 😊\n\nVeo que antes pediste:\n' + items + '\n\n¿Deseas repetir ese pedido?\n1️⃣ Sí, repetir pedido\n2️⃣ Algo diferente\n0️⃣ Menú principal';
  }
  return '👋 ¡Hola! Bienvenido(a) a nuestro restaurante.\n\nEstoy aquí para ayudarte con:\n\n🍔 Realizar pedidos\n📋 Consultar nuestro menú\n🚚 Estado de tu pedido\n🎁 Promociones\n📍 Actualizar dirección\n\n*Menú rápido:*\n1️⃣ Hacer pedido\n2️⃣ Ver menú\n3️⃣ Estado del pedido\n4️⃣ Promociones\n5️⃣ Cambiar dirección\n6️⃣ Hablar con un asesor\n\n0️⃣ Volver aquí\n\n¿En qué puedo ayudarte?';
}

function mainMenu() { return welcome(!!customer?.order_count); }

function categoryMenu() {
  if (!categories.length) return productMenu();
  let s = '¿Te apetece algo de estas categorías?\n\n';
  categories.forEach((c, i) => { s += (i + 1) + '. ' + c.name + '\n'; });
  s += '\n0️⃣ Menú principal\n_Escribe el número de categoría_';
  return s;
}

function productMenu(catId) {
  const list = catId ? menu.filter(p => p.category_id === catId) : menu;
  if (!list.length) return 'No hay productos en esta categoría.\n\n' + categoryMenu();
  let s = '📋 *Menú* — elige por número\n\n';
  list.forEach((p, i) => {
    s += (i + 1) + '. ' + p.name + ' — ' + fmt(p.price) + '\n';
  });
  s += '\n0️⃣ Volver';
  session._productList = list.map(p => p.id);
  return s;
}

function cartSummary() {
  if (!session.cart.length) return '';
  return session.cart.map(i => '🍽 ' + i.name + ' x' + i.quantity).join('\n');
}

function cartTotal() {
  return session.cart.reduce((a, i) => a + Number(i.price) * i.quantity, 0);
}

function upsell(productName) {
  const n = (productName || '').toLowerCase();
  const bebidas = menu.filter(p => /limonada|bebida|coca|gaseosa|jugo/i.test(p.name));
  if (/hamburguesa|burger|pizza/.test(n) && bebidas.length) {
    const b = bebidas.slice(0, 2);
    return '\n\n💡 Muchos clientes lo acompañan con:\n' + b.map(p => '🥤 ' + p.name + ' — ' + fmt(p.price)).join('\n') + '\n\n¿Te gustaría agregar alguno? (número o *2* para continuar)';
  }
  return '';
}

function afterAddMsg(product) {
  session.suggested = !session.suggested;
  let s = 'Perfecto ✅\n\nHe agregado:\n\n🍽 ' + product.name + ' x1\n\n*Tu carrito:*\n' + cartSummary();
  s += '\n\nTotal parcial: ' + fmt(cartTotal());
  if (!session.suggested) s += upsell(product.name);
  else s += '\n\n1️⃣ Agregar otro producto\n2️⃣ Continuar con el pedido\n0️⃣ Cancelar carrito';
  session.screen = 'cart';
  return s;
}

function confirmSummary() {
  const sub = cartTotal();
  const total = sub + deliveryFee;
  const addr = session.address || customer?.address_default || '(sin dirección)';
  const pay = session.payment ? PAY_LABEL[session.payment] : '(sin definir)';
  return '📋 *Resumen de tu pedido*\n\n' + cartSummary() + '\n\nSubtotal: ' + fmt(sub) + '\nDomicilio: ' + fmt(deliveryFee) + '\n*Total: ' + fmt(total) + '*\n\n📍 Dirección: ' + addr + '\n💳 Pago: ' + pay + '\n\n¿Confirmas?\n1️⃣ Confirmar\n2️⃣ Modificar pedido\n0️⃣ Cancelar';
}

function formatTracking(orders) {
  if (!orders.length) {
    return '📭 No tienes pedidos activos en este momento.\n\nCuando hagas un pedido, podrás ver el avance aquí (sincronizado con nuestro sistema).\n\n1️⃣ Hacer pedido\n0️⃣ Menú principal';
  }
  let s = '🚚 *Estado de tu pedido*\n\n';
  orders.forEach((o, i) => {
    const st = STATUS[o.status] || { label: o.status, eta: '—' };
    const items = (o.order_items || []).map(it => it.quantity + 'x ' + (it.products?.name || '')).join(', ');
    s += 'Pedido ' + orderNum(o.id) + '\n';
    s += 'Estado: ' + st.label + '\n';
    s += 'Tiempo estimado: ' + st.eta + '\n';
    s += 'Total: ' + fmt(o.total) + '\n';
    if (items) s += 'Items: ' + items + '\n';
    s += '\n';
  });
  s += 'Te avisaremos cuando haya una actualización.\n\n0️⃣ Menú principal';
  return s;
}

function formatPromos() {
  if (!promotions.length) {
    return '🎁 Por ahora no hay promociones activas.\n\nVuelve pronto o escribe *1* para ver el menú.\n0️⃣ Menú principal';
  }
  let s = '🎁 *Promociones disponibles*\n\n';
  promotions.forEach(p => {
    const val = p.discount_type === 'percentage' ? p.discount_value + '%' : fmt(p.discount_value);
    s += '• ' + p.name + ' — ' + val + ' de descuento\n';
    if (p.description) s += '  _' + p.description + '_\n';
  });
  s += '\n¿Te gustaría aprovechar alguna? Escribe *1* para pedir.\n0️⃣ Menú principal';
  return s;
}

function indecisiveHelp() {
  return 'Con gusto te ayudo 😊\n\n¿Qué prefieres?\n\n1️⃣ Algo ligero\n2️⃣ Algo contundente\n3️⃣ Pollo / carne / vegetariano\n4️⃣ Para compartir\n0️⃣ Menú principal';
}

function addToCart(productId) {
  const p = menu.find(x => x.id === productId);
  if (!p) return false;
  const ex = session.cart.find(i => i.product_id === p.id);
  if (ex) ex.quantity += 1;
  else session.cart.push({ product_id: p.id, quantity: 1, name: p.name, price: p.price });
  return p;
}

async function logChat(direction, content) {
  try {
    await this.helpers.httpRequest({
      method: 'POST', url: SB + '/rest/v1/chat_messages',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: { tenant_id: TENANT, customer_id: customer?.id || null, channel: 'telegram', direction, content },
      json: true,
    });
  } catch (e) {}
}

async function saveAddress(addr) {
  if (!customer?.id) return;
  try {
    await this.helpers.httpRequest({
      method: 'PATCH', url: SB + '/rest/v1/customers?id=eq.' + customer.id,
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: { address_default: addr, updated_at: new Date().toISOString() },
      json: true,
    });
  } catch (e) {}
}

// --- Escalada / quejas ---
if (/supervisor|asesor|humano|persona real|reclamo|reembolso|devoluc/.test(input)) {
  session.awaitingHuman = true;
  reply = 'Entiendo. Voy a transferir tu caso a uno de nuestros asesores para brindarte una mejor atención.\n\nMientras tanto, cuéntame brevemente qué ocurrió y lo dejaré registrado.';
} else if (/queja|molesto|mal servicio|problema con|llegó mal|tarde/.test(input) && session.screen === 'main') {
  reply = 'Lamento mucho la situación 🙏\n\nVoy a revisar tu caso de inmediato.\n\n3️⃣ Ver estado de tu pedido\n6️⃣ Hablar con un asesor\n0️⃣ Menú principal';
} else if (session.awaitingHuman) {
  reply = 'Gracias por la información. Un asesor revisará tu caso pronto.\n\n0️⃣ Menú principal';
  session.awaitingHuman = false;
} else if (input === '0' || input === '/start' || input === 'menu' || input === 'inicio') {
  session = defaultSession();
  reply = mainMenu();
} else if (session.screen === 'main') {
  if (input === '1' || /pedir|ordenar|comprar|quiero/.test(input)) {
    session.screen = 'order_start';
    reply = '¡Perfecto! 😊\n\n¿Qué te gustaría ordenar?\n\n1️⃣ Ver categorías\n2️⃣ Ver menú completo\n0️⃣ Volver';
  } else if (input === '2' || /menú|menu|carta/.test(input)) {
    session.screen = 'categories';
    reply = categoryMenu();
  } else if (input === '3' || /estado|seguimiento|donde|rastreo/.test(input)) {
    session.screen = 'tracking';
    reply = formatTracking(activeOrders);
  } else if (input === '4' || /promo|descuento|oferta/.test(input)) {
    session.screen = 'promotions';
    reply = formatPromos();
  } else if (input === '5' || /direcci/.test(input)) {
    session.screen = 'address_update';
    const cur = customer?.address_default ? '\n\nDirección actual: ' + customer.address_default : '';
    reply = 'Claro 📍\n\nEnvíame tu nueva dirección completa (calle, número, barrio).' + cur;
  } else if (input === '6' || /ayuda|help/.test(input)) {
    reply = 'ℹ️ Puedo ayudarte con pedidos, menú, estado y promociones.\n\nEscribe *6* o *asesor* para hablar con una persona.\n\n0️⃣ Menú principal';
  } else if (input === '1' && customer?.order_count && lastOrder) {
    // handled below in repeat
    reply = mainMenu();
  } else if (/no sé|indeciso|recomienda|suger/.test(input)) {
    session.screen = 'indecisive';
    reply = indecisiveHelp();
  } else {
    reply = mainMenu();
  }
} else if (session.screen === 'repeat_offer') {
  if (input === '1' && lastOrder?.order_items) {
    session.cart = lastOrder.order_items.map(it => ({
      product_id: it.product_id || it.products?.id,
      quantity: it.quantity,
      name: it.products?.name || 'Producto',
      price: it.unit_price || it.products?.price || 0,
    })).filter(i => i.product_id);
    session.screen = session.address || customer?.address_default ? 'payment' : 'address';
    reply = session.screen === 'payment'
      ? '💳 *Forma de pago*\n\n1️⃣ Efectivo\n2️⃣ Nequi\n3️⃣ Daviplata\n4️⃣ Tarjeta\n0️⃣ Cancelar'
      : '📍 ¿A qué dirección enviamos? (o usa la guardada: ' + (customer?.address_default || 'ninguna') + ')';
  } else {
    session.screen = 'order_start';
    reply = '¡Perfecto! 😊\n\n1️⃣ Ver categorías\n2️⃣ Ver menú completo\n0️⃣ Volver';
  }
} else if (session.screen === 'order_start') {
  if (input === '1') { session.screen = 'categories'; reply = categoryMenu(); }
  else if (input === '2') { session.screen = 'products'; session.categoryId = null; reply = productMenu(); }
  else { session.screen = 'main'; reply = mainMenu(); }
} else if (session.screen === 'categories') {
  const n = parseInt(input, 10);
  if (n >= 1 && n <= categories.length) {
    session.categoryId = categories[n - 1].id;
    session.screen = 'products';
    reply = productMenu(session.categoryId);
  } else { session.screen = 'main'; reply = mainMenu(); }
} else if (session.screen === 'products') {
  const n = parseInt(input, 10);
  const list = session._productList
    ? menu.filter(p => session._productList.includes(p.id))
    : (session.categoryId ? menu.filter(p => p.category_id === session.categoryId) : menu);
  if (n >= 1 && n <= list.length) {
    reply = afterAddMsg(addToCart(list[n - 1].id));
  } else if (input === '0') {
    session.screen = 'main'; reply = mainMenu();
  } else {
    reply = 'Opción no válida.\n\n' + productMenu(session.categoryId);
  }
} else if (session.screen === 'cart') {
  if (input === '2' || /continuar|listo|siguiente/.test(input)) {
    if (!session.cart.length) { reply = 'Tu carrito está vacío.\n\n1️⃣ Ver menú'; session.screen = 'order_start'; }
    else {
      session.screen = 'address';
      const saved = customer?.address_default;
      reply = saved
        ? '📍 ¿Usamos esta dirección?\n\n*' + saved + '*\n\n1️⃣ Sí, usar esta\n2️⃣ Escribir otra\n0️⃣ Cancelar'
        : '📍 Por favor envía tu dirección completa de entrega:';
    }
  } else if (input === '1') {
    session.screen = 'products'; reply = productMenu(session.categoryId);
  } else {
    const n = parseInt(input, 10);
    const upsellList = menu.filter(p => /limonada|bebida|coca|gaseosa/i.test(p.name));
    if (n >= 1 && n <= upsellList.length) reply = afterAddMsg(addToCart(upsellList[n - 1].id));
    else reply = '1️⃣ Agregar otro | 2️⃣ Continuar | 0️⃣ Cancelar\n\n' + cartSummary();
  }
} else if (session.screen === 'address') {
  if (input === '1' && customer?.address_default) {
    session.address = customer.address_default;
    session.screen = 'payment';
    reply = '💳 *Forma de pago*\n\n1️⃣ Efectivo\n2️⃣ Nequi\n3️⃣ Daviplata\n4️⃣ Tarjeta\n0️⃣ Cancelar';
  } else if (input === '2' || (userText.length >= 8 && input !== '1')) {
    session.address = input === '2' ? null : userText.trim();
    if (!session.address && input === '2') {
      reply = '📍 Escribe tu dirección completa:';
    } else {
      session.screen = 'payment';
      reply = '💳 *Forma de pago*\n\n1️⃣ Efectivo\n2️⃣ Nequi\n3️⃣ Daviplata\n4️⃣ Tarjeta\n0️⃣ Cancelar';
    }
  } else {
    reply = '📍 Necesito calle, número y barrio (mínimo 8 caracteres):';
  }
} else if (session.screen === 'payment') {
  if (PAY[input]) {
    session.payment = PAY[input];
    session.screen = 'confirm';
    reply = confirmSummary();
  } else if (input === '0') { session = defaultSession(); reply = mainMenu(); }
  else reply = 'Elige 1, 2, 3 o 4.\n\n💳 Forma de pago:\n1 Efectivo | 2 Nequi | 3 Daviplata | 4 Tarjeta';
} else if (session.screen === 'confirm') {
  if (input === '1' || /confirmar|si|sí/.test(input)) {
    const sub = cartTotal();
    orderData = {
      items: session.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      address: session.address || customer?.address_default,
      payment_method: session.payment,
      customer_name: userName,
      telegram_chat_id: chatId,
    };
    if (session.address) updateCustomerAddress = session.address;
    reply = '🎉 ¡Pedido confirmado!\n\nEstado: 📥 Pedido recibido\n\nTe avisaremos cuando avance.\nEscribe *3* para ver el seguimiento.\n0️⃣ Menú principal';
    session = defaultSession();
  } else if (input === '2' || /modificar/.test(input)) {
    session.screen = 'products'; session.suggested = false;
    reply = '✏️ Modifica tu pedido:\n\n' + productMenu(session.categoryId);
  } else { session = defaultSession(); reply = 'Pedido cancelado.\n\n' + mainMenu(); }
} else if (session.screen === 'tracking') {
  reply = formatTracking(activeOrders);
  if (input === '1') { session.screen = 'order_start'; reply = '¡Perfecto! 😊\n\n1️⃣ Categorías\n2️⃣ Menú completo\n0️⃣ Volver'; }
  else if (input !== '0') { /* keep tracking */ }
  else { session.screen = 'main'; reply = mainMenu(); }
} else if (session.screen === 'promotions') {
  if (input === '1') {
    session.screen = 'order_start';
    reply = '¡Perfecto! 😊\n\n1️⃣ Categorías\n2️⃣ Menú completo\n0️⃣ Volver';
  } else if (input === '0') {
    session.screen = 'main';
    reply = mainMenu();
  } else {
    reply = formatPromos();
  }
} else if (session.screen === 'address_update') {
  if (userText.length >= 8) {
    updateCustomerAddress = userText.trim();
    session.screen = 'main';
    reply = '✅ Dirección actualizada correctamente.\n\n📍 ' + updateCustomerAddress + '\n\n0️⃣ Menú principal';
  } else reply = '📍 Envía la dirección completa (calle, número, barrio):';
} else if (session.screen === 'indecisive') {
  const n = parseInt(input, 10);
  let filtered = menu;
  if (n === 1) filtered = menu.filter(p => /ensalada|limonada|ligero/i.test(p.name + p.description));
  else if (n === 2) filtered = menu.filter(p => /hamburguesa|pizza|premium/i.test(p.name));
  else if (n === 3) filtered = menu;
  else if (n === 4) filtered = menu.filter(p => /pizza|combo/i.test(p.name));
  if (n >= 1 && n <= 4 && filtered.length) {
    session.screen = 'products';
    session._productList = filtered.map(p => p.id);
    let s = 'Te recomiendo:\n\n';
    filtered.slice(0, 5).forEach((p, i) => { s += (i + 1) + '. ' + p.name + ' — ' + fmt(p.price) + '\n'; });
    s += '\n0️⃣ Menú principal';
    reply = s;
  } else reply = indecisiveHelp();
} else {
  session.screen = 'main';
  reply = mainMenu();
}

// Cliente recurrente al /start
if ((input === '/start' || input === 'hola') && customer?.order_count > 0 && lastOrder && session.screen === 'main' && !session.cart.length) {
  session.screen = 'repeat_offer';
  const items = lastOrder.order_items?.map(i => '🍽 ' + (i.products?.name || '') + ' x' + i.quantity).join('\n') || '';
  reply = '👋 ¡Qué bueno verte de nuevo, ' + userName + '! 😊\n\nTu último pedido:\n' + items + '\n\n1️⃣ Repetir pedido\n2️⃣ Algo diferente\n0️⃣ Menú principal';
}

await logChat.call(this, 'inbound', text, customer?.id);
await logChat.call(this, 'outbound', reply, customer?.id);
if (updateCustomerAddress) await saveAddress.call(this, updateCustomerAddress);

if (!orderData) staticData.sessions[chatId] = session;

return [{ json: { reply, orderData, chatId, userName, menu, updateCustomerAddress } }];
