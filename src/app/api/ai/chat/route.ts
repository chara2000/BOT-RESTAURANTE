import { NextRequest, NextResponse } from 'next/server';

type ChatContext = {
  topProducts?: Array<{ name: string; sold?: number; revenue?: number }>;
  salesToday?: number;
  activeOrders?: number;
  menu?: Array<{ name: string; price: number; category?: string }>;
  vipCustomers?: string[];
};

function money(value: number | undefined) {
  return `$${Number(value ?? 0).toLocaleString('es-CO')}`;
}

function localReply(message: string, context: ChatContext = {}) {
  const input = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/menu|carta|producto|precio/.test(input)) {
    const items = (context.menu ?? [])
      .slice(0, 10)
      .map((p) => `- ${p.name}: ${money(p.price)}${p.category ? ` (${p.category})` : ''}`)
      .join('\n');
    return `Menu disponible:\n${items || 'No hay productos cargados todavia.'}`;
  }

  if (/venta|ingreso|reporte|resumen/.test(input)) {
    return `Resumen operativo:\n- Ventas hoy: ${money(context.salesToday)}\n- Pedidos activos: ${context.activeOrders ?? 0}\n- Productos top: ${(context.topProducts ?? []).slice(0, 3).map((p) => p.name).join(', ') || 'sin datos'}`;
  }

  if (/vendido|top|popular/.test(input)) {
    const top = (context.topProducts ?? [])
      .slice(0, 5)
      .map((p) => `- ${p.name}: ${p.sold ?? 0} unidades (${money(p.revenue)})`)
      .join('\n');
    return `Productos mas vendidos:\n${top || 'Aun no hay ventas suficientes para calcular el top.'}`;
  }

  if (/cliente|vip/.test(input)) {
    const names = (context.vipCustomers ?? []).slice(0, 10).join(', ');
    return `Clientes VIP:\n${names || 'No hay clientes VIP registrados todavia.'}`;
  }

  if (/pedido|orden|domicilio/.test(input)) {
    return 'Para tomar un pedido necesito productos, cantidades, direccion y metodo de pago. El bot de Telegram ya guia ese flujo con menu, carrito, direccion, pago y confirmacion.';
  }

  return 'Puedo ayudarte con menu, pedidos, ventas, productos top y clientes VIP usando los datos del sistema, sin IA externa.';
}

export async function POST(req: NextRequest) {
  const { message, context } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Mensaje vacio' }, { status: 400 });
  }

  return NextResponse.json({
    reply: localReply(message, context),
    provider: 'local-chefflow',
  });
}
