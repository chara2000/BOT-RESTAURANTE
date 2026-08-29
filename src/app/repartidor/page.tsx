'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bike, Navigation, MapPin, User, CheckCircle2, AlertTriangle, 
  Play, Check, Bell, Power, Compass, Map, Store, PackageCheck, LogOut, Clock
} from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/types';
import { ridersService } from '@/services/api';
import { createClient } from '@/lib/supabase/client';

export default function RepartidorPage() {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { deliveries, updateOrderStatus, updateRiderPosition, assignRider } = useAppData();
  const router = useRouter();

  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [incomingOrder, setIncomingOrder] = useState<any>(null);
  const [timer, setTimer] = useState<number>(30);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Redirección si no está autenticado o no es repartidor
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'delivery')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Carga inicial de la disponibilidad del repartidor
  useEffect(() => {
    if (user?.id) {
      ridersService.getProfile(user.id).then((profile) => {
        if (profile) {
          setIsAvailable(profile.is_available);
        }
      }).catch(console.error);
    }
  }, [user]);

  // Filtrar pedidos activos asignados a este repartidor
  const activeDeliveries = deliveries.filter(
    (d) => d.rider_id === user?.id && d.order.status !== 'delivered' && d.order.status !== 'cancelled'
  );

  useEffect(() => {
    if (activeDeliveries.length > 0) {
      setActiveDelivery(activeDeliveries[0]);
    } else {
      setActiveDelivery(null);
    }
  }, [deliveries, user]);

  // Detectar ofertas entrantes de pedidos (en estado ready y asignados a este repartidor pero no confirmados aún)
  useEffect(() => {
    const unconfirmed = deliveries.find(
      (d) => d.rider_id === user?.id && d.status === 'assigned' && d.order.status === 'ready'
    );

    if (unconfirmed && !activeDelivery) {
      setIncomingOrder(unconfirmed);
      startAlarm();
    } else {
      setIncomingOrder(null);
      stopAlarm();
    }
  }, [deliveries, user, activeDelivery]);

  // Manejar el temporizador de aceptación de 30 segundos
  useEffect(() => {
    if (incomingOrder) {
      setTimer(30);
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            handleRejectOrder();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [incomingOrder]);

  const startAlarm = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      
      if (!audioContextRef.current) {
        const ctx = new AudioCtxClass();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        audioContextRef.current = ctx;
      }

      audioIntervalRef.current = setInterval(() => {
        const ctx = audioContextRef.current;
        if (!ctx || ctx.state !== 'running') return;
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime); // La natural
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch {
          // ignore audio osc errors
        }
      }, 800);
    } catch {
      // ignore
    }
  };

  const stopAlarm = () => {
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const handleToggleAvailability = async () => {
    if (!user?.id) return;
    try {
      const nextState = !isAvailable;
      await ridersService.updateAvailability(user.id, nextState);
      setIsAvailable(nextState);
    } catch (err) {
      alert('Error al cambiar disponibilidad.');
    }
  };

  const handleAcceptOrder = async () => {
    if (!incomingOrder) return;
    stopAlarm();
    try {
      const orderId = incomingOrder.order_id;
      // Actualizar el estado de la entrega a 'picked_up' e iniciar ruta
      const supabase = createClient();
      if (supabase) {
        await supabase
          .from('delivery_details')
          .update({ status: 'assigned', updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
        
        await updateOrderStatus(orderId, 'shipping');
      }
      setIncomingOrder(null);
      startTracking(orderId);
    } catch (err) {
      alert('Error al aceptar el pedido');
    }
  };

  const handleRejectOrder = async () => {
    if (!incomingOrder) return;
    stopAlarm();
    try {
      const orderId = incomingOrder.order_id;
      const supabase = createClient();
      if (supabase) {
        // Des-asignar quitando el rider_id y regresándolo a buscando
        await supabase
          .from('delivery_details')
          .update({ rider_id: null, status: 'searching', updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
      }
      setIncomingOrder(null);
    } catch (err) {
      alert('Error al rechazar el pedido');
    }
  };

  const startTracking = (orderId: string) => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setGpsError(null);

    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setGpsCoords({ latitude, longitude });

          // Throttling: Solo escribir a Supabase cada 10 segundos
          const now = Date.now();
          if (now - lastUpdateRef.current > 10000) {
            updateRiderPosition(orderId, latitude, longitude);
            // Registrar logs de auditoría de ruta en Supabase
            const supabase = createClient();
            if (supabase) {
              Promise.resolve(supabase.from('route_logs').insert({
                delivery_id: activeDelivery?.id || orderId,
                latitude,
                longitude
              })).catch(() => {});
            }
            lastUpdateRef.current = now;
          }
        },
        (err) => {
          console.error('GPS error:', err);
          setGpsError('Señal GPS débil o permiso denegado.');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
      watchIdRef.current = watchId;
    } else {
      setGpsError('Geolocalización no soportada.');
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsCoords(null);
  };

  useEffect(() => {
    if (activeDelivery) {
      startTracking(activeDelivery.order_id);
    } else {
      stopTracking();
    }
    return () => stopTracking();
  }, [activeDelivery]);

  // Avanzar por los pasos lógicos del Repartidor (Sincronizado con el Kanban)
  const handleAdvanceStep = async () => {
    if (!activeDelivery) return;
    const currentStatus = activeDelivery.status; // status en delivery_details
    let nextDeliveryStatus = '';

    if (currentStatus === 'assigned') {
      nextDeliveryStatus = 'arrived_at_store'; // Llegó a tienda
    } else if (currentStatus === 'arrived_at_store') {
      nextDeliveryStatus = 'picked_up'; // Pedido recogido
    } else if (currentStatus === 'picked_up') {
      nextDeliveryStatus = 'arrived_at_customer'; // Llegó a cliente
    } else if (currentStatus === 'arrived_at_customer') {
      nextDeliveryStatus = 'delivered'; // Entregado
    }

    try {
      const supabase = createClient();
      if (!supabase) return;

      if (nextDeliveryStatus === 'delivered') {
        stopTracking();
        await updateOrderStatus(activeDelivery.order_id, 'delivered');
        await supabase
          .from('delivery_details')
          .update({ status: 'delivered', updated_at: new Date().toISOString() })
          .eq('order_id', activeDelivery.order_id);
      } else {
        await supabase
          .from('delivery_details')
          .update({ status: nextDeliveryStatus, updated_at: new Date().toISOString() })
          .eq('order_id', activeDelivery.order_id);
      }
    } catch (err) {
      alert('Error al avanzar de estado operativo');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[var(--orange)]" />
      </div>
    );
  }

  const shortId = activeDelivery?.order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || 
    (activeDelivery ? `#${activeDelivery.order_id.slice(0, 6).toUpperCase()}` : '');

  // Determinar la etiqueta y estilo del paso operativo actual
  const getStepButtonLabel = () => {
    if (!activeDelivery) return '';
    switch (activeDelivery.status) {
      case 'assigned':
        return 'Marcar: Llegué al Establecimiento';
      case 'arrived_at_store':
        return 'Confirmar: Pedido Recogido';
      case 'picked_up':
        return 'Marcar: Llegué al Domicilio';
      case 'arrived_at_customer':
        return 'Confirmar: Pedido Entregado';
      default:
        return 'Ruta Completada';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-[var(--font-outfit)] flex flex-col pb-8">
      {/* Header Premium */}
      <header className="p-4 bg-[var(--bg-card)] border-b shadow-sm sticky top-0 z-30" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-[var(--orange-soft)] text-[var(--orange)] shadow-md">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight">{user?.name}</h1>
              <p className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {isAvailable ? 'CONECTADO - EN SERVICIO' : 'DESCONECTADO'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Disponibilidad Switch */}
            <button
              onClick={handleToggleAvailability}
              className={`p-2 rounded-xl transition-all cursor-pointer ${isAvailable ? 'bg-emerald-600 text-white' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border)]'}`}
              title="Cambiar Disponibilidad"
            >
              <Power className="w-4 h-4" />
            </button>
            {/* Cerrar Sesión */}
            <button
              onClick={() => signOut()}
              className="p-2 rounded-xl bg-rose-600/10 text-rose-500 border border-rose-500/20 transition-all hover:bg-rose-600 hover:text-white cursor-pointer"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-6 space-y-6">
        {/* Alerta de Oferta Entrante con Timbre de Rappi */}
        {incomingOrder && (
          <div className="p-5 rounded-3xl border bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-2xl animate-pulse relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-lg" />
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-6 h-6 animate-bounce" />
              <div>
                <h3 className="text-base font-black tracking-tight">¡Nuevo Pedido Asignado!</h3>
                <p className="text-[10px] text-orange-100 font-bold uppercase tracking-wider">Acepta antes de que expire</p>
              </div>
            </div>

            <div className="bg-white/15 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span>Cliente:</span>
                <span>{incomingOrder.order.customer?.name}</span>
              </div>
              <div className="flex items-start justify-between text-xs font-bold mb-2 gap-4">
                <span className="shrink-0">Destino:</span>
                <span className="text-right truncate max-w-[200px]">{incomingOrder.order.delivery_address}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span>Total a cobrar:</span>
                <span className="text-sm font-black">{formatCurrency(incomingOrder.order.total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRejectOrder}
                className="py-3 rounded-2xl text-xs font-black text-white bg-white/20 hover:bg-white/30 transition-all active:scale-95 cursor-pointer border border-white/10"
              >
                Rechazar
              </button>
              <button
                onClick={handleAcceptOrder}
                className="py-3 rounded-2xl text-xs font-black text-orange-600 bg-white hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center gap-1"
              >
                Aceptar ({timer}s)
              </button>
            </div>
          </div>
        )}

        {/* Pedido Activo en Curso */}
        {activeDelivery ? (
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[var(--orange)]" />
              <span>Entrega en Curso</span>
            </h2>

            <div className="card p-5 border relative overflow-hidden" style={{ borderColor: 'var(--orange)', boxShadow: '0 0 15px var(--orange-glow)' }}>
              <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--orange)]" />

              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--orange)]">
                  {shortId}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/30">
                  {activeDelivery.status === 'assigned' && '🛵 Hacia la Tienda'}
                  {activeDelivery.status === 'arrived_at_store' && '🍳 En la Tienda (Retirando)'}
                  {activeDelivery.status === 'picked_up' && '🚚 En Camino al Domicilio'}
                  {activeDelivery.status === 'arrived_at_customer' && '🔔 En la Puerta del Cliente'}
                </span>
              </div>

              {/* Trazado Visual de Pasos */}
              <div className="flex items-center justify-between gap-1 mb-6 bg-[var(--bg-input)] p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col items-center flex-1">
                  <Store className={`w-5 h-5 ${['arrived_at_store', 'picked_up', 'arrived_at_customer'].includes(activeDelivery.status) ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
                  <span className="text-[8px] font-bold mt-1">Negocio</span>
                </div>
                <div className="h-0.5 bg-[var(--border)] flex-1" />
                <div className="flex flex-col items-center flex-1">
                  <PackageCheck className={`w-5 h-5 ${['picked_up', 'arrived_at_customer'].includes(activeDelivery.status) ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
                  <span className="text-[8px] font-bold mt-1">Recogido</span>
                </div>
                <div className="h-0.5 bg-[var(--border)] flex-1" />
                <div className="flex flex-col items-center flex-1">
                  <MapPin className={`w-5 h-5 ${['arrived_at_customer'].includes(activeDelivery.status) ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
                  <span className="text-[8px] font-bold mt-1">Destino</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-[var(--bg-input)] p-3.5 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cliente</p>
                  <p className="text-sm font-black mt-0.5">{activeDelivery.order.customer?.name}</p>
                  <p className="text-xs mt-1 flex items-start gap-1.5 text-[var(--text-muted)]">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--orange)]" />
                    <span>{activeDelivery.order.delivery_address}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between px-2 pt-2">
                  <span className="text-sm font-black">{formatCurrency(activeDelivery.order.total)}</span>
                  {gpsCoords && (
                    <span className="text-[10px] font-black text-emerald-500 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      GPS TRANSMITIENDO
                    </span>
                  )}
                </div>

                {/* Botón de Avance de Paso */}
                <button
                  onClick={handleAdvanceStep}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-xs text-white transition-all hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer"
                  style={{ background: 'var(--orange)' }}
                >
                  {getStepButtonLabel()}
                </button>
              </div>

              {gpsError && (
                <div className="mt-3 text-[10px] font-black p-2.5 rounded-xl bg-rose-500/10 border text-rose-500 border-rose-500/20 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{gpsError}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-8 border text-center" style={{ borderColor: 'var(--border)' }}>
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20 text-emerald-500" />
            <p className="text-sm font-black">¡Todo al día!</p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {isAvailable ? 'Esperando que el Administrador te asigne un pedido para la entrega.' : 'Ponte en línea en el botón superior para empezar a recibir pedidos.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
