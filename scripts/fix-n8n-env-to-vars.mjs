/**
 * Actualiza workflows ChefFlow en n8n Cloud: $env → $vars
 * Requiere N8N_MCP_TOKEN en .env.local
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

function replaceEnvInValue(value) {
  if (typeof value === 'string') return value.replace(/\$env\./g, '$vars.');
  if (Array.isArray(value)) return value.map(replaceEnvInValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceEnvInValue(v)]));
  }
  return value;
}

const WORKFLOWS = [
  'I4ndLDmfp8qxSbgi',
  'B6LT5k3pWMRQK1Lk',
  'XX2cA0o2qfeY7IHT',
  'ltl5Qpbv7cR7BsuQ',
  'GVQi1jJn9dPsrA6R',
];

const token = loadEnv().N8N_MCP_TOKEN;
if (!token) {
  console.error('Falta N8N_MCP_TOKEN en .env.local');
  process.exit(1);
}

for (const workflowId of WORKFLOWS) {
  console.log(`\n=== Workflow ${workflowId} ===`);
  const details = await mcpCall(token, 'get_workflow_details', { workflowId });
  const nodes = details.workflow?.nodes ?? details.workflow?.activeVersion?.nodes ?? [];
  const operations = [];

  for (const node of nodes) {
    if (!node.parameters) continue;
    const serialized = JSON.stringify(node.parameters);
    if (!serialized.includes('$env.')) continue;
    operations.push({
      type: 'updateNodeParameters',
      nodeName: node.name,
      parameters: replaceEnvInValue(node.parameters),
      replace: true,
    });
  }

  if (!operations.length) {
    console.log('  Sin cambios');
    continue;
  }

  console.log(`  Actualizando ${operations.length} nodos...`);
  const updated = await mcpCall(token, 'update_workflow', { workflowId, operations });
  console.log(`  OK: ${updated.appliedOperations} ops`);

  const published = await mcpCall(token, 'publish_workflow', { workflowId });
  console.log(`  Publicado: ${published.success}`);
}

console.log('\nListo. Crea Variables en n8n Cloud (Settings → Variables) con los mismos nombres.');
