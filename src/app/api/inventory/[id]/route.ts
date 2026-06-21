import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
import { mapInventory } from '@/services/supabaseMapper';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.unit !== undefined) patch.unit = body.unit;
  if (body.stock !== undefined) patch.stock = Number(body.stock);
  if (body.min_stock !== undefined) patch.min_stock = Number(body.min_stock);

  const { data, error } = await supabase
    .from('inventory')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(mapInventory(data as Record<string, unknown>));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { error } = await supabase
    .from('inventory')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

