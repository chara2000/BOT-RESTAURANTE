/** Completa deploy bot v2: actualiza código + publica */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const upgrade = fs.readFileSync(path.join(root, 'upgrade-n8n-bot-experience.mjs'), 'utf8');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

async function mcpCall(token, tool, args) {
  const res = await fetch('https://juanchara.app.n8n.cloud/mcp-server/http', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: args } }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  const payload = JSON.parse(dataLine.slice(6));
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const content = payload.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : payload.result;
}

// Extraer BOT_CODE y WF02_FORMAT del script principal
const botMatch = upgrade.match(/const BOT_CODE = `([\s\S]*?)`;\n\nconst WF02_FORMAT/);
const wf2Match = upgrade.match(/const WF02_FORMAT_CODE = `([\s\S]*?)`;\n\nconst WF01/);
if (!botMatch || !wf2Match) throw new Error('No se pudo leer BOT_CODE');

const token = loadEnv().N8N_MCP_TOKEN;
const WF01 = 'I4ndLDmfp8qxSbgi';
const WF02 = 'B6LT5k3pWMRQK1Lk';

const r1 = await mcpCall(token, 'update_workflow', {
  workflowId: WF01,
  operations: [
    { type: 'renameNode', oldName: 'Fallback Sin Gemini', newName: 'Bot ChefFlow' },
    {
      type: 'updateNodeParameters',
      nodeName: 'Bot ChefFlow',
      replace: true,
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: botMatch[1] },
    },
  ],
});
console.log('WF01 bot actualizado:', r1.appliedOperations);

const pub1 = await mcpCall(token, 'publish_workflow', { workflowId: WF01 });
console.log('WF01 publicado:', pub1.success);

const r2 = await mcpCall(token, 'update_workflow', {
  workflowId: WF02,
  operations: [{
    type: 'updateNodeParameters',
    nodeName: 'Formatear Notificacion',
    replace: true,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: wf2Match[1] },
  }],
});
console.log('WF02 notificaciones:', r2.appliedOperations);

const pub2 = await mcpCall(token, 'publish_workflow', { workflowId: WF02 });
console.log('WF02 publicado:', pub2.success);

const d = await mcpCall(token, 'get_workflow_details', { workflowId: WF01 });
console.log('Flujo activo:', JSON.stringify(d.workflow.connections['Preparar Contexto']));
