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

const token = loadEnv().N8N_MCP_TOKEN;
if (!token) {
  console.error('Falta N8N_MCP_TOKEN');
  process.exit(1);
}

const workflowId = 'I4ndLDmfp8qxSbgi';
const list = await mcpCall(token, 'search_executions', {
  workflowId,
  limit: 5,
});

console.log('Ultimas ejecuciones Workflow 01:');
for (const ex of list.data ?? []) {
  console.log(`  #${ex.id} ${ex.status} ${ex.startedAt}`);
  if (ex.status === 'error') {
    const detail = await mcpCall(token, 'get_execution', { executionId: ex.id });
    const errNode = detail.data?.resultData?.error?.node?.name;
    const errMsg = detail.data?.resultData?.error?.message ?? detail.error;
    console.log(`    Error en: ${errNode ?? '?'}`);
    console.log(`    Mensaje: ${String(errMsg).slice(0, 300)}`);
  }
}
