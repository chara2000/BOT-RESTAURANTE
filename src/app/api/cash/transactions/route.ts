import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

  const body = await request.json();
  if (!body.register_id) {
    return NextResponse.json({ error: 'No hay caja abierta para registrar el movimiento' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert({
      register_id: body.register_id,
      type: body.type,
      amount: Number(body.amount ?? 0),
      description: body.description ?? '',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
