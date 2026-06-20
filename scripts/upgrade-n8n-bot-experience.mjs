/**
 * Mejora experiencia bot Telegram + notificaciones estado (WF 01 + WF 02)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '..', '.env.local');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

async function mcpCall(token, tool, args) {
  const res = await fetch('https://juanchara.app.n8n.cloud/mcp-server/http', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) throw new Error(`MCP sin respuesta: ${text.slice(0, 400)}`);
  const payload = JSON.parse(dataLine.slice(6));
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const content = payload.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : payload.result;
}

const env = loadEnv();
const token = env.N8N_MCP_TOKEN;
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://jeuvobmjhuyskxepdbmt.supabase.co';
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN;
const TENANT = 'a0000000-0000-4000-8000-000000000001';

if (!token || !SB_KEY) {
  console.error('Faltan N8N_MCP_TOKEN o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const UNIR_CONTEXTO_CODE = `const ctx = $('Preparar Contexto').first().json;
const raw = $input.first().json;
const customer = Array.isArray(raw) ? raw[0] : raw;
let activeOrders = [];
const SB = '${SB_URL}';
const KEY = '${SB_KEY}';
const TENANT = '${TENANT}';

if (customer && customer.id) {
  try {
    activeOrders = await this.helpers.httpRequest({
      method: 'GET',
      url: SB + '/rest/v1/orders?customer_id=eq.' + customer.id + '&tenant_id=eq.' + TENANT + '&status=not.in.(delivered,cancelled)&select=id,status,total,delivery_address,created_at,payment_method,order_items(quantity,products(name))&order=created_at.desc&limit=5',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      json: true,
    });
  } catch (e) {
    activeOrders = [];
  }
}

return [{ json: { ...ctx, customer: customer || null, activeOrders: activeOrders || [] } }];`;

const BOT_CODE = `const enriched = $('Unir Contexto Pedidos').first().json;
const { menu, chatId, userName, userText, activeOrders = [] } = enriched;
const text = (userText || '').trim();
const input = text.toLowerCase();
const TENANT = '${TENANT}';
const SB = '${SB_URL}';
const KEY = '${SB_KEY}';

const STATUS_LABELS = {
  pending: '⏳ Pendiente — recibido por el restaurante',
  confirmed: '✅ Confirmado — validado en cocina',
  preparing: '👨‍🍳 En preparación',
  ready: '📦 Listo — esperando domiciliario',
  shipping: '🛵 En camino a tu dirección',
  delivered: '✔️ Entregado',
  cancelled: '❌ Cancelado',
};

const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered'];

function trackLine(status) {
  const idx = STATUS_ORDER.indexOf(status);
  if (idx < 0) return '';
  const labels = ['Pend', 'Conf', 'Prep', 'Listo', 'Camino', 'Entreg'];
  return labels.map((l, i) => (i === idx ? '▶ ' + l : i < idx ? '✓ ' + l : '○ ' + l)).join('\\n');
}

function mainMenu() {
  return '🍽 *ChefFlow* — Hola ' + userName + '!\\n\\n*Menú principal*\\n1️⃣ Ver menú y hacer pedido\\n2️⃣ Seguimiento de mi pedido\\n3️⃣ Ayuda\\n\\n_Responde con el número: 1, 2 o 3_';
}

function productMenu() {
  let s = '📋 *MENÚ* — elige producto\\n\\n';
  menu.forEach((p, i) => {
    s += (i + 1) + '. ' + p.name + ' — $' + Number(p.price).toLocaleString('es-CO') + '\\n';
  });
  s += '\\n0️⃣ Volver al menú principal\\n_Escribe el número del producto_';
  return s;
}

function paymentMenu() {
  return '💳 *Forma de pago*\\n\\n1️⃣ Efectivo\\n2️⃣ Nequi\\n3️⃣ Daviplata\\n4️⃣ Tarjeta\\n\\n0️⃣ Cancelar y volver al inicio';
}

function formatOrders(orders) {
  if (!orders.length) {
    return '📭 *Sin pedidos activos*\\n\\nNo tienes pedidos en curso. Cuando pidas desde aquí o el restaurante registre uno, aparecerá en seguimiento.\\n\\n1️⃣ Hacer un pedido\\n0️⃣ Menú principal';
  }
  let s = '📦 *Seguimiento en vivo*\\n_Sincronizado con el panel del restaurante_\\n\\n';
  orders.forEach((o, i) => {
    const items = (o.order_items || []).map(it => it.quantity + 'x ' + (it.products?.name || 'producto')).join(', ');
    const shortId = String(o.id).slice(0, 8).toUpperCase();
    s += '——— Pedido #' + (i + 1) + ' (' + shortId + ') ———\\n';
    s += STATUS_LABELS[o.status] + '\\n';
    s += trackLine(o.status) + '\\n';
    s += '💰 Total: $' + Number(o.total).toLocaleString('es-CO') + '\\n';
    s += '📍 ' + (o.delivery_address || 'Sin dirección') + '\\n';
    if (items) s += '🛒 ' + items + '\\n';
    s += '\\n';
  });
  s += '0️⃣ Menú principal | 1️⃣ Nuevo pedido';
  return s;
}

const PAYMENTS = { '1': 'cash', '2': 'nequi', '3': 'daviplata', '4': 'card' };
const staticData = $getWorkflowStaticData('global');
if (!staticData.sessions) staticData.sessions = {};
let session = staticData.sessions[chatId] || { screen: 'main', cart: [], address: null, payment: null };

let reply = '';
let orderData = null;

async function logChat(direction, content, customerId) {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: SB + '/rest/v1/chat_messages',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: { tenant_id: TENANT, customer_id: customerId || null, channel: 'telegram', direction, content },
      json: true,
    });
  } catch (e) {}
}

if (input === '0' || input === '/start' || input === 'menu' || input === 'inicio') {
  session = { screen: 'main', cart: [], address: null, payment: null };
}

if (session.screen === 'main') {
  if (input === '1' || /pedir|ordenar|comprar/.test(input)) {
    session.screen = 'products';
    reply = productMenu();
  } else if (input === '2' || /estado|seguimiento|rastreo|donde/.test(input)) {
    session.screen = 'tracking';
    reply = formatOrders(activeOrders);
  } else if (input === '3' || /ayuda|help/.test(input)) {
    reply = 'ℹ️ *Ayuda*\\n\\n• *1* — Menú y pedido paso a paso\\n• *2* — Estado sincronizado con la web del restaurante\\n• *0* — Volver al inicio desde cualquier pantalla\\n\\nCuando el restaurante mueve tu pedido en /pedidos, recibes aviso aquí y puedes ver el detalle con *2*.';
  } else {
    reply = mainMenu();
  }
} else if (session.screen === 'products') {
  const n = parseInt(input, 10);
  if (n >= 1 && n <= menu.length) {
    const p = menu[n - 1];
    session.cart = [{ product_id: p.id, quantity: 1, name: p.name, price: p.price }];
    session.screen = 'address';
    reply = '✅ *' + p.name + '* agregado\\n\\n📍 Escribe tu *dirección de entrega* completa:';
  } else {
    reply = 'Opción inválida.\\n\\n' + productMenu();
  }
} else if (session.screen === 'address') {
  if (userText.trim().length < 8) {
    reply = '📍 Necesito una dirección más completa (calle, número, barrio):';
  } else {
    session.address = userText.trim();
    session.screen = 'payment';
    reply = paymentMenu();
  }
} else if (session.screen === 'payment') {
  if (PAYMENTS[input]) {
    session.payment = PAYMENTS[input];
    const subtotal = session.cart.reduce((a, i) => a + Number(i.price) * i.quantity, 0);
    const total = subtotal + 5000;
    orderData = {
      items: session.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      address: session.address,
      payment_method: session.payment,
      customer_name: userName,
      telegram_chat_id: chatId,
    };
    reply = '✅ *PEDIDO REGISTRADO*\\n\\n' + session.cart.map(i => '• ' + i.name).join('\\n') + '\\n📍 ' + session.address + '\\n💳 ' + session.payment + '\\n\\nSubtotal: $' + subtotal.toLocaleString('es-CO') + '\\nDomicilio: $5.000\\n*Total: $' + total.toLocaleString('es-CO') + '*\\n\\n🔔 Te notificaremos cuando cambie el estado.\\nEscribe *2* para seguimiento en cualquier momento.';
    session = { screen: 'main', cart: [], address: null, payment: null };
  } else {
    reply = 'Elige *1*, *2*, *3* o *4*.\\n\\n' + paymentMenu();
  }
} else if (session.screen === 'tracking') {
  if (input === '1') {
    session.screen = 'products';
    reply = productMenu();
  } else if (input === '2' || /actualizar|refresh/.test(input)) {
    reply = formatOrders(activeOrders);
  } else {
    session.screen = 'main';
    reply = mainMenu();
  }
} else {
  session.screen = 'main';
  reply = mainMenu();
}

await logChat.call(this, 'inbound', text, enriched.customer?.id);
await logChat.call(this, 'outbound', reply, enriched.customer?.id);

if (!orderData) staticData.sessions[chatId] = session;

return [{ json: { reply, orderData, chatId, userName, menu } }];`;

const WF02_FORMAT_CODE = `const order = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;
const labels = {
  pending: '⏳ Pendiente',
  confirmed: '✅ Confirmado',
  preparing: '👨‍🍳 En preparación',
  ready: '📦 Listo para entrega',
  shipping: '🛵 En camino',
  delivered: '✔️ Entregado',
  cancelled: '❌ Cancelado',
};
const steps = ['Pendiente', 'Confirmado', 'Preparando', 'Listo', 'En camino', 'Entregado'];
const orderFlow = ['pending', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered'];
const idx = orderFlow.indexOf(order.status);

let msg = '🔔 *Actualización ChefFlow*\\n\\n';
msg += 'Tu pedido cambió de estado en el restaurante:\\n\\n';
msg += '*' + (labels[order.status] || order.status) + '*\\n\\n';
if (idx >= 0 && order.status !== 'cancelled') {
  msg += steps.map((s, i) => {
    if (i === idx) return '▶ *' + s + '* ← ahora';
    if (i < idx) return '✓ ' + s;
    return '○ ' + s;
  }).join('\\n') + '\\n\\n';
}
msg += '💰 Total: $' + Number(order.total).toLocaleString('es-CO') + '\\n';
msg += '📍 ' + (order.delivery_address || 'Retiro en local') + '\\n\\n';
msg += '_Responde *2* en el bot para ver el seguimiento completo._';

return [{ json: { order, message: msg, customer_id: order.customer_id } }];`;

const WF01 = 'I4ndLDmfp8qxSbgi';
const WF02 = 'B6LT5k3pWMRQK1Lk';

async function step(label, operations) {
  console.log('→', label);
  const r = await mcpCall(token, 'update_workflow', { workflowId: WF01, operations });
  console.log('  ', r.appliedOperations ?? 'ok', r.error ?? '');
  if (r.error) throw new Error(r.error);
}

// --- WF 01: nodos nuevos + bot ---
await step('Agregar Buscar Cliente + Unir Contexto', [
  {
    type: 'addNode',
    node: {
      name: 'Buscar Cliente Telegram',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: [560, 96],
      parameters: {
        method: 'GET',
        url: `=${SB_URL}/rest/v1/customers?telegram_chat_id=eq.{{ $('Preparar Contexto').item.json.chatId }}&tenant_id=eq.${TENANT}&select=id,name,telegram_chat_id&limit=1`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: SB_KEY },
            { name: 'Authorization', value: `Bearer ${SB_KEY}` },
          ],
        },
      },
    },
  },
  {
    type: 'addNode',
    node: {
      name: 'Unir Contexto Pedidos',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [784, 96],
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: UNIR_CONTEXTO_CODE },
    },
  },
]);

await step('Reconectar flujo enriquecido', [
  { type: 'removeConnection', source: 'Preparar Contexto', target: 'Fallback Sin Gemini' },
  { type: 'addConnection', source: 'Preparar Contexto', target: 'Buscar Cliente Telegram' },
  { type: 'addConnection', source: 'Buscar Cliente Telegram', target: 'Unir Contexto Pedidos' },
  { type: 'addConnection', source: 'Unir Contexto Pedidos', target: 'Fallback Sin Gemini' },
]);

await step('Actualizar bot conversacional', [
  { type: 'renameNode', oldName: 'Fallback Sin Gemini', newName: 'Bot ChefFlow' },
  {
    type: 'updateNodeParameters',
    nodeName: 'Bot ChefFlow',
    replace: true,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: BOT_CODE },
  },
  { type: 'removeConnection', source: 'Unir Contexto Pedidos', target: 'Fallback Sin Gemini' },
  { type: 'removeConnection', source: 'Bot ChefFlow', target: 'Pedido Completo?' },
  { type: 'addConnection', source: 'Unir Contexto Pedidos', target: 'Bot ChefFlow' },
  { type: 'addConnection', source: 'Bot ChefFlow', target: 'Pedido Completo?' },
]);

await mcpCall(token, 'publish_workflow', { workflowId: WF01 });
console.log('✓ WF 01 publicado');

// --- WF 02: notificaciones mejoradas ---
await mcpCall(token, 'update_workflow', {
  workflowId: WF02,
  operations: [{
    type: 'updateNodeParameters',
    nodeName: 'Formatear Notificacion',
    replace: true,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: WF02_FORMAT_CODE },
  }],
});
await mcpCall(token, 'publish_workflow', { workflowId: WF02 });
console.log('✓ WF 02 publicado');

console.log('\nListo. Prueba en Telegram:');
console.log('  1 → menú numérico → pedido');
console.log('  2 → seguimiento desde Supabase (mismo estado que /pedidos)');
