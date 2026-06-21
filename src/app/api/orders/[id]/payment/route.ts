import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

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
  const { payment_status, notes } = body;

  // Update notes and optionally advance order status
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (notes !== undefined) patch.notes = notes;

  // Move order to delivered when approved, or cancelled when rejected
  if (payment_status === 'paid') {
    patch.status = 'confirmed';
  } else if (payment_status === 'failed') {
    patch.status = 'cancelled';
  }

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select('id, status, notes')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
