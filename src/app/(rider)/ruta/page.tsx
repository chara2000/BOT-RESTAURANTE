'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation2, Navigation, Package, Phone, CheckCircle2 } from 'lucide-react';
import { useDeliveries, useSettings } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { getActiveTenantId } from '@/services/api';

const MapMultiDelivery = dynamic(() => import('@/components/MapMultiDelivery'), { ssr: false });

export default function RutaPage() {
  const { deliveries, updateRiderPosition } = useDeliveries();
  const { settings } = useSettings();
  const { user } = useAuth();

  const myDeliveries = deliveries.filter(
    (d) => d.rider_id === user?.id && !['delivered', 'cancelled'].includes(d.order?.status ?? '')
  );

  const defaultCoords: [number, number] = [
    settings?.restaurant_lat ?? 3.2311,
    settings?.restaurant_lng ?? -76.4167,
  ];
  const [currentPosition, setCurrentPosition] = useState<[number, number]>(defaultCoords);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // Delivery confirmation state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (myDeliveries.length === 0) { setIsTracking(false); return; }
    if (!('geolocation' in navigator)) { setGpsError('GPS no soportado'); return; }
    setIsTracking(true);
    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        setCurrentPosition([latitude, longitude]);
        myDeliveries.forEach((d) => updateRiderPosition(d.order_id, latitude, longitude).catch(console.error));
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [myDeliveries.length]);

  const activeDelivery = myDeliveries[activeIdx] ?? myDeliveries[0];
  const order = activeDelivery?.order;

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || pinInput.length !== 4) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': getActiveTenantId()
        },
        body: JSON.stringify({ pin: pinInput, rider_id: user?.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de validación');
      
      setShowPinModal(false);
      setPinInput('');
      window.location.reload();
    } catch (err: any) {
      setConfirmError(err.message);
      setConfirming(false);
    }
  };

  const handleDirectConfirm = async () => {
    if (!order) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': getActiveTenantId()
        },
        body: JSON.stringify({ rider_id: user?.id }) // No pin needed
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de validación');
      
      window.location.reload();
    } catch (err: any) {
      setConfirmError(err.message);
      setConfirming(false);
    }
  };

  if (myDeliveries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
        <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-input)] flex items-center justify-center border border-[var(--border)]">
          <Navigation className="w-8 h-8 text-[var(--text-muted)]" />
        </div>
        <h2 className="text-base font-black mb-1">Sin ruta activa</h2>
        <p className="text-xs text-[var(--text-muted)]">Acepta un pedido en "Disponibles" para ver tu ruta.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[var(--bg-app)] relative -mt-4 overflow-hidden">
      {/* Map (Top 65% of screen) */}
      <div className="flex-1 w-full relative z-0 h-[65%]">
        <MapMultiDelivery
          riderCoords={currentPosition}
          restaurantCoords={defaultCoords}
          deliveries={myDeliveries.map((d) => ({
            orderId: d.order_id,
            address: d.order?.delivery_address ?? '',
            customerName: d.order?.customer?.name ?? 'Cliente',
            isActive: d.order_id === (activeDelivery?.order_id ?? ''),
          }))}
        />
        
        {/* Floating GPS Status Overlay */}
        <div className="absolute top-4 left-4 z-[400]">
          <div className="bg-[var(--bg-card)]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-[var(--border)] shadow-md flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-[var(--orange)] animate-pulse shadow-[0_0_8px_var(--orange-glow)]' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">
              {isTracking ? 'GPS Activo' : 'Buscando GPS...'}
            </span>
          </div>
        </div>

        {/* Floating Deliveries Count Overlay */}
        <div className="absolute top-4 right-4 z-[400]">
          <span className="text-[9px] font-black uppercase bg-violet-600 text-white px-3 py-1.5 rounded-full shadow-md border border-violet-500/20">
            {myDeliveries.length} entregas
          </span>
        </div>
      </div>

      {/* Unified Bottom Sheet (Bottom 35% of screen) */}
      <div className="w-full bg-[var(--bg-card)] border-t border-[var(--border)] p-5 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] z-10 flex flex-col gap-4 max-h-[40%] overflow-y-auto">
        {/* Selector de entrega activa */}
        {myDeliveries.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {myDeliveries.map((d, i) => (
              <button
                key={d.order_id}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                  i === activeIdx
                    ? 'bg-[var(--orange)] text-white border-transparent shadow-[0_4px_12px_var(--orange-glow)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border)]'
                }`}
              >
                {d.order?.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${d.order_id.slice(0,5).toUpperCase()}`}
              </button>
            ))}
          </div>
        )}

        {order && (
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black text-[var(--orange)] bg-[var(--orange-soft)] px-2 py-0.5 rounded uppercase tracking-wider">
                  {order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${order.id.slice(0, 6).toUpperCase()}`}
                </span>
                <h2 className="text-base font-black text-[var(--text-primary)] mt-1.5 leading-tight">{order.customer?.name ?? 'Cliente'}</h2>
                <p className="text-xs font-bold text-[var(--text-muted)] mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--orange)] shrink-0" />
                  <span className="truncate">{order.delivery_address}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-500">{formatCurrency(order.delivery_fee || 5000)}</p>
                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Envío</p>
              </div>
            </div>

            {/* Quick Actions (WhatsApp & Call) */}
            <div className="flex gap-2">
              {order.customer?.phone && (
                <>
                  <a href={`tel:${order.customer.phone}`} className="flex-1 bg-blue-500/10 text-blue-600 border border-blue-500/20 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-blue-500/20 text-xs font-bold">
                    <Phone className="w-3.5 h-3.5" />
                    Llamar Cliente
                  </a>
                  <a href={`https://wa.me/57${order.customer.phone}`} target="_blank" rel="noreferrer" className="flex-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-emerald-500/20 text-xs font-bold">
                    <span>WhatsApp</span>
                  </a>
                </>
              )}
            </div>

            {gpsError && (
              <div className="text-[10px] font-bold text-rose-500 bg-rose-500/10 p-2 rounded-xl">
                ⚠️ Error GPS: {gpsError}
              </div>
            )}
          </div>
        )}

        {/* Action Panel */}
        <div className="w-full">
          {showPinModal ? (
            <div className="bg-[var(--bg-input)] border border-[var(--border)] p-4 rounded-2xl shadow-inner space-y-3">
              <h3 className="font-black text-xs text-[var(--text-primary)] text-center">Confirmar Entrega con PIN</h3>
              <form onSubmit={handleConfirmDelivery} className="space-y-2">
                <input 
                  type="text" 
                  maxLength={4}
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="0000"
                  className="w-full text-center text-2xl tracking-[1em] font-black bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--orange)] shadow-sm"
                />
                
                {confirmError && (
                  <div className="text-[10px] font-bold text-rose-500 text-center">
                    ⚠️ {confirmError}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowPinModal(false)}
                    className="flex-1 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl text-xs font-black"
                  >
                    Atrás
                  </button>
                  <button 
                    type="submit" 
                    disabled={pinInput.length !== 4 || confirming}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] text-xs font-black rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {confirming ? 'Validando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex gap-3">
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(order?.delivery_address ?? '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] text-xs font-black py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4" />
                Navegar GPS
              </a>
              <button
                onClick={() => {
                  if (order?.customer?.telegram_chat_id) {
                    setShowPinModal(true);
                  } else {
                    handleDirectConfirm();
                  }
                }}
                disabled={confirming}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] text-xs font-black py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {confirming ? 'Entregando...' : 'Entregar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
