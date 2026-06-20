import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const webhookNuevoPedido = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook Nuevo Pedido',
    parameters: {
      httpMethod: 'POST',
      path: 'chefflow-new-order',
      responseMode: 'responseNode',
    },
  },
});

const insertarPedido = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Insertar Pedido BD',
    parameters: {
      method: 'POST',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/orders'),
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
      jsonBody: expr('={{ JSON.stringify({ tenant_id: \'a0000000-0000-4000-8000-000000000001\', branch_id: \'b0000000-0000-4000-8000-000000000001\', ...$json.body.order, status: \'pending\' }) }}'),
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
      jsCode: "const order = Array.isArray($input.first().json) ? $input.first().json[0] : $input.first().json;\nconst body = $('Webhook Nuevo Pedido').first().json.body;\nconst items = (body.items || []).map(i => ({ order_id: order.id, product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, total_price: i.unit_price * i.quantity }));\nreturn [{ json: { order, items } }];",
    },
  },
});

const insertarItems = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Insertar Items BD',
    parameters: {
      method: 'POST',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/order_items'),
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
      jsonBody: expr('={{ JSON.stringify($json.items) }}'),
    },
  },
});

const crearDelivery = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Crear Delivery BD',
    parameters: {
      method: 'POST',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/delivery_details'),
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
      jsonBody: expr('={{ JSON.stringify({ order_id: $(\'Preparar Items\').item.json.order.id, status: \'searching\', latitude: 6.2088, longitude: -75.5678 }) }}'),
    },
  },
});

const responderOk = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder OK',
    parameters: {
      respondWith: 'json',
      responseBody: expr('={{ JSON.stringify({ success: true, order: $(\'Preparar Items\').item.json.order }) }}'),
    },
  },
});

export default workflow('chefflow-05-new-order', 'ChefFlow 05 - Webhook Nuevo Pedido Panel')
  .add(webhookNuevoPedido)
  .to(insertarPedido)
  .to(prepararItems)
  .to(insertarItems)
  .to(crearDelivery)
  .to(responderOk);
