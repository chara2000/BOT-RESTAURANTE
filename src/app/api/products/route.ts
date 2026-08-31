import { NextResponse } from 'next/server';
import { createAdminClient, getTenantId } from '@/lib/supabase/server';
import { mapProduct } from '@/services/supabaseMapper';

const PRODUCT_SELECT = '*, categories(name)';

type ProductBody = {
  name?: string;
  category?: string;
  category_id?: string;
  price?: number;
  description?: string;
  image_url?: string;
  is_available?: boolean;
  is_combo?: boolean;
  additions?: any[];
};

async function resolveCategoryId(categoryName: string | undefined, categoryId: string | undefined, tenantId: string) {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  if (categoryId) return categoryId;
  const name = categoryName?.trim();
  if (!name) return null;

  const { data: existing, error: findError } = await supabase
    .from('categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('name', name)
    .maybeSingle();

  if (findError) throw findError;
  if (existing?.id) return String(existing.id);

  const { data: created, error: createError } = await supabase
    .from('categories')
    .insert({ tenant_id: tenantId, name, is_active: true })
    .select('id')
    .single();

  if (createError) throw createError;
  return String(created.id);
}

export async function GET(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const tenantId = getTenantId(request);

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('tenant_id', tenantId)
    .not('category_id', 'is', null)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map((row) => mapProduct(row as Record<string, unknown>)));
}

export async function POST(request: Request) {
  try {
    const tenantId = getTenantId(request);
    const body = (await request.json()) as ProductBody;
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'El nombre del producto es obligatorio' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const category_id = await resolveCategoryId(body.category, body.category_id, tenantId);
    const insertPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      category_id,
      name,
      description: body.description ?? '',
      price: Number(body.price ?? 0),
      image_url: body.image_url ?? '',
      is_available: body.is_available ?? true,
      is_combo: body.is_combo ?? false,
    };
    if (body.additions !== undefined) {
      insertPayload.additions = body.additions;
    }

    let { data, error } = await supabase
      .from('products')
      .insert(insertPayload)
      .select(PRODUCT_SELECT)
      .single();

    if (error && error.message?.includes('additions')) {
      // additions column not in schema yet — retry without it
      delete insertPayload.additions;
      const res = await supabase.from('products').insert(insertPayload).select(PRODUCT_SELECT).single();
      data = res.data;
      error = res.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const mapped = mapProduct(data as Record<string, unknown>);
    // Merge back the additions the client sent if the column didn't exist
    return NextResponse.json({ ...mapped, additions: mapped.additions ?? body.additions ?? [] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creando producto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
