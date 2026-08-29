import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id') || request.headers.get('x-tenant-id') || DEMO_TENANT_ID;

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, name, role, tenant_id, is_active, created_at, allowed_modules')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ users: profiles ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error consultando usuarios';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const body = await request.json();
    const {
      email,
      password,
      name,
      role = 'operator',
      allowed_modules = [],
      tenant_id,
    } = body;

    const targetTenantId = tenant_id || request.headers.get('x-tenant-id') || DEMO_TENANT_ID;

    if (role === 'delivery') {
      return NextResponse.json(
        { error: 'Los repartidores deben registrarse exclusivamente desde el módulo de Repartidores con sus datos de vehículo y placa.' },
        { status: 400 }
      );
    }

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'El nombre, correo electrónico y contraseña son obligatorios.' },
        { status: 400 }
      );
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role,
        tenant_id: targetTenantId,
        allowed_modules,
      },
    });

    if (authError) {
      return NextResponse.json({ error: `Error creando credenciales: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Guardar perfil con módulos habilitados en la tabla profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role,
        tenant_id: targetTenantId,
        allowed_modules,
        is_active: true,
      })
      .select('*')
      .single();

    if (profileError) {
      console.warn('[api/users] Profile upsert notice:', profileError.message);
    }

    // Si el rol es repartidor, registrarlo también en rider_profiles
    if (role === 'delivery') {
      try {
        await supabase.from('rider_profiles').upsert({
          id: userId,
          name: name.trim(),
          phone: body.phone || null,
          vehicle_type: body.vehicle_type || 'motorcycle',
          is_available: true,
          tenant_id: targetTenantId,
        });
      } catch (e: any) {
        console.warn('[api/users] rider_profiles upsert notice:', e?.message ?? e);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Usuario "${name}" (${role}) creado exitosamente.`,
      user: profile || {
        id: userId,
        email,
        name,
        role,
        allowed_modules,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creando usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const body = await request.json();
    const { userId, role, allowed_modules, is_active } = body;

    if (!userId) {
      return NextResponse.json({ error: 'El ID de usuario es obligatorio' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (role !== undefined) updates.role = role;
    if (allowed_modules !== undefined) updates.allowed_modules = allowed_modules;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Actualizar metadata de auth
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: updates,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Permisos actualizados correctamente',
      profile: updatedProfile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error actualizando usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    // Desactivar perfil y eliminar en auth
    await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
    await supabase.auth.admin.deleteUser(userId).catch(() => {});

    return NextResponse.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error eliminando usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
