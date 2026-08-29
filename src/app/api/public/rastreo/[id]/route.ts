import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let orderRow: any = null;

    if (isUuid) {
      // 1. Intentar buscar por tracking_token first
      const { data: byToken } = await supabase
        .from('orders')
        .select('*, customers(*), order_items(*, products(*, categories(name)))')
        .eq('tracking_token', id)
        .maybeSingle();

      if (byToken) {
        orderRow = byToken;
      } else {
        // 2. Si no, intentar por id de la orden (order_id)
        const { data: byId } = await supabase
          .from('orders')
          .select('*, customers(*), order_items(*, products(*, categories(name)))')
          .eq('id', id)
          .maybeSingle();
        orderRow = byId;
      }
    } else {
      // 3. Buscar por short ID en notes
      const { data } = await supabase
        .from('orders')
        .select('*, customers(*), order_items(*, products(*, categories(name)))')
        .ilike('notes', `%[ID: ${id}]%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      orderRow = data;
    }

    if (!orderRow) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    // Censurar dirección para vista pública
    let censoredAddress = orderRow.delivery_address || '';
    if (censoredAddress) {
      censoredAddress = censoredAddress.replace(/(apto|apt|interior|int|casa|torre|bloque|piso)\s*\d+/gi, '***');
    }

    const order = {
      id: orderRow.id,
      status: orderRow.status,
      delivery_address: censoredAddress,
      customer: {
        name: orderRow.customers?.name || 'Cliente'
      }
    };

    // Buscar coordenadas reales del restaurante
    const { data: settingsRow } = await supabase
      .from('tenant_settings')
      .select('restaurant_lat, restaurant_lng')
      .eq('tenant_id', DEMO_TENANT_ID)
      .maybeSingle();

    const restaurantLat = settingsRow?.restaurant_lat != null ? Number(settingsRow.restaurant_lat) : null;
    const restaurantLng = settingsRow?.restaurant_lng != null ? Number(settingsRow.restaurant_lng) : null;

    // Buscar detalles del domicilio
    const { data: deliveryRow } = await supabase
      .from('delivery_details')
      .select('*, profiles(name)')
      .eq('order_id', orderRow.id)
      .maybeSingle();

    const fallbackLat = restaurantLat ?? 3.2311;
    const fallbackLng = restaurantLng ?? -76.4167;

    const delivery = deliveryRow ? {
      latitude: deliveryRow.latitude != null ? Number(deliveryRow.latitude) : fallbackLat,
      longitude: deliveryRow.longitude != null ? Number(deliveryRow.longitude) : fallbackLng,
      status: deliveryRow.status,
      rider_name: deliveryRow.profiles?.name || 'Repartidor',
      estimated_arrival: deliveryRow.estimated_arrival,
    } : null;

    return NextResponse.json({
      order,
      delivery,
      restaurantCoords: restaurantLat && restaurantLng
        ? { lat: restaurantLat, lng: restaurantLng }
        : null,
      orderId: orderRow.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al consultar rastreo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
