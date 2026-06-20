import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { payment_status, notes } = body;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ payment_status, notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID)
    .select('id, payment_status, notes')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
