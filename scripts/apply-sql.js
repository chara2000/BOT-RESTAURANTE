const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

async function run() {
  console.log('Using direct IPv6 database host resolved via Google DNS...');
  const host = '2600:1f18:38df:9501:9089:ee33:a074:5c7f';

  const client = new Client({
    user: 'postgres',
    password: 'ChefFlow2026!',
    database: 'postgres',
    port: 5432, // Direct Postgres port
    host: host,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  console.log('Connecting directly to database...');
  await client.connect();
  console.log('Successfully connected to Supabase PostgreSQL database directly.');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '010_rider_extra_fields.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying migration:\n', sql);
  await client.query(sql);
  console.log('Migration successfully applied to production db.');

  console.log('Setting default restaurant location for all existing delivery profiles...');
  await client.query(`
    UPDATE public.rider_profiles
    SET last_latitude = 3.2311,
        last_longitude = -76.4167
    WHERE last_latitude IS NULL OR last_longitude IS NULL;
  `);
  console.log('Location update done.');

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
