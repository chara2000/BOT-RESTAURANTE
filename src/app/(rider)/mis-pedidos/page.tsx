'use client';

import { useState } from 'react';
import { Phone, MessageCircle, Navigation, Camera, AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useOrders, useDeliveries } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { deliveryService } from '@/services/api';
import type { OrderStatus } from '@/types';

export default function MisPedidosPage() {
  const { orders, updateStatus } = useOrders();
  const { deliveries } = useDeliveries();
  const { user } = useAuth();
  
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  
  // PoD (Proof of Delivery) State
  const [pinModalOrder, setPinModalOrder] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Filtrar los pedidos asignados a este repartidor y que estén en curso
  const myDeliveries = deliveries.filter((d) => d.rider_id === user?.id && ['assigned', 'shipping'].includes(d.status ?? ''));
  const myOrders = myDeliveries
    .map((d) => d.order)
    .filter((o): o is NonNullable<typeof o> => !!o && !['delivered', 'cancelled'].includes(o.status));

  const handleAction = async (orderId: string, nextStatus: OrderStatus, forceBypassPin = false) => {
    // Si queremos marcar como entregado y no hemos validado el PIN, abrimos el modal
    if (nextStatus === 'delivered' && !forceBypassPin) {
      setPinModalOrder(orderId);
      setPinInput('');
      setPinError('');
      return;
    }

    setLoadingOrderId(orderId);
    try {
      await updateStatus({ orderId, status: nextStatus });
      
      if (nextStatus === 'delivered') {
        // También actualizar la tabla de asignaciones a delivered
        await deliveryService.update(orderId, { status: 'delivered' });
      }
      setPinModalOrder(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handlePinSubmit = () => {
    const order = myOrders.find(o => o.id === pinModalOrder);
    const expectedPin = order?.delivery_pin || '1234'; // Fallback a 1234 si no hay PIN en BD
    
    if (pinInput === expectedPin || pinInput === '0000') { // 0000 como master pin de emergencia
      handleAction(pinModalOrder!, 'delivered', true);
    } else {
      setPinError('PIN incorrecto. Pide al cliente los 4 dígitos.');
    }
  };

  const getActionButtons = (orderId: string, status: string) => {
    switch (status) {
      case 'ready':
      case 'assigned':
      case 'shipping':
        return (
          <button
            onClick={() => handleAction(orderId, 'delivered')}
            disabled={loadingOrderId === orderId}
            className="w-full bg-[var(--orange)] text-white text-sm font-black py-3.5 rounded-xl shadow-[0_4px_16px_var(--orange-glow)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
          >
            {loadingOrderId === orderId ? 'Procesando...' : 'Marcar como Entregado'}
            <CheckCircle2 className="w-4 h-4" />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-5">
      <div className="mb-4">
        <h1 className="text-xl font-black tracking-tight mb-1">Mis Pedidos</h1>
        <p className="text-xs text-[var(--text-muted)] font-medium">
          Ruta actual y gestión de entregas asignadas.
        </p>
      </div>

      {myOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4 opacity-50">
          <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-input)] flex items-center justify-center border border-[var(--border)]">
            <Navigation className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-sm font-black mb-1">Sin entregas activas</h2>
          <p className="text-xs text-[var(--text-muted)]">Ve a "Disponibles" para tomar un nuevo pedido.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Aquí se permite agrupar múltiples pedidos renderizando la lista completa */}
          {myOrders.map((order) => {
            const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${order.id.slice(0, 6).toUpperCase()}`;
            const customerPhone = order.customer?.phone || '3000000000'; // Default o leer del cliente

            return (
              <div key={order.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-lg relative">
                {/* Indicador de SLA - Si lleva mucho tiempo en shipping */}
                <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-sm">
                    {order.payment_method === 'cash' ? 'Efectivo' : 'Pagado'}
                  </span>
                </div>

                {/* Cabecera del pedido */}
                <div className="p-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg-input)] to-transparent pr-20">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-black text-[var(--orange)] bg-[var(--orange-soft)] px-2 py-1 rounded-md uppercase tracking-wider">
                        {shortId}
                      </span>
                      <h3 className="text-base font-black mt-2 text-[var(--text-primary)] leading-tight">
                        {order.customer?.name || 'Cliente'}
                      </h3>
                      <p className="text-sm font-bold text-[var(--text-muted)] mt-1">{order.delivery_address}</p>
                    </div>
                  </div>
                  
                  <p className="text-base font-black text-[var(--orange)] drop-shadow-sm mb-4">{formatCurrency(order.total)}</p>

                  {/* Acciones Rápidas */}
                  <div className="flex gap-2">
                    <a href={`tel:${customerPhone}`} className="flex-1 bg-blue-500/10 text-blue-600 border border-blue-500/20 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-blue-500/20">
                      <Phone className="w-4 h-4" />
                      <span className="text-xs font-bold">Llamar</span>
                    </a>
                    <a href={`https://wa.me/57${customerPhone}`} target="_blank" rel="noreferrer" className="flex-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-emerald-500/20">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-xs font-bold">WhatsApp</span>
                    </a>
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(order.delivery_address || '')}`} target="_blank" rel="noreferrer" className="flex-1 bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-slate-500/20">
                      <Navigation className="w-4 h-4" />
                      <span className="text-xs font-bold">Ruta</span>
                    </a>
                  </div>
                </div>

                {/* Detalles y Progreso */}
                <div className="p-5">
                  <div className="bg-[var(--bg-input)] rounded-2xl p-4 border border-[var(--border)] mb-4 relative overflow-hidden">
                    <ShieldCheck className="absolute -right-4 -bottom-4 w-20 h-20 text-[var(--border)] opacity-30 pointer-events-none" />
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Detalle de la entrega</p>
                    <ul className="text-xs font-medium space-y-1 text-[var(--text-primary)]">
                      {order.items.map((item, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{item.quantity}x {item.product.name}</span>
                        </li>
                      ))}
                    </ul>
                    {order.notes && (
                      <div className="mt-3 pt-3 border-t border-dashed border-[var(--border)] text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <strong>Nota:</strong> {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Acciones del Repartidor */}
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] mb-2">
                    <Camera className="w-4 h-4" /> Prueba de Entrega Obligatoria
                  </div>
                  
                  {getActionButtons(order.id, order.status)}
                  
                  <button className="w-full text-[11px] font-bold text-[var(--text-muted)] underline py-3 flex items-center justify-center gap-1 mt-2">
                    <AlertTriangle className="w-3 h-3" /> Reportar Problema
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PIN Verification Modal */}
      {pinModalOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPinModalOrder(null)} />
          <div className="bg-[var(--bg-card)] w-full max-w-sm rounded-3xl p-6 relative z-10 animate-fade-in-up border border-[var(--border)] shadow-2xl">
            <button onClick={() => setPinModalOrder(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
              <X className="w-5 h-5" />
            </button>
            
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-black text-[var(--text-primary)] mb-1">Verificación de Entrega</h3>
            <p className="text-xs text-[var(--text-muted)] font-medium mb-6">
              Por seguridad, ingresa el PIN de 4 dígitos que tiene el cliente en su aplicación o recibo. (Para demo usa 1234 o 0000)
            </p>

            <div className="space-y-4">
              <input
                type="text"
                maxLength={4}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value.replace(/\D/g, ''));
                  setPinError('');
                }}
                placeholder="• • • •"
                className="w-full text-center text-3xl tracking-[1em] font-black p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
              />
              
              {pinError && (
                <p className="text-xs font-bold text-rose-500 text-center animate-shake">{pinError}</p>
              )}

              <button
                onClick={handlePinSubmit}
                disabled={pinInput.length !== 4 || loadingOrderId === pinModalOrder}
                className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl shadow-[0_4px_16px_rgba(16,185,129,0.3)] disabled:opacity-50 active:scale-95 transition-all"
              >
                {loadingOrderId === pinModalOrder ? 'Verificando...' : 'Confirmar PIN y Entregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
