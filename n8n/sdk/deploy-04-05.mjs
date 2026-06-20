import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '..', '..', '.env.local');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = trimmed.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
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
  if (!dataLine) throw new Error(`MCP sin respuesta: ${text.slice(0, 300)}`);
  const payload = JSON.parse(dataLine.slice(6));
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const content = payload.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : payload.result;
}

const workflows = [
  { file: 'chefflow-04-daily-sales.js', description: 'Reporte diario de ventas con Gemini a las 10PM.' },
  { file: 'chefflow-05-new-order.js', description: 'Webhook para crear pedidos desde el panel web.' },
];

const env = loadEnv();
const token = env.N8N_MCP_TOKEN;
if (!token) {
  console.error('Falta N8N_MCP_TOKEN en .env.local');
  process.exit(1);
}

for (const wf of workflows) {
  const code = fs.readFileSync(path.join(root, wf.file), 'utf8');
  console.log(`Validando ${wf.file}...`);
  const validation = await mcpCall(token, 'validate_workflow', { code });
  if (!validation.valid) {
    console.error('  INVALIDO:', validation.errors);
    continue;
  }
  console.log(`  OK (${validation.nodeCount} nodos). Creando...`);
  const created = await mcpCall(token, 'create_workflow_from_code', {
    code,
    description: wf.description,
  });
  console.log(`  Creado: ${created.name} -> ${created.url}`);
  const published = await mcpCall(token, 'publish_workflow', { workflowId: created.workflowId });
  console.log(`  Publicado: ${published.success ? 'si' : published.error}`);
}

// Publicar workflow 03 si existe
const wf03 = process.argv[2];
if (wf03) {
  const published = await mcpCall(token, 'publish_workflow', { workflowId: wf03 });
  console.log(`Workflow 03 publicado: ${published.success ? 'si' : published.error}`);
}
