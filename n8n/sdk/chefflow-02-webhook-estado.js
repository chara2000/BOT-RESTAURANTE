import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const webhookEstado = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook Estado Pedido',
    parameters: {
      httpMethod: 'POST',
      path: 'chefflow-order-status',
      responseMode: 'responseNode',
    },
  },
});

const actualizarPedido = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Actualizar Pedido BD',
    parameters: {
      method: 'PATCH',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/orders?id=eq.{{ $json.body.order_id }}'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={{ JSON.stringify({ status: $json.body.status, updated_at: new Date().toISOString() }) }}'),
    },
  },
});

const formatearNotificacion = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Formatear Notificacion',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const order = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;\nconst labels = { pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Listo', shipping: 'En Camino', delivered: 'Entregado', cancelled: 'Cancelado' };\nconst msg = 'Pedido actualizado. Estado: ' + (labels[order.status] || order.status) + '. Total: $' + Number(order.total).toLocaleString('es-CO');\nreturn [{ json: { order, message: msg, customer_id: order.customer_id } }];",
    },
  },
});

const obtenerCliente = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Obtener Cliente',
    parameters: {
      method: 'GET',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/customers?id=eq.{{ $json.customer_id }}&select=telegram_chat_id,name'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        ],
      },
    },
  },
});

const tieneTelegram = ifElse({
  version: 2.3,
  config: {
    name: 'Tiene Telegram?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          leftValue: expr('={{ $json[0]?.telegram_chat_id }}'),
          rightValue: '',
          operator: { type: 'string', operation: 'exists', singleValue: true },
        }],
      },
    },
  },
});

const notificarTelegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Notificar Telegram',
    parameters: {
      method: 'POST',
      url: expr('=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage'),
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"chat_id": {{ JSON.stringify($json[0].telegram_chat_id) }}, "text": {{ JSON.stringify($(\'Formatear Notificacion\').item.json.message) }}}'),
    },
  },
});

const logEstado = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Log Estado BD',
    parameters: {
      method: 'POST',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/chat_messages'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"tenant_id": "a0000000-0000-4000-8000-000000000001", "channel": "system", "direction": "outbound", "content": {{ JSON.stringify($(\'Formatear Notificacion\').item.json.message) }}}'),
    },
  },
});

const responderWebhook = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder Webhook',
    parameters: {
      respondWith: 'json',
      responseBody: expr('={{ JSON.stringify({ success: true, order_id: $(\'Formatear Notificacion\').item.json.order.id }) }}'),
    },
  },
});

export default workflow('chefflow-02-order-status', 'ChefFlow 02 - Webhook Cambio Estado Pedido')
  .add(webhookEstado)
  .to(actualizarPedido)
  .to(formatearNotificacion)
  .to(obtenerCliente)
  .to(tieneTelegram
    .onTrue(notificarTelegram.to(logEstado))
    .onFalse(logEstado))
  .to(responderWebhook);
