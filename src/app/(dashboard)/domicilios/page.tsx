'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, UserCheck, Bike, ChevronRight, Package, CheckCircle2, Share2, Eye, AlertTriangle, ChevronLeft } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData, getLocalDayString } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/types';
import type { OrderStatus } from '@/types';
import { ridersService, deliveryService } from '@/services/api';
import { OrderHistoryPanel } from '@/components/OrderHistoryPanel';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const STATUS_FLOW: { from: OrderStatus; to: OrderStatus; label: string; icon: typeof ChevronRight }[] = [
  { from: 'pending', to: 'confirmed', label: 'Confirmar', icon: CheckCircle2 },
  { from: 'confirmed', to: 'preparing', label: 'En Preparación', icon: Package },
  { from: 'preparing', to: 'ready', label: 'Listo', icon: CheckCircle2 },
  { from: 'ready', to: 'shipping', label: 'En Camino', icon: Navigation },
  { from: 'shipping', to: 'delivered', label: 'Entregar', icon: CheckCircle2 },
];

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  pending:   'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  confirmed: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  preparing: 'bg-orange-500/10 text-[var(--orange)] border-orange-500/30',
  ready:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  shipping:  'bg-violet-500/10 text-violet-400 border-violet-500/30',
  delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  searching: 'Buscando Repartidor',
  assigned: 'Asignado (En Camino a Tienda)',
  arrived_at_store: 'En Local (Retirando)',
  picked_up: 'En Camino a Cliente',
  arrived_at_customer: 'En Puerta del Cliente',
  delivered: 'Entregado',
  failed: 'Entrega Fallida',
};

