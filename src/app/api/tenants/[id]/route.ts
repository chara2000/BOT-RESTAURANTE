import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    // Ensure columns exist on public.tenants table
    try {
      await supabase.rpc('execute_sql', {
        sql: `
          ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS nit TEXT;
          ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
          ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'pro';
          ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
        `
      });
    } catch {
      // Non-critical if RPC not available
    }

    const body = await request.json();
    const {
      name,
      subdomain,
      plan_type,
      is_active,
      nit,
      logo_url,
      admin_email,
      admin_name,
      admin_password,
    } = body;

    // 1. Actualizar el registro del Restaurante (Tenant)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updatePayload.name = name.trim();
    if (subdomain !== undefined) updatePayload.subdomain = subdomain.trim();
    if (plan_type !== undefined) updatePayload.plan_type = plan_type;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (nit !== undefined) updatePayload.nit = nit.trim();
    if (logo_url !== undefined) updatePayload.logo_url = logo_url.trim();

    let updatedTenant: any = null;
    const { data, error: tenantError } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (tenantError) {
      // Fallback: Si alguna columna (como nit o logo_url) falló por schema, actualizar sólo columnas base
      const corePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) corePayload.name = name.trim();
      if (subdomain !== undefined) corePayload.subdomain = subdomain.trim();
      if (plan_type !== undefined) corePayload.plan_type = plan_type;
      if (is_active !== undefined) corePayload.is_active = is_active;

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('tenants')
        .update(corePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (fallbackError) {
        return NextResponse.json({ error: `Error al actualizar restaurante: ${fallbackError.message}` }, { status: 400 });
      }
      updatedTenant = fallbackData;
    } else {
      updatedTenant = data;
    }

    // 2. Si se proporciona contraseña, email o nombre para actualizar el usuario Admin del restaurante
    if (admin_email || admin_password || admin_name) {
      try {
        const { data: adminProfiles } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('tenant_id', id)
          .eq('role', 'admin')
          .limit(1);

        if (adminProfiles && adminProfiles.length > 0) {
          const adminId = adminProfiles[0].id;
          const authPayload: Record<string, unknown> = {};
          if (admin_email) authPayload.email = admin_email.trim();
          if (admin_password) authPayload.password = admin_password;
          if (admin_name) authPayload.user_metadata = { name: admin_name.trim(), role: 'admin', tenant_id: id };

          await supabase.auth.admin.updateUserById(adminId, authPayload);

          const profilePayload: Record<string, unknown> = {};
          if (admin_email) profilePayload.email = admin_email.trim();
          if (admin_name) profilePayload.name = admin_name.trim();

          await supabase.from('profiles').update(profilePayload).eq('id', adminId);
        }
      } catch (authErr) {
        console.warn('[Tenants PATCH] Warning updating admin auth/profile:', authErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `¡Restaurante "${updatedTenant?.name || name || 'Restaurante'}" actualizado exitosamente!`,
      tenant: updatedTenant,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al actualizar restaurante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    // ─── Eliminar datos operativos (excepto finanzas) ───────────────────────
    // 1. Eliminar order_items relacionados con pedidos de este tenant
    const { data: orders } = await supabase.from('orders').select('id').eq('tenant_id', id);
    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length > 0) {
      await supabase.from('order_items').delete().in('order_id', orderIds);
    }

    // 2. Eliminar pedidos (sin borrar la caja / cash_registers que son finanzas)
    await supabase.from('orders').delete().eq('tenant_id', id);

    // 3. Eliminar clientes
    await supabase.from('customers').delete().eq('tenant_id', id);

    // 4. Eliminar inventario y movimientos de stock
    const { data: inventoryItems } = await supabase.from('inventory').select('id').eq('tenant_id', id);
    const inventoryIds = (inventoryItems ?? []).map((i: any) => i.id);
    if (inventoryIds.length > 0) {
      await supabase.from('stock_movements').delete().in('inventory_id', inventoryIds);
    }
    await supabase.from('inventory').delete().eq('tenant_id', id);

    // 5. Eliminar productos y categorías
    const { data: productsData } = await supabase.from('products').select('id').eq('tenant_id', id);
    const productIds = (productsData ?? []).map((p: any) => p.id);
    if (productIds.length > 0) {
      await supabase.from('order_items').delete().in('product_id', productIds);
    }
    await supabase.from('products').delete().eq('tenant_id', id);
    await supabase.from('categories').delete().eq('tenant_id', id);

    // 6. Eliminar configuraciones del tenant
    await supabase.from('tenant_settings').delete().eq('tenant_id', id);

    // 7. Eliminar usuarios y credenciales Auth asociados al restaurante
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', id)
      .neq('role', 'super_admin');
      
    const profileIds = (profiles ?? []).map((p: any) => p.id);

    if (profileIds.length > 0) {
      // Eliminar usuarios en Supabase Auth
      for (const uid of profileIds) {
        try {
          await supabase.auth.admin.deleteUser(uid);
        } catch (authErr) {
          console.warn(`[Delete Tenant] Could not delete Auth user ${uid}:`, authErr);
        }
      }
      // Eliminar registros de perfiles
      await supabase.from('rider_profiles').delete().in('id', profileIds);
      await supabase.from('profiles').delete().in('id', profileIds);
    }

    // 8. Finalmente eliminar el tenant
    const { error: deleteError } = await supabase.from('tenants').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurante y credenciales eliminados correctamente.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al eliminar restaurante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
