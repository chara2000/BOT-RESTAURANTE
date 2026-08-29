'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  ChefHat, MapPin, Clock, Bike, CheckCircle2, PackageSearch, 
  AlertTriangle, Navigation, Star, ChevronUp, ChevronDown, Check, ShoppingBag
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { ratingsService } from '@/services/api';
import { formatCurrency } from '@/lib/utils';

// SSR must be disabled for Leaflet map
const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const STATUS_INFO: Record<string, { label: string; icon: string; color: string }> = {
  pending:   { label: 'Pedido Recibido',       icon: '⏳', color: 'text-yellow-500' },
  confirmed: { label: 'Confirmado — En Cola',   icon: '✅', color: 'text-sky-500' },
  preparing: { label: 'Preparando tu Pedido',   icon: '🍳', color: 'text-orange-500' },
  ready:     { label: 'Listo para Despachar',   icon: '🛍️', color: 'text-indigo-500' },
  shipping:  { label: 'En Camino',              icon: '🛵', color: 'text-violet-500' },
  delivered: { label: '¡Entregado!',            icon: '🎉', color: 'text-emerald-500' },
  cancelled: { label: 'Cancelado',              icon: '❌', color: 'text-red-500' },
};

export default function RastreoPublicoPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const [order, setOrder] = useState<any>(null);
  const [delivery, setDelivery] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [restaurantCoords, setRestaurantCoords] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocodingFailed, setGeocodingFailed] = useState(false);

  // Bottom Sheet expansion state
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // Rating States
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [foodRating, setFoodRating] = useState(5);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [ratingComments, setRatingComments] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // 1. Carga inicial de datos
  useEffect(() => {
    if (!id) return;

    const fetchTrackingData = async () => {
      try {
        const res = await fetch(`/api/public/rastreo/${id}`);
        if (!res.ok) throw new Error('Pedido no encontrado');
        const data = await res.json();
        setOrder(data.order);
        setDelivery(data.delivery);
        
        // Cargar coordenadas del restaurante
        if (data.restaurantCoords?.lat && data.restaurantCoords?.lng) {
          setRestaurantCoords([data.restaurantCoords.lat, data.restaurantCoords.lng]);
        }
        
        if (data.orderId) {
          setOrderId(data.orderId);
        } else if (data.delivery?.order_id || data.order?.id) {
          setOrderId(data.delivery?.order_id || data.order?.id);
        }
        
        setError(null);

        // Detectar si la dirección es aproximada
        const addr: string = data.order?.delivery_address || '';
        const isGpsCoord = /ubicaci[oó]n gps/i.test(addr);
        const isVeryShort = addr.length < 10;
        setGeocodingFailed(isGpsCoord || isVeryShort);

        // Si ya está entregado, verificar si ya calificó
        if (data.order?.status === 'delivered') {
          const ratingData = await ratingsService.getForOrder(data.orderId || data.order.id);
          if (!ratingData) {
            setShowRatingModal(true);
          } else {
            setRatingSubmitted(true);
          }
        }
      } catch (err) {
        console.error('Error fetching tracking data:', err);
        setError('No se pudo encontrar el pedido o no hay conexión.');
      } finally {
        setLoading(false);
      }
    };

    fetchTrackingData();
  }, [id]);

  // 2. Suscripción en tiempo real usando Supabase Client
  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !orderId) return;

    const channel = supabase
      .channel(`delivery-realtime-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_details',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as any;
            setDelivery((prev: any) => ({
              ...prev,
              latitude: row.latitude != null ? Number(row.latitude) : prev?.latitude,
              longitude: row.longitude != null ? Number(row.longitude) : prev?.longitude,
              status: row.status,
              estimated_arrival: row.estimated_arrival,
            }));
            
            if (row.status === 'delivered') {
              setOrder((prev: any) => ({ ...prev, status: 'delivered' }));
              setShowRatingModal(true);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setOrder((prev: any) => ({
            ...prev,
            status: row.status,
          }));

          if (row.status === 'delivered') {
            setShowRatingModal(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleSendRating = async () => {
    if (!orderId) return;
    try {
      await ratingsService.create({
        order_id: orderId,
        food_rating: foodRating,
        delivery_rating: deliveryRating,
        comments: ratingComments
      });
      setRatingSubmitted(true);
      setShowRatingModal(false);
    } catch (err) {
      alert('Error al guardar la calificación');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[var(--bg-app)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[var(--orange)]"></div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>Cargando rastreo...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-app)] text-center p-6">
        <PackageSearch className="w-20 h-20 text-[var(--text-muted)] mb-4 opacity-50" />
        <h1 className="text-2xl font-black text-[var(--text-primary)]">Pedido no encontrado</h1>
        <p className="text-[var(--text-muted)] mt-2">{error || 'Verifica que el enlace sea correcto.'}</p>
      </div>
    );
  }

  const statusInfo = STATUS_INFO[order.status] || STATUS_INFO['pending'];
  const isDelivered = order.status === 'delivered';
  const isShipping = order.status === 'shipping';
  const isCancelled = order.status === 'cancelled';

  const mapCenter: [number, number] = restaurantCoords ?? [3.2311, -76.4167];

  const riderCoords: [number, number] = delivery?.latitude && delivery?.longitude
    ? [Number(delivery.latitude), Number(delivery.longitude)]
    : mapCenter;

  const STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered'];
  const currentStep = isCancelled ? -1 : STEPS.indexOf(order.status);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col relative overflow-hidden">
      {/* Header Público */}
      <header className="p-4 bg-[var(--bg-card)] border-b shadow-sm flex items-center justify-between z-10" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--orange)] to-[#ff8a4c] shadow-[0_4px_12px_var(--orange-glow)]">
            <ChefHat className="text-white w-6 h-6" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-none text-[var(--text-primary)]">ChefFlow</p>
            <span style={{ color: 'var(--orange)' }} className="text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 block">
              Rastreo en Tiempo Real
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-[var(--orange)]">Rastreo Activo</p>
          <div className="flex items-center gap-1 justify-end">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] text-emerald-500 font-black uppercase">EN VIVO</p>
          </div>
        </div>
      </header>

      {/* Mapa Leaflet */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapComponent 
            riderCoords={riderCoords} 
            deliveryAddress={order.delivery_address || 'Dirección de cliente'} 
            className="w-full h-full"
            isPublic={true}
            restaurantCoords={mapCenter}
          />
        </div>

        {/* Indicador de geocoding fallido */}
        {geocodingFailed && !isDelivered && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-amber-700 border border-amber-300"
            style={{ background: 'rgba(254,243,199,0.95)', backdropFilter: 'blur(8px)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Ubicación aproximada del cliente
          </div>
        )}

        {/* Panel Inferior Flotante (Bottom Sheet de Rappi) */}
        <div className="mt-auto relative z-10 p-4 md:p-6 pb-8 bg-gradient-to-t from-[var(--bg-app)] via-[var(--bg-app)] to-transparent pt-32 pointer-events-none">
          <div className="bg-[var(--bg-card)] rounded-3xl shadow-2xl border pointer-events-auto max-w-xl mx-auto backdrop-blur-xl overflow-hidden transition-all duration-500" style={{ borderColor: 'var(--border)' }}>
            
            {/* Cabecera del Bottom Sheet - Deslizable */}
            <div 
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="px-5 pt-4 pb-3 border-b flex flex-col items-center cursor-pointer hover:bg-[var(--bg-input)]/50 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Barra central táctil */}
              <div className="w-10 h-1 bg-[var(--border)] rounded-full mb-3" />
              
              <div className="flex items-center justify-between w-full">
                <div>
                  <h2 className="text-base font-black">¡Hola, {order.customer?.name || 'Cliente'}!</h2>
                  <p className={`text-xs font-bold ${statusInfo.color} flex items-center gap-1.5 mt-0.5`}>
                    <span>{statusInfo.icon}</span> {statusInfo.label}
                  </p>
                </div>
                <div className="p-1.5 rounded-lg bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  {isDetailsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </div>
              </div>

              {/* Barra de progreso */}
              {!isCancelled && (
                <div className="mt-4 flex items-center gap-1 w-full">
                  {STEPS.map((step, i) => (
                    <div key={step} className="flex-1 flex items-center gap-1">
                      <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                         i <= currentStep 
                           ? 'bg-[var(--orange)] shadow-[0_0_6px_var(--orange-glow)]' 
                           : 'bg-[var(--bg-input)]'
                      }`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contenido Expandido: Detalles del Pedido */}
            <div className={`overflow-y-auto transition-all duration-500 ease-in-out ${isDetailsExpanded ? 'max-h-[300px] border-b opacity-100 p-5' : 'max-h-0 opacity-0'}`} style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--orange)] mb-3 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4" />
                <span>Resumen de tu Compra</span>
              </h3>
              <div className="space-y-3 mb-4">
                {order.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center text-xs font-bold">
                    <span style={{ color: 'var(--text-muted)' }}>
                      {item.quantity}x {item.product?.name}
                    </span>
                    <span>{formatCurrency(item.total_price)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t space-y-1.5 text-xs font-bold" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                  <span>Subtotal:</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                  <span>Envío:</span>
                  <span>{formatCurrency(order.delivery_fee)}</span>
                </div>
                <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                  <span>Propina:</span>
                  <span>{formatCurrency(order.tips)}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1.5">
                  <span>Total:</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
            </div>

            {/* Detalles Rápidos del Repartidor */}
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3 bg-[var(--bg-input)] p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <MapPin className="w-5 h-5 text-[var(--orange)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Dirección de entrega</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] break-words">{order.delivery_address || 'No especificada'}</p>
                </div>
              </div>

              {delivery?.profiles && (
                <div className="flex items-center justify-between bg-[var(--bg-input)] p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <Bike className="w-5 h-5 text-[var(--orange)] shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Repartidor Asignado</p>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {delivery.profiles.name}
                      </p>
                    </div>
                  </div>
                  {isShipping && (
                    <span className="text-[9px] font-black uppercase bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full border border-violet-500/30 animate-pulse">GPS Activo</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Calificación Rappi (Feedback) */}
      {showRatingModal && !ratingSubmitted && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--bg-card)] rounded-3xl p-6 max-w-sm w-full border text-center shadow-2xl space-y-5" style={{ borderColor: 'var(--border)' }}>
            
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                <Check className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-black">¡Pedido Entregado!</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Ayúdanos a mejorar calificando tu experiencia:</p>
            </div>

            {/* Calificación Comida */}
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--orange)' }}>🍔 ¿Qué tal estuvo la comida?</p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFoodRating(star)}
                    className="p-1 transition-all hover:scale-110 cursor-pointer"
                  >
                    <Star className={`w-7 h-7 ${star <= foodRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Calificación Repartidor */}
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--orange)' }}>🛵 ¿Qué tal el servicio de entrega?</p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setDeliveryRating(star)}
                    className="p-1 transition-all hover:scale-110 cursor-pointer"
                  >
                    <Star className={`w-7 h-7 ${star <= deliveryRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Comentarios */}
            <div className="space-y-1.5">
              <textarea
                placeholder="Escribe comentarios adicionales (opcional)..."
                value={ratingComments}
                onChange={(e) => setRatingComments(e.target.value)}
                className="w-full text-xs p-3 rounded-2xl border bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] min-h-[70px] resize-none"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>

            <button
              onClick={handleSendRating}
              className="w-full py-3 rounded-2xl text-xs font-black text-white hover:scale-[1.02] active:scale-95 transition-all shadow-md cursor-pointer"
              style={{ background: 'var(--orange)' }}
            >
              Enviar Calificación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
