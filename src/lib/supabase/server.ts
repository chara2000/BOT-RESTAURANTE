import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { DEMO_TENANT_ID } from './constants';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getTenantId(request: Request): string {
  const headerId = request.headers.get('x-tenant-id');
  if (headerId && headerId !== 'null' && headerId !== 'undefined') return headerId;

  // fallback to searchParams
  const { searchParams } = new URL(request.url);
  const paramId = searchParams.get('tenant_id');
  if (paramId && paramId !== 'null' && paramId !== 'undefined') return paramId;

  return DEMO_TENANT_ID;
}
