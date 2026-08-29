const { createClient } = require('@supabase/supabase-js');
const url = 'https://jeuvobmjhuyskxepdbmt.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpldXZvYm1qaHV5c2t4ZXBkYm10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTgwMTY1NSwiZXhwIjoyMDk3Mzc3NjU1fQ.EVCGpXuAT8pEq5902jIZy3KRxJZHLCoUHK2-UrH-JaY';
const https = require('https');

// Run raw SQL via REST API
function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'jeuvobmjhuyskxepdbmt.supabase.co',
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function migrate() {
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Try adding columns via upsert with extra fields (Supabase will ignore unknown for existing cols)
  // Instead use a direct PATCH to the management API if needed, but let's try the PostgREST approach

  // Just verify what columns exist currently
  const { data, error } = await supabase.from('rider_profiles').select('*').limit(1);
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Current rider_profiles columns:', data ? Object.keys(data[0] || {}) : 'empty table');
  }
  
  // Try inserting with new columns - if they don't exist the insert will fail and we'll know
  const testId = '2d97205b-e9eb-46aa-8860-33ba8b5d181a';
  const { error: updateErr } = await supabase
    .from('rider_profiles')
    .update({ vehicle_model: 'Honda CB 125', vehicle_color: 'Rojo', vehicle_description: 'Moto de reparto' })
    .eq('id', testId);
    
  if (updateErr) {
    console.log('Column vehicle_model does NOT exist yet:', updateErr.message);
    console.log('Need to add columns via SQL migration');
  } else {
    console.log('Columns already exist or were added successfully');
  }
}

migrate().catch(console.error);
