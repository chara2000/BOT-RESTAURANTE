import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const diario10pm = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Diario 10PM',
    parameters: {
      rule: { interval: [{ field: 'cronExpression', expression: '0 22 * * *' }] },
    },
  },
});

const fechaHoy = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fecha Hoy',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const today = new Date().toISOString().slice(0, 10);\nreturn [{ json: { today, start: today + 'T00:00:00', end: today + 'T23:59:59' } }];",
    },
  },
});

const ventasDelDia = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Ventas del Dia',
    parameters: {
      method: 'GET',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/orders?tenant_id=eq.a0000000-0000-4000-8000-000000000001&status=eq.delivered&created_at=gte.{{ $json.start }}&created_at=lte.{{ $json.end }}&select=id,total,type,payment_method,created_at,customers(name)'),
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

const calcularMetricas = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Calcular Metricas',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const orders = $input.all().map(i => i.json);\nconst total = orders.reduce((s, o) => s + Number(o.total), 0);\nconst count = orders.length;\nconst avg = count ? total / count : 0;\nconst summary = { fecha: $('Fecha Hoy').item.json.today, pedidos: count, ingresos: total, ticket_promedio: avg, ordenes: orders };\nreturn [{ json: summary }];",
    },
  },
});

const geminiReporte = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gemini Reporte',
    parameters: {
      method: 'POST',
      url: expr('=https://generativelanguage.googleapis.com/v1beta/models/{{ $env.GEMINI_MODEL || \'gemini-2.0-flash\' }}:generateContent?key={{ $env.GEMINI_API_KEY }}'),
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'Content-Type', value: 'application/json' }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={"systemInstruction":{"parts":[{"text":"Genera un reporte ejecutivo breve de ventas de restaurante en español. Incluye insights y recomendaciones."}]},"contents":[{"role":"user","parts":[{"text":{{ JSON.stringify(\'Datos del día: \' + JSON.stringify($json)) }} }]}],"generationConfig":{"temperature":0.5,"maxOutputTokens":1024}}'),
    },
  },
});

const extraerReporte = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extraer Reporte',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const report = $input.first().json.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sin reporte';\nconst metrics = $('Calcular Metricas').first().json;\nreturn [{ json: { report, metrics } }];",
    },
  },
});

const guardarReporte = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Guardar Reporte BD',
    parameters: {
      method: 'POST',
      url: expr('={{ $env.SUPABASE_URL }}/rest/v1/audit_logs'),
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
      jsonBody: expr('={"tenant_id":"a0000000-0000-4000-8000-000000000001","action":"daily_sales_report","entity_type":"orders","new_data":{{ JSON.stringify($json) }}}'),
    },
  },
});

export default workflow('chefflow-04-daily-sales', 'ChefFlow 04 - Reporte Ventas Diario Gemini')
  .add(diario10pm)
  .to(fechaHoy)
  .to(ventasDelDia)
  .to(calcularMetricas)
  .to(geminiReporte)
  .to(extraerReporte)
  .to(guardarReporte);
