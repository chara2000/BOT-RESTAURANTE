const N8N_BASE = process.env.N8N_WEBHOOK_URL ?? '';

export async function notifyOrderStatusChange(orderId: string, status: string) {
  if (!N8N_BASE) return;
  try {
    await fetch(`${N8N_BASE}/webhook/chefflow-order-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, status }),
    });
  } catch (err) {
    console.error('[n8n] order-status:', err);
  }
}

export async function createOrderViaN8n(payload: {
  order: Record<string, unknown>;
  items: { product_id: string; quantity: number; unit_price: number }[];
}) {
  if (!N8N_BASE) throw new Error('N8N_WEBHOOK_URL no configurada');
  const res = await fetch(`${N8N_BASE}/webhook/chefflow-new-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || 'Error creando pedido vía n8n');
  }
  return res.json();
}
