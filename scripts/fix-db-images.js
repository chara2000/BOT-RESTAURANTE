const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Updating invalid Unsplash photo URLs in public.products table...');
  const oldUrlPart = 'photo-1564149504298-f7e7a4f5e7d3';
  const newUrl = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600';

  const { data, error } = await supabase
    .from('products')
    .update({ image_url: newUrl })
    .like('image_url', `%${oldUrlPart}%`);

  if (error) {
    console.error('Error updating products:', error);
  } else {
    console.log('Update complete. Products updated:', data);
  }
}

run();
