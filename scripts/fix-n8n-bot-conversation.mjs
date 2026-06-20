/**
 * Corrige Workflow 01: bot conversacional con memoria (sin depender de Gemini).
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

const BOT_CODE = `const ctx = $('Preparar Contexto').first().json;
const { menu, chatId, userName, userText } = ctx;
const text = (userText || '').trim();
const lower = text.toLowerCase();
const staticData = $getWorkflowStaticData('global');
if (!staticData.sessions) staticData.sessions = {};

let session = staticData.sessions[chatId] || { items: [], address: null, payment_method: null };

const menuLines = menu.map(p => '• ' + p.name + ': $' + Number(p.price).toLocaleString('es-CO')).join('\\n');

function findProducts(input) {
  const t = input.toLowerCase();
  const found = [];
  for (const p of menu) {
    const name = p.name.toLowerCase();
    const keywords = name.split(' ').filter(w => w.length > 3);
    if (t.includes(name) || keywords.some(k => t.includes(k))) found.push(p);
  }
  if (found.length) return found;
  if (/hamburguesa|burger/.test(t)) return menu.filter(p => /hamburguesa|burger/i.test(p.name));
  if (/pizza/.test(t)) return menu.filter(p => /pizza/i.test(p.name));
  if (/limonada|bebida|refresco/.test(t)) return menu.filter(p => /limonada|bebida/i.test(p.name));
  return [];
}

function detectPayment(input) {
  const t = input.toLowerCase();
  if (/nequi|nqui/.test(t)) return 'nequi';
  if (/daviplata|davi/.test(t)) return 'daviplata';
  if (/tarjeta|card|visa|master|wompi/.test(t)) return 'card';
  if (/transfer|transferencia/.test(t)) return 'transfer';
  if (/efectivo|cash|plata en mano/.test(t)) return 'cash';
  return null;
}

function extractAddress(input) {
  const m = input.match(/(?:direccion|dirección|envio|envío|entrega|vivo en|llevar a|calle|CRA|cra|cl\\s|CL\\s|#)\\s*[:\-]?\\s*(.+)/i);
  if (m) return m[1].trim();
  if (session.items.length > 0 && !detectPayment(input) && input.trim().length >= 10 && !findProducts(input).length) {
    return input.trim();
  }
  return null;
}

function formatMenu() {
  return '¡Hola ' + userName + '! 👋\\n\\nNuestro menú:\\n' + menuLines + '\\n\\nEscribe qué quieres (ej: *hamburguesa* o *pizza*).';
}

function itemsSummary() {
  return session.items.map(i => '• ' + i.name + ' x' + i.quantity).join('\\n');
}

let reply = '';
let orderData = null;

if (/cancelar|cancel|reiniciar|empezar de nuevo/.test(lower)) {
  delete staticData.sessions[chatId];
  reply = 'Pedido cancelado. Escribe *menu* para ver opciones.';
} else if (/^\\/start|^menu$|ver menu|ver menú|que tienen|qué tienen/.test(lower) && session.items.length === 0) {
  reply = formatMenu();
} else {
  const products = findProducts(text);
  if (products.length) {
    const qtyMatch = text.match(/(\\d+)/);
    const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
    for (const p of products) {
      const existing = session.items.find(i => i.product_id === p.id);
      if (existing) existing.quantity += qty;
      else session.items.push({ product_id: p.id, quantity: qty, name: p.name });
    }
  }

  const addr = extractAddress(text);
  if (addr) session.address = addr;

  const pay = detectPayment(text);
  if (pay) session.payment_method = pay;

  if (session.items.length === 0) {
    reply = 'No reconocí ese plato.\\n\\n' + menuLines + '\\n\\nEscribe el producto o *menu*.';
  } else if (!session.address) {
    reply = 'Anoté:\\n' + itemsSummary() + '\\n\\n¿Cuál es tu dirección de entrega?';
  } else if (!session.payment_method) {
    reply = 'Pedido:\\n' + itemsSummary() + '\\n📍 ' + session.address + '\\n\\n¿Cómo pagas? (efectivo, nequi, daviplata o tarjeta)';
  } else {
    let subtotal = 0;
    for (const item of session.items) {
      const p = menu.find(m => m.id === item.product_id);
      if (p) subtotal += Number(p.price) * item.quantity;
    }
    const total = subtotal + 5000;

    orderData = {
      items: session.items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      address: session.address,
      payment_method: session.payment_method,
      customer_name: userName,
      telegram_chat_id: chatId,
    };

    reply = '✅ Pedido confirmado:\\n' + itemsSummary() + '\\n📍 ' + session.address + '\\n💳 ' + session.payment_method + '\\n\\nSubtotal: $' + subtotal.toLocaleString('es-CO') + '\\nDomicilio: $5.000\\n*Total: $' + total.toLocaleString('es-CO') + '*';

    delete staticData.sessions[chatId];
  }
}

if (!orderData) staticData.sessions[chatId] = session;

return [{ json: { reply, orderData, chatId, userName, menu } }];`;

const token = loadEnv().N8N_MCP_TOKEN;
if (!token) {
  console.error('Falta N8N_MCP_TOKEN');
  process.exit(1);
}

const workflowId = 'I4ndLDmfp8qxSbgi';

async function step(label, operations) {
  console.log(`\n→ ${label}`);
  const result = await mcpCall(token, 'update_workflow', { workflowId, operations });
  console.log('  OK:', result.appliedOperations ?? result);
  return result;
}

// Paso 1: actualizar lógica del bot
await step('Actualizar Fallback Sin Gemini', [{
  type: 'updateNodeParameters',
  nodeName: 'Fallback Sin Gemini',
  replace: true,
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: BOT_CODE },
}]);

// Paso 2: reconectar flujo (bypass Gemini)
await step('Reconectar flujo', [
  { type: 'removeConnection', source: 'Preparar Contexto', target: 'Google Gemini' },
  { type: 'removeConnection', source: 'Google Gemini', target: 'Parsear Respuesta Gemini', sourceIndex: 0 },
  { type: 'removeConnection', source: 'Google Gemini', target: 'Fallback Sin Gemini', sourceIndex: 1 },
  { type: 'removeConnection', source: 'Fallback Sin Gemini', target: 'Parsear Respuesta Gemini' },
  { type: 'removeConnection', source: 'Parsear Respuesta Gemini', target: 'Pedido Completo?' },
  { type: 'addConnection', source: 'Preparar Contexto', target: 'Fallback Sin Gemini' },
  { type: 'addConnection', source: 'Fallback Sin Gemini', target: 'Pedido Completo?' },
  { type: 'setNodeDisabled', nodeName: 'Google Gemini', disabled: true },
  { type: 'setNodeDisabled', nodeName: 'Parsear Respuesta Gemini', disabled: true },
]);

const published = await mcpCall(token, 'publish_workflow', { workflowId });
console.log('\nPublicado:', published.success);

const details = await mcpCall(token, 'get_workflow_details', { workflowId });
const conn = details.workflow?.connections?.['Preparar Contexto'];
console.log('Conexión Preparar Contexto →', JSON.stringify(conn));
