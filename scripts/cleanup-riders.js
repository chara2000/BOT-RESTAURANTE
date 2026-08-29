const { createClient } = require('@supabase/supabase-js');
const url = 'https://jeuvobmjhuyskxepdbmt.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpldXZvYm1qaHV5c2t4ZXBkYm10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTgwMTY1NSwiZXhwIjoyMDk3Mzc3NjU1fQ.EVCGpXuAT8pEq5902jIZy3KRxJZHLCoUHK2-UrH-JaY';
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function cleanup() {
  // 1. Delete test auth users
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  for (const u of authUsers.users) {
    if (u.email === 'repartidor@test.com' || u.email === 'repartidor1@test.com') {
      // rider_profiles will cascade delete, then delete auth user
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) console.log('Error deleting', u.email, delErr.message);
      else console.log('Deleted auth user:', u.email);
    }
  }

  console.log('Test riders deleted.');

  // 2. Verify remaining delivery users
  const { data: riders } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('role', 'delivery');
  console.log('Remaining delivery users:', riders);
}

cleanup().catch(console.error);
