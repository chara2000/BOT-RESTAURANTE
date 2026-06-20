import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const cada2Horas = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Cada 2 Horas',
    parameters: {
      rule: { interval: [{ field: 'hours', hoursInterval: 2 }] },
    },
  },
});

const consultarInventario = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Consultar Inventario',
    parameters: {
      method: 'GET',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/inventory?tenant_id=eq.a0000000-0000-4000-8000-000000000001&select=id,name,stock,min_stock,unit'),
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

const filtrarStockBajo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Filtrar Stock Bajo',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const items = $input.all().map(i => i.json);\nconst lowStock = items.filter(i => Number(i.stock) <= Number(i.min_stock));\nif (lowStock.length === 0) return [];\nconst alert = lowStock.map(i => i.name + ': ' + i.stock + ' ' + i.unit + ' (min: ' + i.min_stock + ')').join('\\n');\nreturn [{ json: { alert, count: lowStock.length, items: lowStock } }];",
    },
  },
});

const registrarAlerta = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Registrar Alerta BD',
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
      jsonBody: expr('={"tenant_id":"a0000000-0000-4000-8000-000000000001","action":"low_stock_alert","entity_type":"inventory","new_data":{{ JSON.stringify($json) }}}'),
    },
  },
});

const guardarMensaje = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Guardar Alerta Mensajes',
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
      jsonBody: expr('={"tenant_id":"a0000000-0000-4000-8000-000000000001","channel":"system","direction":"outbound","content":{{ JSON.stringify("ALERTA INVENTARIO (" + $json.count + " items):\\n" + $("Filtrar Stock Bajo").item.json.alert) }}}'),
    },
  },
});

export default workflow('chefflow-03-stock-alert', 'ChefFlow 03 - Alerta Stock Bajo')
  .add(cada2Horas)
  .to(consultarInventario)
  .to(filtrarStockBajo)
  .to(registrarAlerta)
  .to(guardarMensaje);
