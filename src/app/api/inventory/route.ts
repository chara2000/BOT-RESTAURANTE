import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID, DEMO_BRANCH_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
import { mapInventory } from '@/services/supabaseMapper';

export async function POST(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();

  if (!body.name || !body.unit) {
    return NextResponse.json({ error: 'name y unit son requeridos' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('inventory')
    .insert({
      tenant_id: DEMO_TENANT_ID,
      branch_id: DEMO_BRANCH_ID,
      name: body.name,
      unit: body.unit,
      stock: Number(body.stock ?? 0),
      min_stock: Number(body.min_stock ?? 10),
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(mapInventory(data as Record<string, unknown>), { status: 201 });
}
