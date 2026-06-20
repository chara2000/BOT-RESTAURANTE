import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';
import { createAdminClient } from '@/lib/supabase/server';
import { mapProduct } from '@/services/supabaseMapper';

const PRODUCT_SELECT = '*, categories(name)';

type ProductBody = {
  name?: string;
  category?: string;
  category_id?: string | null;
  price?: number;
  description?: string;
  image_url?: string;
  is_available?: boolean;
  is_combo?: boolean;
};

async function resolveCategoryId(categoryName?: string, categoryId?: string | null) {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ProductBody;
    const supabase = createAdminClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.image_url !== undefined) patch.image_url = body.image_url;
    if (body.is_available !== undefined) patch.is_available = body.is_available;
    if (body.is_combo !== undefined) patch.is_combo = body.is_combo;
    if (body.category !== undefined || body.category_id !== undefined) {
      patch.category_id = await resolveCategoryId(body.category, body.category_id);
    }

    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', DEMO_TENANT_ID)
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(mapProduct(data as Record<string, unknown>));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando producto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    .from('products')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEMO_TENANT_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id });
}
