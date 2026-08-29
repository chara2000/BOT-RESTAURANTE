const https = require('https');

const url = 'rvdujzqsqlcgnoxioihy.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2ZHVqenFzcWxjZ25veGlvaWh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzY5NjM2OSwiZXhwIjoyMTAzMjcyMzY5fQ.s72GiBJoZ4yJvZA2rLdtr0vOVPFUWf39GAu5Ef8i2KQ';

const sql = `SELECT 1 as val;`;

const body = JSON.stringify({ query: sql });
const opts = {
  hostname: url,
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
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});

req.on('error', (err) => console.error(err));
req.write(body);
req.end();
