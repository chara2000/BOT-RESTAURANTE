/** Cliente: delega en API routes (N8N_WEBHOOK_URL solo en servidor). */

export async function createOrderViaN8n(payload: {
  order: Record<string, unknown>;
  items: { product_id: string; quantity: number; unit_price: number }[];
}) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Error creando pedido vía n8n');
  }
  return res.json();
}
