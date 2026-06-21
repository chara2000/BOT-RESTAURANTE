import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load env.local manually
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';
const DEMO_BRANCH_ID = 'b0000000-0000-4000-8000-000000000001';

const USERS = [
  { email: 'superadmin@chefflow.com', password: 'superadmin123', role: 'super_admin', name: 'Super Administrador' },
  { email: 'admin@chefflow.com', password: 'admin123', role: 'admin', name: 'Administrador' },
  { email: 'operator@chefflow.com', password: 'operator123', role: 'operator', name: 'Operador POS' },
  { email: 'kitchen@chefflow.com', password: 'kitchen123', role: 'kitchen', name: 'Cocina Chef' },
  { email: 'delivery@chefflow.com', password: 'delivery123', role: 'delivery', name: 'Repartidor' },
];

async function seed() {
  // Check if tenant exists
  const { data: tenant } = await supabase.from('tenants').select('id').eq('id', DEMO_TENANT_ID).maybeSingle();
  if (!tenant) {
    console.log("Creating tenant...");
    await supabase.from('tenants').insert({ id: DEMO_TENANT_ID, name: 'ChefFlow Restaurante', subdomain: 'chefflow' });
  }

  // Check if branch exists
  const { data: branch } = await supabase.from('branches').select('id').eq('id', DEMO_BRANCH_ID).maybeSingle();
  if (!branch) {
    console.log("Creating branch...");
    await supabase.from('branches').insert({ id: DEMO_BRANCH_ID, tenant_id: DEMO_TENANT_ID, name: 'Sede Central', address: 'Calle 10 # 34-56' });
  }

  for (const u of USERS) {
    console.log(`Processing ${u.email}...`);
    // 1. Create or get user
    const { data: userList } = await supabase.auth.admin.listUsers();
    let user = userList?.users?.find(x => x.email === u.email);

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true
      });
      if (error) {
        console.error(`Error creating user ${u.email}:`, error.message);
        continue;
      }
      user = data.user;
      console.log(`Created user in Auth: ${u.email} (ID: ${user.id})`);
    } else {
      console.log(`User already exists in Auth: ${u.email} (ID: ${user.id})`);
    }

    // 2. Insert profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      tenant_id: DEMO_TENANT_ID,
      branch_id: DEMO_BRANCH_ID,
      email: u.email,
      name: u.name,
      role: u.role,
      is_active: true,
      updated_at: new Date().toISOString()
    });

    if (profileError) {
      console.error(`Error creating profile for ${u.email}:`, profileError.message);
    } else {
      console.log(`Profile created/updated for ${u.email}`);
    }
  }
}

seed().then(() => console.log("Seeding finished!"));
