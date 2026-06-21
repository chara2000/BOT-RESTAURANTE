'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChefHat, MapPin, Clock, Bike, CheckCircle2, PackageSearch } from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import dynamic from 'next/dynamic';

// SSR must be disabled for Leaflet map
const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

export default function RastreoPublicoPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { orders } = useAppData();
  
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Buscar el pedido por el short ID (ej. T-ZOHK) o por el ID completo
    const foundOrder = orders.find(o => {
      if (o.id === id) return true;
      const match = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
      if (match && match[1] === id) return true;
      return false;
    });

    setOrder(foundOrder || null);
    setLoading(false);
  }, [id, orders]);

  if (loading) {
    return <div className="h-screen w-full flex items-center justify-center bg-[var(--bg-app)]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[var(--orange)]"></div></div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-app)] text-center p-6">
        <PackageSearch className="w-20 h-20 text-[var(--text-muted)] mb-4 opacity-50" />
        <h1 className="text-2xl font-black text-[var(--text-primary)]">Pedido no encontrado</h1>
        <p className="text-[var(--text-muted)] mt-2">Verifica que el enlace sea correcto.</p>
      </div>
    );
  }

  const isDelivered = order.status === 'delivered';
  const isShipping = order.status === 'shipping';
  const isPreparing = order.status === 'preparing' || order.status === 'confirmed';

  // Coordenadas simuladas para el ejemplo, pero deberían venir del pedido/repartidor
  const riderCoords: [number, number] = [6.2115, -75.5720];

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col">
      {/* Header Público */}
      <header className="p-4 bg-[var(--bg-card)] border-b shadow-sm flex items-center justify-between z-10" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--orange)] to-[#ff8a4c] shadow-[0_4px_12px_var(--orange-glow)]">
            <ChefHat className="text-white w-6 h-6" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-none text-[var(--text-primary)]">ChefFlow</p>
            <span style={{ color: 'var(--orange)' }} className="text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 block">
              Rastreo de Pedido
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-[var(--orange)]">{id}</p>
          <p className="text-xs text-[var(--text-muted)] font-bold">Estado en vivo</p>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapComponent 
            riderCoords={riderCoords} 
            deliveryAddress={order.delivery_address || 'Dirección de cliente'} 
            className="w-full h-full"
            isPublic={true}
          />
        </div>

        {/* Panel Inferior Flotante */}
        <div className="mt-auto relative z-10 p-4 md:p-6 pb-8 bg-gradient-to-t from-[var(--bg-app)] via-[var(--bg-app)] to-transparent pt-32 pointer-events-none">
          <div className="bg-[var(--bg-card)] rounded-3xl p-5 md:p-6 shadow-2xl border pointer-events-auto max-w-xl mx-auto backdrop-blur-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <h2 className="text-xl font-black mb-1">¡Hola, {order.customer?.name || 'Cliente'}!</h2>
            
            {isDelivered && (
              <p className="text-sm text-emerald-500 font-bold flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5" /> Tu pedido ha sido entregado. ¡Disfrútalo!
              </p>
            )}
            {isShipping && (
              <p className="text-sm text-[var(--orange)] font-bold flex items-center gap-2 mb-4">
                <Bike className="w-5 h-5" /> Tu pedido va en camino.
              </p>
            )}
            {isPreparing && (
              <p className="text-sm text-[var(--text-primary)] font-bold flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-[var(--orange)]" /> Estamos preparando tu pedido.
              </p>
            )}
            {(!isDelivered && !isShipping && !isPreparing) && (
              <p className="text-sm text-[var(--text-primary)] font-bold flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-[var(--orange)]" /> Pedido recibido, pronto empezaremos.
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-[var(--bg-input)] p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <MapPin className="w-5 h-5 text-[var(--orange)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Dirección de entrega</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{order.delivery_address || 'No especificada'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-[var(--bg-input)] p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <Clock className="w-5 h-5 text-[var(--orange)] shrink-0" />
                <div>
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Hora del Pedido</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
