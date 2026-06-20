const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setup() {
  console.log('Creating receipts bucket...');
  const { data: bucket, error: bucketError } = await supabase.storage.createBucket('receipts', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
  });

  if (bucketError && !bucketError.message.includes('already exists')) {
    console.error('Error creating bucket:', bucketError);
  } else {
    console.log('Bucket "receipts" is ready.');
  }
}

setup();
