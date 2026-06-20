import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('categories')
    .update({
      name: body.name,
      description: body.description,
      sort_order: body.sort_order,
      is_active: body.is_active,
    })
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
