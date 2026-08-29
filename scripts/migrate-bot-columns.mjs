/**
 * Migration: 020 - Add per-tenant bot credentials to tenant_settings.
 * Run: node scripts/migrate-bot-columns.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env.local manually
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const COLUMNS = [
  { name: 'telegram_bot_token',      ddl: `ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT DEFAULT NULL` },
  { name: 'telegram_webhook_secret', ddl: `ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT DEFAULT NULL` },
  { name: 'telegram_admin_chat_id',  ddl: `ADD COLUMN IF NOT EXISTS telegram_admin_chat_id TEXT DEFAULT NULL` },
  { name: 'ycloud_api_key',          ddl: `ADD COLUMN IF NOT EXISTS ycloud_api_key TEXT DEFAULT NULL` },
  { name: 'ycloud_phone_number',     ddl: `ADD COLUMN IF NOT EXISTS ycloud_phone_number TEXT DEFAULT NULL` },
  { name: 'ycloud_webhook_secret',   ddl: `ADD COLUMN IF NOT EXISTS ycloud_webhook_secret TEXT DEFAULT NULL` },
];

async function main() {
  console.log('🔄 Running migration 020 - multi-tenant bot credentials\n');

  // Check which columns already exist
  const { data: sample, error: sampleErr } = await supabase
    .from('tenant_settings')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Cannot query tenant_settings:', sampleErr.message);
    process.exit(1);
  }

  const existingCols = sample && sample[0] ? Object.keys(sample[0]) : [];
  console.log('📋 Existing columns:', existingCols.join(', '));

  const missing = COLUMNS.filter(c => !existingCols.includes(c.name));

  if (missing.length === 0) {
    console.log('\n✅ All columns already exist. Migration already applied!');
    return;
  }

  console.log('\n➕ Missing columns to add:', missing.map(c => c.name).join(', '));

  // Supabase JS client can't run raw DDL.
  // Use the management API endpoint to execute SQL.
  const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  for (const col of missing) {
    const sql = `ALTER TABLE public.tenant_settings ${col.ddl};`;
    console.log(`\n  Running: ${sql}`);

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (res.ok) {
      const result = await res.json();
      console.log(`  ✅ OK:`, JSON.stringify(result).slice(0, 100));
    } else {
      const errText = await res.text();
      // If it's "already exists" that's fine
      if (errText.includes('already exists')) {
        console.log(`  ⚠️  Already exists (OK)`);
      } else {
        console.error(`  ❌ Error ${res.status}:`, errText.slice(0, 200));
        // Try alternative: direct REST
        console.log('  🔄 Trying pg direct...');
      }
    }
  }

  // Verify
  const { data: check } = await supabase.from('tenant_settings').select(COLUMNS.map(c => c.name).join(',')).limit(1);
  if (check) {
    console.log('\n✅ Migration verified — all bot columns exist');
  } else {
    console.log('\n⚠️  Could not verify. Please run the SQL manually in Supabase Dashboard > SQL Editor:');
    console.log('\n' + COLUMNS.map(c => `ALTER TABLE public.tenant_settings ${c.ddl};`).join('\n'));
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
