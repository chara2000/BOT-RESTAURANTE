import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createAdminClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert([
      {
        tenant_id: DEMO_TENANT_ID,
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
