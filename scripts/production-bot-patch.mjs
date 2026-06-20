import fs from 'fs';
import path from 'path';

const WF01 = 'I4ndLDmfp8qxSbgi';
const MCP_URL = 'https://juanchara.app.n8n.cloud/mcp-server/http';

function loadEnv() {
  const env = {};
  const envPath = path.join(process.cwd(), '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  env.N8N_MCP_TOKEN = process.env.N8N_MCP_TOKEN || env.N8N_MCP_TOKEN;
  return env;
}

async function mcpCall(token, tool, args) {
  const res = await fetch(MCP_URL, {
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
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  if (!dataLine) throw new Error(`MCP sin data: ${text.slice(0, 500)}`);
  const payload = JSON.parse(dataLine.slice(6));
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const content = payload.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : payload.result;
}

function patchBotCode(code) {
  let out = code;

  out = out.replace(
    "const input = text.toLowerCase();",
    `const normalizedText = text
  .replace(/0\\ufe0f?\\u20e3/g, '0')
  .replace(/1\\ufe0f?\\u20e3/g, '1')
  .replace(/2\\ufe0f?\\u20e3/g, '2')
  .replace(/3\\ufe0f?\\u20e3/g, '3')
  .replace(/4\\ufe0f?\\u20e3/g, '4')
  .replace(/5\\ufe0f?\\u20e3/g, '5')
  .replace(/6\\ufe0f?\\u20e3/g, '6')
  .replace(/7\\ufe0f?\\u20e3/g, '7')
  .replace(/8\\ufe0f?\\u20e3/g, '8')
  .replace(/9\\ufe0f?\\u20e3/g, '9')
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '');
const input = normalizedText.toLowerCase();`
  );

  out = out.replace(
    "categoryId: null, suggested: false, awaitingHuman: false, lastActiveAt: Date.now(),",
    "categoryId: null, suggested: false, awaitingHuman: false, lastActiveAt: Date.now(), _productList: [],"
  );

  if (!out.includes('function parseChoiceNumber')) {
    out = out.replace(
      "function orderNum(id) { return '#' + String(id).slice(0, 8).toUpperCase(); }",
      `function orderNum(id) { return '#' + String(id).slice(0, 8).toUpperCase(); }
function parseChoiceNumber(value) {
  const match = String(value || '').match(/\\d+/);
  return match ? Number(match[0]) : NaN;
}
function parseQuantity(value) {
  const raw = String(value || '').toLowerCase();
  const qtyMatch = raw.match(/(?:x|cantidad|cant|por)\\s*(\\d+)/) || raw.match(/(\\d+)\\s*(?:unidades|unds|uds)/);
  const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
  return Number.isFinite(qty) && qty > 0 ? Math.min(qty, 20) : 1;
}
function cartOptions() {
  return '1 Agregar otro producto\\n2 Continuar\\n3 Ver carrito\\n4 Quitar producto\\n5 Cambiar cantidad\\n0 Cancelar carrito';
}`
    );
  }

  out = out.replace(
    "function addToCart(productId) {\n  const p = menu.find(x => x.id === productId);\n  if (!p) return false;\n  const ex = session.cart.find(i => i.product_id === p.id);\n  if (ex) ex.quantity += 1;\n  else session.cart.push({ product_id: p.id, quantity: 1, name: p.name, price: p.price });\n  return p;\n}",
    `function addToCart(productId, quantity = 1) {
  const p = menu.find(x => x.id === productId);
  if (!p) return false;
  const safeQty = Math.max(1, Math.min(Number(quantity) || 1, 20));
  const ex = session.cart.find(i => i.product_id === p.id);
  if (ex) ex.quantity += safeQty;
  else session.cart.push({ product_id: p.id, quantity: safeQty, name: p.name, price: p.price });
  return p;
}`
  );

  out = out.replace(
    "function afterAddMsg(product) {\n  session.suggested = !session.suggested;\n  let s = 'Perfecto",
    "function afterAddMsg(product, quantity = 1) {\n  session.suggested = !session.suggested;\n  let s = 'Perfecto"
  );
  out = out.replace(
    "+ product.name + ' x1\\n\\n*Tu carrito:*\\n' + cartSummary();",
    "+ product.name + ' x' + quantity + '\\n\\n*Tu carrito:*\\n' + cartSummary();"
  );
  out = out.replace(
    "else s += '\\n\\n1ï¸â£ Agregar otro producto\\n2ï¸â£ Continuar con el pedido\\n0ï¸â£ Cancelar carrito';",
    "else s += '\\n\\n' + cartOptions();"
  );

  out = out.replace(
    "const n = parseInt(input, 10);\n  const list = session._productList",
    "const n = parseChoiceNumber(input);\n  const qty = parseQuantity(input);\n  const list = session._productList"
  );
  out = out.replace(
    "reply = afterAddMsg(addToCart(list[n - 1].id));",
    "reply = afterAddMsg(addToCart(list[n - 1].id, qty), qty);"
  );

  out = out.replace(
    "const n = parseInt(input, 10);\n    const upsellList = menu.filter(p => /limonada|bebida|coca|gaseosa/i.test(p.name));\n    if (n >= 1 && n <= upsellList.length) reply = afterAddMsg(addToCart(upsellList[n - 1].id));\n    else reply = invalidOption('1 Agregar otro | 2 Continuar | 0 Cancelar\\n\\n' + cartSummary());",
    `if (input === '3' || /ver carrito|carrito/.test(input)) {
      reply = session.cart.length
        ? '*Tu carrito:*\\n' + cartSummary() + '\\n\\nTotal parcial: ' + fmt(cartTotal()) + '\\n\\n' + cartOptions()
        : 'Tu carrito esta vacio.\\n\\n1 Ver menu\\n0 Menu principal';
    } else if (input === '4' || /quitar|eliminar|borrar/.test(input)) {
      const n = parseChoiceNumber(input.replace(/^4$/, ''));
      if (n >= 1 && n <= session.cart.length) {
        const removed = session.cart.splice(n - 1, 1)[0];
        reply = 'Quite ' + removed.name + '.\\n\\n' + (session.cart.length ? '*Tu carrito:*\\n' + cartSummary() + '\\n\\n' + cartOptions() : 'Tu carrito quedo vacio.\\n\\n1 Ver menu\\n0 Menu principal');
      } else {
        reply = 'Escribe el numero del producto a quitar.\\n\\n' + session.cart.map((i, idx) => (idx + 1) + '. ' + i.name + ' x' + i.quantity).join('\\n') + '\\n\\n0 Cancelar';
      }
    } else if (input === '5' || /cantidad|cambiar/.test(input)) {
      const nums = input.match(/\\d+/g)?.map(Number) || [];
      const itemIndex = nums[0] === 5 ? nums[1] : nums[0];
      const newQty = nums[0] === 5 ? nums[2] : nums[1];
      if (itemIndex >= 1 && itemIndex <= session.cart.length && newQty >= 1) {
        session.cart[itemIndex - 1].quantity = Math.min(newQty, 20);
        reply = 'Cantidad actualizada.\\n\\n*Tu carrito:*\\n' + cartSummary() + '\\n\\n' + cartOptions();
      } else {
        reply = 'Para cambiar cantidad escribe: 5, numero del producto y nueva cantidad. Ejemplo: 5 1 3\\n\\n' + session.cart.map((i, idx) => (idx + 1) + '. ' + i.name + ' x' + i.quantity).join('\\n');
      }
    } else {
      const n = parseChoiceNumber(input);
      const qty = parseQuantity(input);
      const upsellList = menu.filter(p => /limonada|bebida|coca|gaseosa/i.test(p.name));
      if (n >= 1 && n <= upsellList.length) reply = afterAddMsg(addToCart(upsellList[n - 1].id, qty), qty);
      else reply = invalidOption(cartOptions() + '\\n\\n' + cartSummary());
    }`
  );

  out = out.replace(
    "if (!orderData) staticData.sessions[chatId] = session;",
    "session.lastActiveAt = now;\ndelete session.expiredNotice;\nstaticData.sessions[chatId] = session;"
  );

  return out;
}

function patchContextCode(code) {
  let out = code;
  out = out.replace(
    "const customer = Array.isArray(raw) ? raw[0] : raw;",
    "const customerCandidate = Array.isArray(raw) ? raw[0] : raw;\nconst customer = customerCandidate?.id ? customerCandidate : null;"
  );
  out = out.replace(/limit=5/g, 'limit=1').replace(/limit=10/g, 'limit=1');
  return out;
}

const env = loadEnv();
if (!env.N8N_MCP_TOKEN) throw new Error('Falta N8N_MCP_TOKEN');

const detail = await mcpCall(env.N8N_MCP_TOKEN, 'get_workflow_details', { workflowId: WF01 });
const nodes = detail.workflow.nodes;
const bot = nodes.find((node) => node.name === 'Bot ChefFlow')?.parameters?.jsCode;
const context = nodes.find((node) => node.name === 'Unir Contexto Pedidos')?.parameters?.jsCode;
if (!bot || !context) throw new Error('No encontre nodos Bot ChefFlow / Unir Contexto Pedidos');

const updated = await mcpCall(env.N8N_MCP_TOKEN, 'update_workflow', {
  workflowId: WF01,
  operations: [
    { type: 'setNodeParameter', nodeName: 'Bot ChefFlow', path: '/jsCode', value: patchBotCode(bot) },
    { type: 'setNodeParameter', nodeName: 'Unir Contexto Pedidos', path: '/jsCode', value: patchContextCode(context) },
    { type: 'setNodeSettings', nodeName: 'Buscar Cliente Telegram', settings: { alwaysOutputData: true } },
  ],
});
console.log(JSON.stringify({ appliedOperations: updated.appliedOperations, warnings: updated.validationWarnings?.length ?? 0 }));

const published = await mcpCall(env.N8N_MCP_TOKEN, 'publish_workflow', { workflowId: WF01 });
console.log(JSON.stringify({ published: published.success, activeVersionId: published.activeVersionId }));
