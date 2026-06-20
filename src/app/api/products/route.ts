import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
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
};

async function resolveCategoryId(categoryName?: string, categoryId?: string) {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Supabase no configurado');

  if (categoryId) return categoryId;
  const name = categoryName?.trim();
  if (!name) return null;

  const { data: existing, error: findError } = await supabase
    .from('categories')
    .select('id')
    .eq('tenant_id', DEMO_TENANT_ID)
    .ilike('name', name)
    .maybeSingle();

  if (findError) throw findError;
  if (existing?.id) return String(existing.id);

  const { data: created, error: createError } = await supabase
    .from('categories')
    .insert({ tenant_id: DEMO_TENANT_ID, name, is_active: true })
    .select('id')
    .single();

  if (createError) throw createError;
  return String(created.id);
}

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('tenant_id', DEMO_TENANT_ID)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map((row) => mapProduct(row as Record<string, unknown>)));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProductBody;
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'El nombre del producto es obligatorio' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const category_id = await resolveCategoryId(body.category, body.category_id);
    const { data, error } = await supabase
      .from('products')
      .insert({
        tenant_id: DEMO_TENANT_ID,
        category_id,
        name,
        description: body.description ?? '',
        price: Number(body.price ?? 0),
        image_url: body.image_url ?? '',
        is_available: body.is_available ?? true,
        is_combo: body.is_combo ?? false,
      })
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(mapProduct(data as Record<string, unknown>), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creando producto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
