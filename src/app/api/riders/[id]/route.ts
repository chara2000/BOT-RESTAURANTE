import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// PATCH /api/riders/[id] - Update a rider account and profile details
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 503 });
    }

    const { id } = await params;
    const body = await req.json();
    const { 
      name, 
      email,
      phone,
      password, 
      vehicle_type, 
      plate_number, 
      vehicle_model, 
      vehicle_color, 
      vehicle_description,
      is_available 
    } = body;

    // 1. Update Auth account credentials and metadata
    const authUpdates: Record<string, any> = {};
    if (password && password.trim().length >= 6) {
      authUpdates.password = password.trim();
    }
    if (email && email.trim()) {
      authUpdates.email = email.trim();
    }
    
    const userMetadata: Record<string, any> = {};
    if (name) userMetadata.name = name;
    if (phone !== undefined) userMetadata.phone = phone || null;
    userMetadata.role = 'delivery';
    authUpdates.user_metadata = userMetadata;

    const { error: authErr } = await supabase.auth.admin.updateUserById(id, authUpdates);
    if (authErr) {
      return NextResponse.json({ error: `Error actualizando cuenta: ${authErr.message}` }, { status: 400 });
    }

    // 2. Update Profile Name and Email
    const profileUpdates: Record<string, any> = {};
    if (name) profileUpdates.name = name;
    if (email) profileUpdates.email = email;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id);
      if (profileErr) {
        return NextResponse.json({ error: `Error actualizando perfil: ${profileErr.message}` }, { status: 400 });
      }
    }

    // 3. Update Rider Profile fields
    const riderUpdates: Record<string, any> = {};
    if (vehicle_type !== undefined) riderUpdates.vehicle_type = vehicle_type;
    if (plate_number !== undefined) riderUpdates.plate_number = plate_number || null;
    if (vehicle_model !== undefined) riderUpdates.vehicle_model = vehicle_model || null;
    if (vehicle_color !== undefined) riderUpdates.vehicle_color = vehicle_color || null;
    if (vehicle_description !== undefined) riderUpdates.vehicle_description = vehicle_description || null;
    if (is_available !== undefined) riderUpdates.is_available = is_available;
    riderUpdates.updated_at = new Date().toISOString();

    const { error: riderErr } = await supabase
      .from('rider_profiles')
      .update(riderUpdates)
      .eq('id', id);

    if (riderErr) {
      return NextResponse.json({ error: `Error actualizando perfil de vehículo: ${riderErr.message}` }, { status: 400 });
    }

    return NextResponse.json({ message: 'Repartidor actualizado exitosamente' });
  } catch (error) {
    console.error('Error in PATCH /api/riders/[id]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/riders/[id] - Remove a rider completely
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 503 });
    }

    const { id } = await params;

    // Delete user from Supabase Auth (which cascades to profiles and rider_profiles if configured)
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: `Error eliminando repartidor: ${error.message}` }, { status: 400 });
    }

    return NextResponse.json({ message: 'Repartidor eliminado exitosamente' });
  } catch (error) {
    console.error('Error in DELETE /api/riders/[id]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
