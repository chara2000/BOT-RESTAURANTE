/**
 * Reemplaza $vars / $env por valores literales de .env.local en workflows n8n Cloud.
 * Necesario en planes sin Variables ($vars) y con $env bloqueado en nodos HTTP.
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

function inlineConfig(value, cfg) {
  if (typeof value !== 'string') return value;

  let s = value
    .replace(/\{\{\s*\$vars\.GEMINI_MODEL\s*\|\|\s*'gemini-2\.0-flash'\s*\}\}/g, cfg.GEMINI_MODEL)
    .replace(/\{\{\s*\$env\.GEMINI_MODEL\s*\|\|\s*'gemini-2\.0-flash'\s*\}\}/g, cfg.GEMINI_MODEL)
    .replace(/\{\{\s*\$vars\.SUPABASE_URL\s*\}\}/g, cfg.SUPABASE_URL)
    .replace(/\{\{\s*\$env\.SUPABASE_URL\s*\}\}/g, cfg.SUPABASE_URL)
    .replace(/\{\{\s*\$vars\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/g, cfg.SUPABASE_SERVICE_ROLE_KEY)
    .replace(/\{\{\s*\$env\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/g, cfg.SUPABASE_SERVICE_ROLE_KEY)
    .replace(/\{\{\s*\$vars\.GEMINI_API_KEY\s*\}\}/g, cfg.GEMINI_API_KEY)
    .replace(/\{\{\s*\$env\.GEMINI_API_KEY\s*\}\}/g, cfg.GEMINI_API_KEY)
    .replace(/\{\{\s*\$vars\.TELEGRAM_BOT_TOKEN\s*\}\}/g, cfg.TELEGRAM_BOT_TOKEN)
    .replace(/\{\{\s*\$env\.TELEGRAM_BOT_TOKEN\s*\}\}/g, cfg.TELEGRAM_BOT_TOKEN);

  // Quitar prefijo de expresión si ya no quedan {{ }}
  if (s.startsWith('={{ ') && !s.includes('{{')) {
    s = s.slice(4);
  } else if (s.startsWith('=') && !s.includes('{{') && !s.includes('$json') && !s.includes('$(')) {
    s = s.slice(1);
  }

  return s;
}

function inlineParams(obj, cfg) {
  if (typeof obj === 'string') return inlineConfig(obj, cfg);
  if (Array.isArray(obj)) return obj.map((v) => inlineParams(v, cfg));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, inlineParams(v, cfg)]));
  }
  return obj;
}

function needsInline(obj) {
  const s = JSON.stringify(obj);
  return s.includes('$vars.') || s.includes('$env.');
}

const WORKFLOWS = [
  'I4ndLDmfp8qxSbgi',
  'B6LT5k3pWMRQK1Lk',
  'XX2cA0o2qfeY7IHT',
  'ltl5Qpbv7cR7BsuQ',
  'GVQi1jJn9dPsrA6R',
];

const env = loadEnv();
const token = env.N8N_MCP_TOKEN;
const cfg = {
  SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-2.0-flash',
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
};

const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
if (!token) {
  console.error('Falta N8N_MCP_TOKEN en .env.local');
  process.exit(1);
}
if (missing.length) {
  console.error('Faltan en .env.local:', missing.join(', '));
  process.exit(1);
}

for (const workflowId of WORKFLOWS) {
  console.log(`\n=== Workflow ${workflowId} ===`);
  const details = await mcpCall(token, 'get_workflow_details', { workflowId });
  const nodes = details.workflow?.nodes ?? details.workflow?.activeVersion?.nodes ?? [];
  const operations = [];

  for (const node of nodes) {
    if (!node.parameters || !needsInline(node.parameters)) continue;
    operations.push({
      type: 'updateNodeParameters',
      nodeName: node.name,
      parameters: inlineParams(node.parameters, cfg),
      replace: true,
    });
  }

  if (!operations.length) {
    console.log('  Sin cambios');
    continue;
  }

  console.log(`  Inline en ${operations.length} nodos...`);
  const updated = await mcpCall(token, 'update_workflow', { workflowId, operations });
  console.log(`  OK: ${updated.appliedOperations} ops`);

  const published = await mcpCall(token, 'publish_workflow', { workflowId });
  console.log(`  Publicado: ${published.success}`);
}

console.log('\nListo. Prueba escribiendo a @mi_restaurante_prueba_bot en Telegram.');