export default function DomiciliosPage() {
  const { deliveries, assignRider, updateOrderStatus, settings, activeTenantId, cashSession } = useAppData();
  const [selected, setSelected] = useState(deliveries[0]?.order_id ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [deliveryTab, setDeliveryTab] = useState<'shift' | 'history'>('shift');
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [dbRiders, setDbRiders] = useState<any[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  const defaultCenter: [number, number] = [settings?.restaurant_lat ?? 3.2311, settings?.restaurant_lng ?? -76.4167];

  useEffect(() => {
    ridersService.getAll(activeTenantId)
      .then((riders) => {
        setDbRiders(riders);
      })
      .catch((err) => console.error('Error fetching riders:', err));
  }, [activeTenantId]);

  const sessionOpenedTime = cashSession?.opened_at ? new Date(cashSession.opened_at).getTime() : 0;

  const filteredDeliveries = deliveries.filter((d) => {
    // 1. Turno actual vs Historial
    if (deliveryTab === 'shift') {
      const orderDateStr = getLocalDayString(d.order.created_at);
      const todayStr = getLocalDayString(new Date());
      if (orderDateStr !== todayStr) return false;
    } else {
      // Historial con filtros de fecha
      const orderDateStr = getLocalDayString(d.order.created_at);
      const todayStr = getLocalDayString(new Date());
      const yesterdayStr = getLocalDayString(new Date(Date.now() - 86400000));
      
      if (historyPeriod === 'today' && orderDateStr !== todayStr) return false;
      if (historyPeriod === 'yesterday' && orderDateStr !== yesterdayStr) return false;
      if (historyPeriod === 'week') {
        const weekAgo = Date.now() - 7 * 86400000;
        if (new Date(d.order.created_at).getTime() < weekAgo) return false;
      }
      if (historyPeriod === 'month') {
        const monthAgo = Date.now() - 30 * 86400000;
        if (new Date(d.order.created_at).getTime() < monthAgo) return false;
      }
    }

    // 2. Status filter
    if (selectedFilter === 'all') return true;
    return d.order.status === selectedFilter;
  });

  const active = filteredDeliveries.find((d) => d.order_id === selected) ?? filteredDeliveries[0];
  const coords: [number, number] = active 
    ? [active.latitude, active.longitude] 
    : defaultCenter;

  useEffect(() => {
    if (filteredDeliveries.length && !filteredDeliveries.some(d => d.order_id === selected)) {
      setSelected(filteredDeliveries[0].order_id);
    }
  }, [filteredDeliveries, selected]);

  const totalPages = Math.ceil(filteredDeliveries.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedDeliveries = filteredDeliveries.slice(startIndex, startIndex + pageSize);

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
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Logística y Domicilios" subtitle="Gestión de repartidores propios, despachos y rastreo GPS" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative space-y-4">
        {message && (
          <div className="p-4 rounded-2xl border bg-rose-500/10 text-rose-500 border-rose-500/30 font-bold text-xs animate-fade-in-up">
            {message}
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="card p-16 text-center space-y-3">
            <Bike className="w-14 h-14 mx-auto opacity-30 text-[var(--orange)]" />
            <p className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Sin envíos activos</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Los pedidos de tipo domicilio aparecerán aquí para despacho</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left: Delivery List */}
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex flex-col gap-3 mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-base font-black text-[var(--text-primary)]">
                        {deliveryTab === 'shift' ? 'Turno Actual' : 'Historial de Domicilios'}
                      </p>
                      <p className="text-[10px] font-bold text-[var(--text-muted)]">
                        {deliveryTab === 'shift' ? 'Despachos del turno en curso' : 'Todas las entregas anteriores'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full text-white bg-[var(--orange)] shadow-sm">
                    {filteredDeliveries.length}
                  </span>
                </div>

                {/* Tabs: Turno Actual vs Historial */}
                <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-input)] rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => { setDeliveryTab('shift'); setCurrentPage(1); }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      deliveryTab === 'shift' ? 'bg-[var(--orange)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    🛵 Turno Actual
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeliveryTab('history'); setCurrentPage(1); }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      deliveryTab === 'history' ? 'bg-[var(--orange)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    📜 Historial
                  </button>
                </div>

                {/* Date Pills for Historial */}
                {deliveryTab === 'history' && (
                  <div className="flex flex-wrap items-center gap-1.5 animate-fade-in-up">
                    {[
                      { id: 'today', label: 'Hoy' },
                      { id: 'yesterday', label: 'Ayer' },
                      { id: 'week', label: '7 Días' },
                      { id: 'month', label: '30 Días' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setHistoryPeriod(p.id as any); setCurrentPage(1); }}
                        className={`text-[11px] font-black px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                          historyPeriod === p.id
                            ? 'bg-[var(--orange)] text-white border-[var(--orange)] shadow-sm'
                            : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                        style={{ borderColor: historyPeriod === p.id ? 'var(--orange)' : 'var(--border)' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status filter */}
              <div>
                <select
                  value={selectedFilter}
                  onChange={(e) => { setSelectedFilter(e.target.value); setCurrentPage(1); }}
                  className="text-xs font-semibold px-4 py-3 rounded-2xl border w-full focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">⏳ Pendientes</option>
                  <option value="confirmed">✅ Confirmados</option>
                  <option value="preparing">🍳 En Preparación</option>
                  <option value="ready">🛍️ Listos para despacho</option>
                  <option value="shipping">🛵 En Camino</option>
                  <option value="delivered">🎉 Entregados</option>
                </select>
              </div>

              {/* Scrollable Container with cards */}
              <div className="space-y-4 overflow-y-auto max-h-[580px] pr-1 custom-scrollbar">
                {paginatedDeliveries.length === 0 ? (
                  <p className="text-xs text-center py-10 font-bold" style={{ color: 'var(--text-muted)' }}>
                    No hay envíos en este estado.
                  </p>
                ) : (
                  paginatedDeliveries.map((d) => {
                    const nextAction = getNextAction(d.order.status);
                    const isSelected = selected === d.order_id;
                    const orderNumber = d.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${d.order.id.slice(0, 6).toUpperCase()}`;

                    return (
                      <div
                        key={d.order_id}
                        onClick={() => setSelected(d.order_id)}
                        className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 cursor-pointer ${
                          isSelected
                            ? 'border-[var(--orange)] shadow-[0_0_30px_rgba(255,107,53,0.15)] ring-2 ring-[var(--orange)]/30'
                            : 'border-[var(--border)] hover:border-orange-500/40 hover:shadow-lg'
                        }`}
                        style={{ background: 'var(--bg-card)' }}
                      >
                        {/* Gradient Top Header */}
                        <div className="relative h-16 overflow-hidden flex items-end px-5 pb-2.5"
                          style={{ background: isSelected ? 'linear-gradient(135deg, rgba(255,107,53,0.2) 0%, rgba(255,140,66,0.08) 100%)' : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                          <div className="relative z-10 flex items-center justify-between w-full">
                            <span className="text-xs font-black uppercase tracking-wider text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30">
                              {orderNumber}
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_COLORS[d.order.status] ?? 'bg-gray-500/10 text-gray-500 border-gray-500/30'}`}>
                              {ORDER_STATUS_LABELS[d.order.status]}
                            </span>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-5 pt-2 space-y-3">
                          <div>
                            <p className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>{d.order.customer?.name ?? 'Cliente'}</p>
                            <p className="text-xs font-semibold flex items-center gap-1.5 mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--orange)]" />
                              <span className="truncate">{d.order.delivery_address}</span>
                            </p>
                          </div>

                          {(() => {
                            const slaMinutes = Math.floor((Date.now() - new Date(d.order.updated_at || d.order.created_at).getTime()) / 60000);
                            if (d.order.status === 'shipping' && slaMinutes >= 15) {
                              return (
                                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase px-3 py-1.5 rounded-xl animate-pulse">
                                  <AlertTriangle className="w-3.5 h-3.5" /> SLA Crítico: {slaMinutes} min en camino
                                </div>
                              );
                            }
                            return null;
                          })()}

                          <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{formatCurrency(d.order.total)}</span>
                            {d.rider_name && (
                              <span className="text-[9px] font-black uppercase bg-violet-500/10 text-violet-400 px-2.5 py-1 rounded-full border border-violet-500/30">
                                {DELIVERY_STATUS_LABELS[d.status] || d.status}
                              </span>
                            )}
                          </div>

                          {/* Rider assignment */}
                          <div className="pt-2">
                            {d.rider_name ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                                  <UserCheck className="h-3.5 w-3.5" /> {d.rider_name}
                                </p>
                                <select
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={async (e) => {
                                    const selectedRider = dbRiders.find(r => r.id === e.target.value);
                                    if (!selectedRider) return;
                                    try { await assignRider(d.order_id, selectedRider.id, selectedRider.name); }
                                    catch (err) { setMessage(err instanceof Error ? err.message : 'Error al reasignar'); }
                                  }}
                                  className="text-[10px] font-black px-3 py-2 rounded-xl border w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all cursor-pointer"
                                  style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                  defaultValue=""
                                >
                                  <option value="" disabled>🔄 Reasignar repartidor...</option>
                                  {dbRiders.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name} {r.is_available ? '🟢 Libre' : '🔴 Ocupado'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <select
                                onClick={(e) => e.stopPropagation()}
                                onChange={async (e) => {
                                  const selectedRider = dbRiders.find(r => r.id === e.target.value);
                                  if (!selectedRider) return;
                                  try { await assignRider(d.order_id, selectedRider.id, selectedRider.name); }
                                  catch (err) { setMessage(err instanceof Error ? err.message : 'Error al asignar'); }
                                }}
                                className="text-[10px] font-black px-3 py-2 rounded-xl border w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all cursor-pointer"
                                style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                defaultValue=""
                              >
                                <option value="" disabled>Seleccionar Repartidor...</option>
                                {dbRiders.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} {r.is_available ? '🟢 Libre' : '🔴 Ocupado'}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Status advance button */}
                          {nextAction && d.order.status !== 'delivered' && d.order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(d.order_id, nextAction.to); }}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs text-white transition-all hover:scale-[1.01] active:scale-95 shadow-md cursor-pointer"
                              style={{ background: 'var(--orange)' }}
                            >
                              <nextAction.icon className="w-3.5 h-3.5" />
                              Avanzar: {nextAction.label}
                            </button>
                          )}

                          {d.order.status === 'delivered' && (
                            <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-black">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination Bar */}
              <div className="flex items-center justify-between px-5 py-3 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  Mostrando {filteredDeliveries.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredDeliveries.length)} de {filteredDeliveries.length} envíos
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={safePage <= 1}
                    className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-black px-2" style={{ color: 'var(--text-primary)' }}>
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={safePage >= totalPages}
                    className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: GPS Map */}
            <div className="xl:col-span-2 space-y-6 animate-fade-in-up delay-100 flex flex-col">
              <div className="card p-5 lg:p-6 flex-1 flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-lg font-black flex items-center gap-3">
                    <Navigation className="h-6 w-6 text-[var(--orange)]" /> GPS en Tiempo Real
                  </p>
                  <span className="text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3.5 py-1.5 rounded-full shadow-sm">
                    ● Monitoreo Activo Repartidores Propios
                  </span>
                </div>

                {active && (
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
                    <div className="flex items-center gap-3 flex-1">
                      <MapPin className="h-4 w-4 text-[var(--orange)] shrink-0" />
                      <div>
                        <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{active.order.customer?.name ?? 'Cliente'}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{active.order.delivery_address}</p>
                        
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[var(--text-muted)]">Repartidor:</span>
                          <select
                            value={active.rider_id ?? ''}
                            onChange={async (e) => {
                              const newRiderId = e.target.value;
                              const rider = dbRiders.find(r => r.id === newRiderId);
                              try {
                                if (newRiderId && rider) {
                                  await deliveryService.update(active.order_id, {
                                    rider_id: rider.id,
                                    rider_name: rider.name || rider.full_name,
                                    status: 'assigned'
                                  });
                                } else {
                                  await deliveryService.update(active.order_id, {
                                    rider_id: undefined,
                                    rider_name: undefined,
                                    status: 'searching'
                                  });
                                  await updateOrderStatus(active.order_id, 'ready');
                                }
                                setMessage('Repartidor actualizado correctamente.');
                                setTimeout(() => setMessage(null), 3000);
                              } catch (err) {
                                console.error('Error reasignando repartidor:', err);
                                setMessage('Error al reasignar el repartidor.');
                              }
                            }}
                            className="text-[10px] font-black px-2 py-1 rounded-md border bg-[var(--bg-card)] outline-none cursor-pointer"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            <option value="">Sin Asignar (Pool)</option>
                            {dbRiders.map(r => (
                              <option key={r.id} value={r.id}>{r.name} {r.is_available ? '🟢 Libre' : '🔴 Ocupado'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30">
                        {ORDER_STATUS_LABELS[active.order.status]}
                      </span>
                      <button 
                        onClick={() => {
                          const token = active.order.tracking_token || active.order.id;
                          const url = `${window.location.origin}/public/rastreo/${token}`;
                          navigator.clipboard.writeText(url);
                          setMessage('Enlace de rastreo copiado al portapapeles');
                          setTimeout(() => setMessage(null), 3000);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black text-white bg-[var(--orange)] hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        <Share2 className="w-3 h-3" /> Compartir Rastreo
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative rounded-2xl overflow-hidden border shadow-inner flex-1 min-h-[400px] lg:min-h-[500px]" style={{ borderColor: 'var(--border)' }}>
                  <MapComponent
                    riderCoords={coords}
                    deliveryAddress={active?.order.delivery_address ?? ''}
                    restaurantCoords={[settings?.restaurant_lat ?? 3.2311, settings?.restaurant_lng ?? -76.4167]}
                  />
                </div>
              </div>

              {/* Order History */}
              {active && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
                    Historial del Pedido · {active.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${active.order_id.slice(0,6).toUpperCase()}`}
                  </p>
                  <OrderHistoryPanel orderId={active.order_id} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
