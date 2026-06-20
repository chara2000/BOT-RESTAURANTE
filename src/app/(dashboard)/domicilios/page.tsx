'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, UserCheck, Bike } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/types';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const RIDERS = ['Carlos M.', 'Andrea R.', 'Diego P.', 'Laura S.'];

export default function DomiciliosPage() {
  const { deliveries, assignRider, updateRiderPosition } = useAppData();
  const [selected, setSelected] = useState(deliveries[0]?.order_id ?? '');
  const [gpsRunning, setGpsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = deliveries.find((d) => d.order_id === selected) ?? deliveries[0];
  const coords: [number, number] = active ? [active.latitude, active.longitude] : [6.2088, -75.5678];

  useEffect(() => {
    if (!gpsRunning || !active) return;
    const id = setInterval(() => {
      updateRiderPosition(active.order_id, active.latitude + (Math.random() - 0.5) * 0.002, active.longitude + (Math.random() - 0.5) * 0.002);
    }, 3000);
    return () => clearInterval(id);
  }, [gpsRunning, active, updateRiderPosition]);

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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-[var(--orange-soft)] text-[var(--orange)] shadow-sm">
                 <Bike className="w-5 h-5" />
              </div>
              <p className="text-lg font-black text-[var(--text-primary)]">Envíos Activos</p>
            </div>
            
            <div className="space-y-4">
              {deliveries.map((d) => (
                <button key={d.order_id} onClick={() => setSelected(d.order_id)}
                  className="card p-5 w-full text-left transition-all duration-300 hover:shadow-lg relative overflow-hidden group"
                  style={{ 
                    borderColor: selected === d.order_id ? 'var(--orange)' : 'var(--border)',
                    boxShadow: selected === d.order_id ? '0 0 20px var(--orange-glow)' : ''
                  }}>
                  
                  {selected === d.order_id && (
                    <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--orange)] shadow-[0_0_8px_var(--orange)]" />
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black tracking-wider uppercase" style={{ color: 'var(--orange)' }}>
                      {d.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${d.order.id.slice(0, 6).toUpperCase()}`}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-[0_0_12px_rgba(14,165,233,0.25)] bg-sky-500/10 text-sky-500 border-sky-500/30">
                      {ORDER_STATUS_LABELS[d.order.status]}
                    </span>
                  </div>

                  <p className="text-sm font-black text-[var(--text-primary)]">{d.order.customer?.name}</p>
                  <p className="text-[11px] font-medium flex items-center gap-1.5 mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--orange)]" />{d.order.delivery_address}
                  </p>

                  <p className="text-sm font-black mt-3 mb-2">{formatCurrency(d.order.total)}</p>
                  
                  <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    {d.rider_name ? (
                      <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-xl w-max">
                        <UserCheck className="h-4 w-4" />{d.rider_name}
                      </p>
                    ) : (
                      <select onClick={(e) => e.stopPropagation()} onChange={async (e) => { try { await assignRider(d.order_id, e.target.value); setMessage(null); } catch (err) { setMessage(err instanceof Error ? err.message : 'Error al asignar'); } }}
                        className="text-[11px] font-black px-3 py-2 rounded-xl border w-full shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all cursor-pointer"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        defaultValue="">
                        <option value="" disabled>Seleccionar Repartidor...</option>
                        {RIDERS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 space-y-6 animate-fade-in-up delay-100 flex flex-col">
            <div className="card p-5 lg:p-6 flex-1 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-lg font-black flex items-center gap-3">
                  <Navigation className="h-6 w-6 text-[var(--orange)]" /> GPS en Tiempo Real
                </p>
                <button onClick={() => setGpsRunning(!gpsRunning)}
                  className="text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-sm transition-all hover:scale-105 active:scale-95 border"
                  style={{
                    background: gpsRunning ? 'var(--orange)' : 'var(--bg-input)',
                    color: gpsRunning ? '#fff' : 'var(--text-primary)',
                    borderColor: gpsRunning ? 'var(--orange-glow)' : 'var(--border)',
                  }}>
                  {gpsRunning ? '● Monitor Activo' : 'Iniciar Rastreo'}
                </button>
              </div>
              
              <div className="relative rounded-2xl overflow-hidden border shadow-inner flex-1 min-h-[400px] lg:min-h-[500px]" style={{ borderColor: 'var(--border)' }}>
                <MapComponent riderCoords={coords} deliveryAddress={active?.order.delivery_address ?? ''} />
                
                {!gpsRunning && (
                  <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center z-10 transition-opacity">
                    <p className="bg-[var(--bg-card)] px-6 py-3 rounded-xl text-sm font-black shadow-xl border text-[var(--text-muted)]" style={{ borderColor: 'var(--border)' }}>
                      Conexión GPS en pausa
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
