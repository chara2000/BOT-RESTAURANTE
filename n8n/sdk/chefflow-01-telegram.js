import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const telegramTrigger = trigger({
  type: 'n8n-nodes-base.telegramTrigger',
  version: 1.3,
  config: {
    name: 'Telegram Trigger',
    parameters: { updates: ['message'] },
    credentials: {
      telegramApi: { id: 'ikX2VSz1rIMWxg30', name: 'Telegram Bot' },
    },
  },
});

const cargarMenu = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Cargar Menu Supabase',
    parameters: {
      method: 'GET',
      url: expr('={{ $vars.SUPABASE_URL }}/rest/v1/products?tenant_id=eq.a0000000-0000-4000-8000-000000000001&is_available=eq.true&select=id,name,price,description'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
        ],
      },
    },
  },
});

const prepararContexto = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar Contexto',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const telegram = $('Telegram Trigger').first().json;\nconst menu = $('Cargar Menu Supabase').all().map(i => i.json);\nconst chatId = String(telegram.message.chat.id);\nconst userName = telegram.message.from?.first_name ?? 'Cliente';\nconst userText = telegram.message.text ?? '';\nconst menuText = menu.map(p => '- ' + p.name + ': $' + Number(p.price).toLocaleString('es-CO') + ' (id:' + p.id + ')').join('\\n');\nconst systemPrompt = 'Eres ChefFlow, asistente de pedidos. Responde en espanol.\\nMENU:\\n' + menuText + '\\n\\nCliente: ' + userName + ' (telegram:' + chatId + ')\\n\\nToma pedido, pide direccion y pago. Si pedido COMPLETO agrega ORDER_JSON:{\"items\":[{\"product_id\":\"uuid\",\"quantity\":1}],\"address\":\"...\",\"payment_method\":\"nequi\",\"customer_name\":\"' + userName + '\",\"telegram_chat_id\":\"' + chatId + '\"}';\nreturn [{ json: { systemPrompt, userText, chatId, userName, menu } }];",
    },
  },
});

const googleGemini = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Google Gemini',
    parameters: {
      method: 'POST',
      url: expr("=https://generativelanguage.googleapis.com/v1beta/models/{{ $vars.GEMINI_MODEL || 'gemini-2.0-flash' }}:generateContent?key={{ $vars.GEMINI_API_KEY }}"),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"systemInstruction":{"parts":[{"text":{{ JSON.stringify($json.systemPrompt) }}}]},"contents":[{"role":"user","parts":[{"text":{{ JSON.stringify($json.userText) }}}]}],"generationConfig":{"temperature":0.7,"maxOutputTokens":2048}}'),
    },
  },
});

const parsearRespuesta = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parsear Respuesta Gemini',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const raw = $input.first().json;\nconst text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Lo siento, no pude procesar tu mensaje.';\nconst ctx = $('Preparar Contexto').first().json;\nlet orderData = null;\nconst match = text.match(/ORDER_JSON:(\\{[\\s\\S]*?\\})/);\nif (match) { try { orderData = JSON.parse(match[1]); } catch (e) {} }\nconst reply = text.replace(/ORDER_JSON:\\{[\\s\\S]*?\\}/, '').trim();\nreturn [{ json: { reply, orderData, chatId: ctx.chatId, userName: ctx.userName, menu: ctx.menu } }];",
    },
  },
});

const pedidoCompleto = ifElse({
  version: 2.3,
  config: {
    name: 'Pedido Completo?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          leftValue: expr('={{ $json.orderData }}'),
          rightValue: '',
          operator: { type: 'object', operation: 'exists', singleValue: true },
        }],
      },
    },
  },
});

const telegramResponder = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Telegram Responder',
    parameters: {
      method: 'POST',
      url: expr('=https://api.telegram.org/bot{{ $vars.TELEGRAM_BOT_TOKEN }}/sendMessage'),
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"chat_id": {{ JSON.stringify($json.chatId) }}, "text": {{ JSON.stringify($json.reply) }}}'),
    },
  },
});

