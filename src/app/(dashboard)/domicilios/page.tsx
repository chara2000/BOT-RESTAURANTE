'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, UserCheck, Bike, ChevronRight, Package, CheckCircle2, Share2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/types';
import type { OrderStatus } from '@/types';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const RIDERS = ['Carlos M.', 'Andrea R.', 'Diego P.', 'Laura S.'];

const STATUS_FLOW: { from: OrderStatus; to: OrderStatus; label: string; icon: typeof ChevronRight }[] = [
  { from: 'pending', to: 'confirmed', label: 'Confirmar', icon: CheckCircle2 },
  { from: 'confirmed', to: 'preparing', label: 'En Preparación', icon: Package },
  { from: 'preparing', to: 'ready', label: 'Listo', icon: CheckCircle2 },
  { from: 'ready', to: 'shipping', label: 'En Camino', icon: Navigation },
  { from: 'shipping', to: 'delivered', label: 'Entregar', icon: CheckCircle2 },
];

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  pending:   'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  confirmed: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  preparing: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  ready:     'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
  shipping:  'bg-violet-500/10 text-violet-500 border-violet-500/30',
  delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/30',
};


export default function DomiciliosPage() {
  const { deliveries, assignRider, updateRiderPosition, updateOrderStatus, settings } = useAppData();
  const [selected, setSelected] = useState(deliveries[0]?.order_id ?? '');
  const [gpsRunning] = useState(true); // Always running
  const [message, setMessage] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const active = deliveries.find((d) => d.order_id === selected) ?? deliveries[0];
  
  // Default coordinate selection based on configured city (Puerto Tejada vs Medellin)
  const isPuertoTejada = settings?.coverage_city?.toLowerCase().includes('puerto tejada') || false;
  const defaultCenter: [number, number] = isPuertoTejada ? [3.2311, -76.4167] : [6.2088, -75.5678];
  
  const coords: [number, number] = active 
    ? [active.latitude === 6.2088 && isPuertoTejada ? 3.2311 : active.latitude, active.longitude === -75.5678 && isPuertoTejada ? -76.4167 : active.longitude] 
    : defaultCenter;

  useEffect(() => {
    if (deliveries.length && !selected) setSelected(deliveries[0].order_id);
  }, [deliveries]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      updateRiderPosition(
        active.order_id,
        active.latitude + (Math.random() - 0.5) * 0.002,
        active.longitude + (Math.random() - 0.5) * 0.002
      );
    }, 5000);
    return () => clearInterval(id);
  }, [active, updateRiderPosition]);

  const filteredDeliveries = deliveries.filter((d) => {
    if (selectedFilter === 'all') return true;
    return d.order.status === selectedFilter;
  });

  const getNextAction = (status: OrderStatus) =>
    STATUS_FLOW.find((f) => f.from === status);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al actualizar estado');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[120px] pointer-events-none" />
      <Topbar title="Logística y Domicilios" subtitle="Gestión de repartidores, despachos y rastreo GPS" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative">
        {message && (
          <div className="mb-4 p-4 rounded-2xl border bg-rose-500/10 text-rose-500 border-rose-500/20 font-bold text-sm animate-fade-in-up">
            {message}
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bike className="w-16 h-16 mb-4 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <p className="text-lg font-black mb-2" style={{ color: 'var(--text-primary)' }}>Sin envíos activos</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Los pedidos de tipo domicilio aparecerán aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left: Delivery List */}
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-[var(--orange-soft)] text-[var(--orange)] shadow-sm">
                    <Bike className="w-5 h-5" />
                  </div>
                  <p className="text-lg font-black text-[var(--text-primary)]">Envíos Activos</p>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg w-fit" style={{ background: 'var(--orange)', color: '#fff' }}>
                  {deliveries.length}
                </span>
              </div>

              {/* Filtro Rápido de Estado para Envíos */}
              <div className="mb-4">
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="text-xs font-black px-3 py-2 rounded-xl border w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">⏳ Pendientes (sin confirmar)</option>
                  <option value="confirmed">✅ Confirmados</option>
                  <option value="preparing">🍳 En Preparación</option>
                  <option value="ready">🛍️ Listos para despacho</option>
                  <option value="shipping">🛵 En Camino</option>
                  <option value="delivered">🎉 Entregados</option>
                </select>
              </div>

              {/* Contenedor Scrollable - Máximo 4 envíos visibles (aprox. 620px de alto máximo) */}
              <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: '640px' }}>
                {filteredDeliveries.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    No hay envíos en este estado.
                  </p>
                ) : (
                  filteredDeliveries.map((d) => {
                    const nextAction = getNextAction(d.order.status);
                    return (
                      <div
                        key={d.order_id}
                        onClick={() => setSelected(d.order_id)}
                        className="card p-5 w-full text-left transition-all duration-300 hover:shadow-lg relative overflow-hidden group cursor-pointer"
                        style={{
                          borderColor: selected === d.order_id ? 'var(--orange)' : 'var(--border)',
                          boxShadow: selected === d.order_id ? '0 0 20px var(--orange-glow)' : '',
                        }}
                      >
                        {selected === d.order_id && (
                          <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--orange)] shadow-[0_0_8px_var(--orange)]" />
                        )}

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black tracking-wider uppercase" style={{ color: 'var(--orange)' }}>
                            {d.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${d.order.id.slice(0, 6).toUpperCase()}`}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-sm ${STATUS_COLORS[d.order.status] ?? 'bg-gray-500/10 text-gray-500 border-gray-500/30'}`}>
                            {ORDER_STATUS_LABELS[d.order.status]}
                          </span>
                        </div>

                        <p className="text-sm font-black text-[var(--text-primary)]">{d.order.customer?.name}</p>
                        <p className="text-[11px] font-medium flex items-center gap-1.5 mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--orange)]" />{d.order.delivery_address}
                        </p>

                        <p className="text-sm font-black mt-3 mb-3">{formatCurrency(d.order.total)}</p>

                        {/* Rider assignment */}
                        <div className="pt-3 border-t mb-3" style={{ borderColor: 'var(--border)' }}>
                          {d.rider_name ? (
                            <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-xl w-max">
                              <UserCheck className="h-4 w-4" />{d.rider_name}
                            </p>
                          ) : (
                            <select
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                try { await assignRider(d.order_id, e.target.value); }
                                catch (err) { setMessage(err instanceof Error ? err.message : 'Error al asignar'); }
                              }}
                              className="text-[11px] font-black px-3 py-2 rounded-xl border w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all cursor-pointer"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                              defaultValue=""
                            >
                              <option value="" disabled>Seleccionar Repartidor...</option>
                              {RIDERS.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          )}
                        </div>

                        {/* Status advance button */}
                        {nextAction && d.order.status !== 'delivered' && d.order.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(d.order_id, nextAction.to); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs text-white transition-all hover:scale-[1.02] active:scale-95 shadow-sm cursor-pointer"
                            style={{ background: 'var(--orange)' }}
                          >
                            <nextAction.icon className="w-3.5 h-3.5" />
                            Avanzar: {nextAction.label}
                          </button>
                        )}

                        {d.order.status === 'delivered' && (
                          <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-black">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: GPS Map */}
            <div className="xl:col-span-2 space-y-6 animate-fade-in-up delay-100 flex flex-col">
              <div className="card p-5 lg:p-6 flex-1 flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-lg font-black flex items-center gap-3">
                    <Navigation className="h-6 w-6 text-[var(--orange)]" /> GPS en Tiempo Real
                  </p>
                  <span className="text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl shadow-sm">
                    ● Monitoreo Activo Todo el Tiempo
                  </span>
                </div>

                {active && (
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
                    <div className="flex items-center gap-3 flex-1">
                      <MapPin className="h-4 w-4 text-[var(--orange)] shrink-0" />
                      <div>
                        <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{active.order.customer?.name ?? 'Cliente'}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{active.order.delivery_address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-sky-500/10 text-sky-500">
                        {ORDER_STATUS_LABELS[active.order.status]}
                      </span>
                      <button 
                        onClick={() => {
                          const shortId = active.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || active.order.id;
                          const url = `${window.location.origin}/public/rastreo/${shortId}`;
                          navigator.clipboard.writeText(url);
                          setMessage('Enlace de rastreo copiado al portapapeles');
                          setTimeout(() => setMessage(null), 3000);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black text-white bg-[var(--orange)] hover:scale-105 active:scale-95 transition-all shadow-sm"
                      >
                        <Share2 className="w-3 h-3" /> Compartir Rastreo
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative rounded-2xl overflow-hidden border shadow-inner flex-1 min-h-[400px] lg:min-h-[500px]" style={{ borderColor: 'var(--border)' }}>
                  <MapComponent riderCoords={coords} deliveryAddress={active?.order.delivery_address ?? ''} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
