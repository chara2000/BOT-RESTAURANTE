import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export const dynamic = 'force-dynamic';

// POST /api/riders - Create a new rider (delivery user)
export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 503 });
    }

    const { 
      email, 
      password, 
      name, 
      phone, 
      vehicle_type, 
      plate_number,
      vehicle_model,
      vehicle_color,
      vehicle_description,
      tenant_id: bodyTenantId,
    } = await req.json();

    const tenantId = bodyTenantId || req.headers.get('x-tenant-id') || DEMO_TENANT_ID;

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password y nombre son requeridos' }, { status: 400 });
    }

    const riderModules = ['/domicilios', '/repartidores', '/mis-pedidos', '/repartidor', '/disponibles', '/inicio', '/perfil', '/ruta'];

    // 1. Create the user in Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        phone: phone || null,
        role: 'delivery',
        tenant_id: tenantId,
        allowed_modules: riderModules,
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Ensure user profile exists in profiles table with correct email, name, role, allowed_modules and tenant_id
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'delivery',
        tenant_id: tenantId,
        allowed_modules: riderModules,
        is_active: true,
      });

    if (profileError) {
       console.error('Error inserting/updating profile:', profileError);
    }

    // 3. Ensure rider_profile exists with default location coordinates matching the restaurant
    const { error: riderError } = await supabase
      .from('rider_profiles')
      .upsert({
        id: userId,
        vehicle_type: vehicle_type || 'motorcycle',
        plate_number: plate_number ? plate_number.trim().toUpperCase() : null,
        vehicle_model: vehicle_model ? vehicle_model.trim() : null,
        vehicle_color: vehicle_color ? vehicle_color.trim() : null,
        vehicle_description: vehicle_description ? vehicle_description.trim() : null,
        is_available: true,
        last_latitude: 3.2311,  // Default restaurant coordinates
        last_longitude: -76.4167,
        rating: 5.0,
      });

    if (riderError) {
       console.error('Error updating rider profile details', riderError);
    }

    return NextResponse.json({ message: 'Repartidor creado exitosamente', user: authData.user });
  } catch (error) {
    console.error('Error in POST /api/riders:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET /api/riders - List all riders for the tenant
export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 503 });
    }

    // Read tenant_id from query param or header — falls back to DEMO_TENANT_ID
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id') || req.headers.get('x-tenant-id') || DEMO_TENANT_ID;

    // Get all users from Auth to fetch their phone from user_metadata
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    // Join profiles with rider_profiles — scoped to active tenant
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, rider_profiles(is_available, vehicle_type, plate_number, rating, vehicle_model, vehicle_color, vehicle_description)')
      .eq('tenant_id', tenantId)
      .eq('role', 'delivery');

    if (error) throw error;

    // Normalize: flatten rider_profiles (it comes as array from PostgREST)
    const riders = (data ?? []).map((p: Record<string, unknown>) => {
      const rp = Array.isArray(p.rider_profiles)
        ? p.rider_profiles[0] ?? {}
        : p.rider_profiles ?? {};
        
      const authUser = authUsers.users.find(u => u.id === p.id);
      
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        phone: authUser?.user_metadata?.phone ?? null,
        role: p.role,
        is_available: (rp as Record<string, unknown>).is_available ?? false,
        vehicle_type: (rp as Record<string, unknown>).vehicle_type ?? 'motorcycle',
        plate_number: (rp as Record<string, unknown>).plate_number ?? null,
        vehicle_model: (rp as Record<string, unknown>).vehicle_model ?? null,
        vehicle_color: (rp as Record<string, unknown>).vehicle_color ?? null,
        vehicle_description: (rp as Record<string, unknown>).vehicle_description ?? null,
        rating: (rp as Record<string, unknown>).rating ?? 5.0,
      };
    });

    return NextResponse.json(riders);
  } catch (error) {
    console.error('Error in GET /api/riders:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
