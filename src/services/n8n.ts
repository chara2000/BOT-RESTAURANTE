import { getActiveTenantId } from '@/services/api';

/** Cliente: delega en API routes (N8N_WEBHOOK_URL solo en servidor). */

export async function createOrderViaN8n(payload: {
  order: Record<string, unknown>;
  items: { product_id: string; quantity: number; unit_price: number; notes?: string }[];
}) {
  const tid = (payload.order?.tenant_id as string) || getActiveTenantId();
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tid,
    },
    body: JSON.stringify({
      ...payload,
      order: {
        ...payload.order,
        tenant_id: tid,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Error creando pedido vía n8n');
  }
  return res.json();
}

