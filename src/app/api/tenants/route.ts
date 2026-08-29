import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ tenants });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar restaurantes';
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
      name,
      subdomain,
      plan_type = 'pro',
      admin_email,
      admin_name,
      admin_password,
      telegram_bot_token,
    } = body;

    if (!name || !admin_email || !admin_password) {
      return NextResponse.json(
        { error: 'El nombre del restaurante, correo del administrador y contraseña son obligatorios.' },
        { status: 400 }
      );
    }

    const tenantId = crypto.randomUUID();
    const slug = (subdomain || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    // 1. Crear el Registro del Restaurante (Tenant)
    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        id: tenantId,
        name: name.trim(),
        subdomain: slug,
        plan_type: plan_type,
        is_active: true,
      })
      .select('*')
      .single();

    if (tenantError) {
      return NextResponse.json({ error: `Error al crear restaurante: ${tenantError.message}` }, { status: 400 });
    }

    // 2. Crear Configuración por Defecto del Restaurante
    await supabase.from('tenant_settings').insert({
      tenant_id: tenantId,
      delivery_fee: 5000,
      telegram_bot_token: telegram_bot_token || null,
      telegram_enabled: Boolean(telegram_bot_token),
      business_hours: [
        { day: 'Lunes', open: '08:00', close: '22:00', closed: false },
        { day: 'Martes', open: '08:00', close: '22:00', closed: false },
        { day: 'Miércoles', open: '08:00', close: '22:00', closed: false },
        { day: 'Jueves', open: '08:00', close: '22:00', closed: false },
        { day: 'Viernes', open: '08:00', close: '23:00', closed: false },
        { day: 'Sábado', open: '08:00', close: '23:00', closed: false },
        { day: 'Domingo', open: '09:00', close: '21:00', closed: false },
      ],
    });

    // 3. Crear Usuario Administrador en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: admin_email.trim(),
      password: admin_password,
      email_confirm: true,
      user_metadata: {
        name: admin_name || admin_email.split('@')[0],
        role: 'admin',
        tenant_id: tenantId,
      },
    });

    if (authError) {
      return NextResponse.json({
        tenant: newTenant,
        warning: `Restaurante creado pero falló la creación del usuario Auth: ${authError.message}`,
      });
    }

    // 4. Crear Perfil del Administrador en la tabla profiles
    if (authData.user) {
      await supabase.from('profiles').upsert({
        id: authData.user.id,
        email: admin_email.trim(),
        name: admin_name || admin_email.split('@')[0],
        role: 'admin',
        tenant_id: tenantId,
        is_active: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: `¡Restaurante "${name}" y usuario Administrador (${admin_email}) creados exitosamente!`,
      tenant: newTenant,
      user: {
        id: authData.user?.id,
        email: admin_email,
        role: 'admin',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al registrar restaurante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
