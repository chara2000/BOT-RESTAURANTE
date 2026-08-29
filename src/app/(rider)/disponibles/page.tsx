'use client';

import { useState } from 'react';
import { MapPin, Clock, CreditCard, ChevronRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useOrders, useDeliveries } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import { deliveryService } from '@/services/api';

export default function PedidosDisponiblesPage() {
  const { orders, updateStatus } = useOrders();
  const { deliveries, assignRider } = useDeliveries();
  const { user } = useAuth();
  const [takingOrderId, setTakingOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Solo pedidos de domicilio que están listos y sin asignación activa
  const assignedOrderIds = new Set(
    deliveries
      .filter(d => ['assigned', 'on_the_way', 'searching'].includes(d.status ?? ''))
      .map(d => d.order_id)
      .filter(Boolean)
  );
  const poolOrders = orders.filter(
    (o) => o.status === 'ready' && o.type === 'delivery' && !assignedOrderIds.has(o.id)
  );

  const handleTakeOrder = async (orderId: string) => {
    if (!user) return;
    setTakingOrderId(orderId);
    setErrorMsg(null);
    try {
      // 1. Asignar en context (esto actualiza localmente y hace la llamada API)
      await assignRider(orderId, user.id, user.name);
      
      // 2. Cambiar estado a shipping
      await updateStatus({ orderId, status: 'shipping' });
      
      // Redirect to active orders
      window.location.href = '/mis-pedidos';
    } catch (err) {
      console.error(err);
      setErrorMsg('El pedido ya fue tomado por otro repartidor.');
    } finally {
      setTakingOrderId(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="mb-6">
        <h1 className="text-xl font-black tracking-tight mb-1">Pedidos Disponibles</h1>
        <p className="text-xs text-[var(--text-muted)] font-medium">
          Toca un pedido para ver los detalles y asignártelo.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold p-3 rounded-xl flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4" />
          {errorMsg}
        </div>
      )}

      {poolOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4 opacity-50">
          <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-input)] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-sm font-black mb-1">Todo está tranquilo</h2>
          <p className="text-xs text-[var(--text-muted)]">No hay pedidos disponibles en tu área en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {poolOrders.map((order) => {
            const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${order.id.slice(0, 6).toUpperCase()}`;
            return (
              <div key={order.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm flex flex-col relative">
                
                <div className="p-4 border-b border-[var(--border)] bg-gradient-to-br from-[var(--bg-input)] to-transparent">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-xs font-black text-[var(--orange)] bg-[var(--orange-soft)] px-2 py-1 rounded-lg">
                        {shortId}
                      </span>
                      <h3 className="text-sm font-bold mt-2 truncate pr-4 text-[var(--text-primary)]">
                        {order.delivery_address || 'Dirección no especificada'}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[var(--text-primary)]">{formatCurrency(order.delivery_fee || 5000)}</p>
                      <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Ganancia</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] font-semibold text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--orange)]" />
                      {formatTimeAgo(order.created_at)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      Aprox. 2.5 km
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-card)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Pago contra entrega</span>
                  </div>
                  <button
                    onClick={() => handleTakeOrder(order.id)}
                    disabled={takingOrderId === order.id}
                    className="flex items-center gap-1 bg-[var(--orange)] text-white text-xs font-black px-4 py-2 rounded-xl shadow-[0_4px_12px_var(--orange-glow)] transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {takingOrderId === order.id ? 'Asignando...' : 'Tomar Pedido'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
