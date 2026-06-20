/**
 * Despliega bot CRM completo en n8n Cloud (WF 01)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '..', '.env.local');

function loadEnv() {
  const env = {};
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
      jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) throw new Error(`MCP sin respuesta: ${text.slice(0, 300)}`);
  const payload = JSON.parse(dataLine.slice(6));
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const content = payload.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : payload.result;
}

const env = loadEnv();
const token = env.N8N_MCP_TOKEN;
const SB = env.NEXT_PUBLIC_SUPABASE_URL || 'https://jeuvobmjhuyskxepdbmt.supabase.co';
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = 'a0000000-0000-4000-8000-000000000001';
const WF01 = 'I4ndLDmfp8qxSbgi';

if (!token || !KEY) {
  console.error('Faltan N8N_MCP_TOKEN o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

let botCode = fs.readFileSync(path.join(root, '..', 'n8n', 'bot', 'crm-assistant.logic.js'), 'utf8');
botCode = botCode
  .replace(/^\/\/.*\n/gm, '')
  .replace(/__SB__/g, SB)
  .replace(/__KEY__/g, KEY)
  .replace(/__TENANT__/g, TENANT);

const UNIR_CODE = `const ctx = $('Preparar Contexto').first().json;
const raw = $input.first().json;
const customer = Array.isArray(raw) ? raw[0] : raw;
const SB = '${SB}';
const KEY = '${KEY}';
const TENANT = '${TENANT}';
const hdr = { apikey: KEY, Authorization: 'Bearer ' + KEY };

let activeOrders = [];
let lastOrder = null;
let promotions = [];
let categories = [];
let deliveryFee = 5000;

async function get(url) {
  try {
    return await this.helpers.httpRequest({ method: 'GET', url: SB + url, headers: hdr, json: true });
  } catch (e) { return null; }
}

const [cats, promos, settings] = await Promise.all([
  get.call(this, '/rest/v1/categories?tenant_id=eq.' + TENANT + '&is_active=eq.true&select=id,name,sort_order&order=sort_order'),
  get.call(this, '/rest/v1/promotions?tenant_id=eq.' + TENANT + '&is_active=eq.true&select=name,description,discount_type,discount_value&limit=5'),
  get.call(this, '/rest/v1/tenant_settings?tenant_id=eq.' + TENANT + '&select=delivery_fee'),
]);

categories = Array.isArray(cats) ? cats : [];
promotions = Array.isArray(promos) ? promos : [];
if (settings?.[0]?.delivery_fee) deliveryFee = Number(settings[0].delivery_fee);

if (customer?.id) {
  activeOrders = await get.call(this,
    '/rest/v1/orders?customer_id=eq.' + customer.id + '&tenant_id=eq.' + TENANT +
    '&status=not.in.(delivered,cancelled)&select=id,status,total,delivery_address,created_at,payment_method,order_items(quantity,products(name))&order=created_at.desc&limit=5'
  ) || [];

  const past = await get.call(this,
    '/rest/v1/orders?customer_id=eq.' + customer.id + '&tenant_id=eq.' + TENANT +
    '&status=eq.delivered&select=id,order_items(product_id,quantity,unit_price,products(id,name,price))&order=created_at.desc&limit=1'
  );
  lastOrder = past?.[0] || null;
}

return [{ json: {
  ...ctx,
  customer: customer || null,
  activeOrders: activeOrders || [],
  lastOrder,
  promotions,
  categories,
  deliveryFee,
} }];`;

const PREPARAR_CODE = `const telegram = $('Telegram Trigger').first().json;
const menuRaw = $('Cargar Menu Supabase').all().map(i => i.json);
const menu = menuRaw.map(p => ({
  id: p.id,
  name: p.name,
  price: p.price,
  description: p.description || '',
  category_id: p.category_id || p.categories?.id || null,
  category_name: p.categories?.name || null,
}));
const chatId = String(telegram.message.chat.id);
const userName = telegram.message.from?.first_name ?? 'Cliente';
const userText = telegram.message.text ?? '';
return [{ json: { userText, chatId, userName, menu } }];`;

const MENU_URL = `${SB}/rest/v1/products?tenant_id=eq.${TENANT}&is_available=eq.true&select=id,name,price,description,category_id,categories(id,name)&order=name`;

const CUSTOMER_URL = `=${SB}/rest/v1/customers?telegram_chat_id=eq.{{ $('Preparar Contexto').item.json.chatId }}&tenant_id=eq.${TENANT}&select=id,name,telegram_chat_id,address_default,order_count,segment&limit=1`;

const PREPARAR_ITEMS_CODE = `const order = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;
const calc = $('Merge Cliente ID').first().json;
const orderItems = calc.items.map(i => ({ order_id: order.id, ...i }));
const shortId = String(order.id).slice(0, 8).toUpperCase();
const reply = '🎉 ¡Pedido confirmado!\\n\\nNúmero de pedido:\\n#' + shortId + '\\n\\nEstado actual:\\n📥 Pedido recibido\\n\\nTotal: $' + Number(order.total).toLocaleString('es-CO') + '\\n\\nTe avisaremos cuando avance al siguiente estado.\\nEscribe 3 para seguimiento.';
return [{ json: { orderItems, chatId: calc.chatId, reply } }];`;

console.log('Desplegando bot CRM...');

const r = await mcpCall(token, 'update_workflow', {
  workflowId: WF01,
  operations: [
    {
      type: 'updateNodeParameters',
      nodeName: 'Cargar Menu Supabase',
      replace: true,
      parameters: {
        method: 'GET',
        url: MENU_URL,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: KEY },
            { name: 'Authorization', value: `Bearer ${KEY}` },
          ],
        },
      },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Preparar Contexto',
      replace: true,
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: PREPARAR_CODE },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Buscar Cliente Telegram',
      replace: true,
      parameters: {
        method: 'GET',
        url: CUSTOMER_URL,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: KEY },
            { name: 'Authorization', value: `Bearer ${KEY}` },
          ],
        },
      },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Unir Contexto Pedidos',
      replace: true,
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: UNIR_CODE },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Bot ChefFlow',
      replace: true,
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: botCode },
    },
    {
      type: 'updateNodeParameters',
      nodeName: 'Preparar Items',
      replace: true,
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: PREPARAR_ITEMS_CODE },
    },
  ],
});

console.log('Ops aplicadas:', r.appliedOperations);

const pub = await mcpCall(token, 'publish_workflow', { workflowId: WF01 });
console.log('Publicado:', pub.success);
console.log('\nBot CRM listo. Prueba /start en @mi_restaurante_prueba_bot');