const calcularPedido = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Calcular Pedido',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const { orderData, menu, reply } = $input.first().json;\nconst TENANT = 'a0000000-0000-4000-8000-000000000001';\nconst BRANCH = 'b0000000-0000-4000-8000-000000000001';\nlet subtotal = 0;\nconst items = (orderData.items || []).map(item => {\n  const product = menu.find(p => p.id === item.product_id);\n  const unitPrice = product ? Number(product.price) : 0;\n  subtotal += unitPrice * item.quantity;\n  return { product_id: item.product_id, quantity: item.quantity, unit_price: unitPrice, total_price: unitPrice * item.quantity };\n});\nconst deliveryFee = 5000;\nconst total = subtotal + deliveryFee;\nreturn [{ json: { customer: { tenant_id: TENANT, name: orderData.customer_name, telegram_chat_id: orderData.telegram_chat_id }, order: { tenant_id: TENANT, branch_id: BRANCH, type: 'delivery', status: 'pending', payment_method: orderData.payment_method || 'cash', subtotal, delivery_fee: deliveryFee, tips: 0, total, delivery_address: orderData.address, notes: orderData.notes || '' }, items, reply, chatId: orderData.telegram_chat_id } }];",
    },
  },
});

const upsertCliente = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Upsert Cliente',
    parameters: {
      method: 'POST',
      url: expr('={{ $vars.SUPABASE_URL }}/rest/v1/customers?on_conflict=telegram_chat_id'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'resolution=merge-duplicates,return=representation' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={{ JSON.stringify($json.customer) }}'),
    },
  },
});

const mergeCliente = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Cliente ID',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const customer = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;\nconst calc = $('Calcular Pedido').first().json;\nreturn [{ json: { ...calc, customer_id: customer.id } }];",
    },
  },
});

const crearPedido = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Crear Pedido Supabase',
    parameters: {
      method: 'POST',
      url: expr('={{ $vars.SUPABASE_URL }}/rest/v1/orders'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={{ JSON.stringify({ ...$json.order, customer_id: $json.customer_id }) }}'),
    },
  },
});

const prepararItems = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar Items',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const order = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;\nconst calc = $('Merge Cliente ID').first().json;\nconst orderItems = calc.items.map(i => ({ order_id: order.id, ...i }));\nreturn [{ json: { orderItems, chatId: calc.chatId, reply: calc.reply + '\\n\\nPedido registrado. Total: $' + Number(order.total).toLocaleString('es-CO') } }];",
    },
  },
});

const crearItems = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Crear Items Pedido',
    parameters: {
      method: 'POST',
      url: expr('={{ $vars.SUPABASE_URL }}/rest/v1/order_items'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={{ JSON.stringify($json.orderItems) }}'),
    },
  },
});

const telegramConfirmar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Telegram Confirmar',
    parameters: {
      method: 'POST',
      url: expr('=https://api.telegram.org/bot{{ $vars.TELEGRAM_BOT_TOKEN }}/sendMessage'),
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"chat_id": {{ JSON.stringify($(\'Preparar Items\').item.json.chatId) }}, "text": {{ JSON.stringify($(\'Preparar Items\').item.json.reply) }}}'),
    },
  },
});

export default workflow('chefflow-01-telegram', 'ChefFlow 01 - Telegram + Gemini + Supabase')
  .add(telegramTrigger)
  .to(cargarMenu)
  .to(prepararContexto)
  .to(googleGemini)
  .to(parsearRespuesta)
  .to(pedidoCompleto
    .onTrue(calcularPedido
      .to(upsertCliente)
      .to(mergeCliente)
      .to(crearPedido)
      .to(prepararItems)
      .to(crearItems)
      .to(telegramConfirmar))
    .onFalse(telegramResponder));
