import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const tenantId = getTenantId(request);
  const body = await request.json();
  const supabase = createAdminClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert([
      {
        tenant_id: tenantId,
        name: body.name,
        description: body.description,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
      }
    ])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
