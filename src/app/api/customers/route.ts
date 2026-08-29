import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { mapCustomer } from '@/services/supabaseMapper';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id') || req.headers.get('x-tenant-id') || getTenantId(req) || DEMO_TENANT_ID;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const customers = (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
    return NextResponse.json(customers);
  } catch (err) {
    console.error('Error in GET /api/customers:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error cargando clientes' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });

    const body = await req.json();
    const { name, phone, email, address_default, tenant_id: bodyTenantId } = body;
    const tenantId = bodyTenantId || req.headers.get('x-tenant-id') || getTenantId(req) || DEMO_TENANT_ID;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre del cliente es obligatorio' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        phone: phone ? phone.trim() : '0000000000',
        email: email ? email.trim() : null,
        address_default: address_default ? address_default.trim() : null,
        segment: 'new',
        total_spent: 0,
        order_count: 0,
      })
      .select('*')
      .single();

    if (error) throw error;
    const customer = mapCustomer(data as Record<string, unknown>);
    return NextResponse.json(customer);
  } catch (err) {
    console.error('Error in POST /api/customers:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error creando cliente' }, { status: 500 });
  }
}
