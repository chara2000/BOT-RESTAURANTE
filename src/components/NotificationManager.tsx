'use client';

import { useEffect } from 'react';
import { Toaster, sileo } from 'sileo';
import 'sileo/styles.css';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { useAlarmSound } from '@/hooks/useAlarmSound';
import { useTheme } from '@/context/ThemeContext';

export function NotificationManager() {
  const { user } = useAuth();
  const { dark } = useTheme();

  // Realtime Supabase subscription — global, persists on all pages
  useRealtimeOrders();

  // Global alarm sound — unlocks AudioContext on first interaction
  useAlarmSound();

  useEffect(() => {
    const handleNewOrder = (e: Event) => {
      const customEvent = e as CustomEvent;
      const order = customEvent.detail;
      const orderNum = order?.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order?.id?.slice(0, 6)?.toUpperCase() || 'NUEVO'}`;

      if (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'kitchen' || user?.role === 'operator') {
        sileo.show({
          title: '🔔 ¡Nuevo Pedido Entrante!',
          description: `${orderNum} · ${order?.customer?.name || 'Cliente'} (${order?.type === 'delivery' ? '🛵 Domicilio' : order?.type === 'pickup' ? '🛍️ Para Llevar' : '🍽️ Mesa'})`,
          type: 'info',
        });
      }

      if (user?.role === 'delivery' && order?.type === 'delivery') {
        sileo.show({
          title: '🛵 ¡Nuevo Domicilio en Cola!',
          description: `Pedido ${orderNum} listo para ser asignado.`,
          type: 'info',
        });
      }
    };

    const handleOrderUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const order = customEvent.detail;
      const orderNum = order?.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order?.id?.slice(0, 6)?.toUpperCase() || ''}`;

      if (user?.role === 'delivery' && order?.status === 'ready') {
        sileo.success({
          title: '🍽️ Pedido Listo para Despacho',
          description: `El pedido ${orderNum} está empacado en cocina.`,
        });
      }

      if (order?.payment_status === 'VERIFIED' || order?.payment_status === 'PROOF_RECEIVED') {
        sileo.success({
          title: '💳 Comprobante de Pago Recibido',
          description: `Comprobante digital adjunto al pedido ${orderNum}.`,
        });
      }
    };

    const handleShowToast = (e: Event) => {
      const customEvent = e as CustomEvent<{
        title: string;
        message: string;
        type?: 'order' | 'success' | 'payment' | 'delivery' | 'warning' | 'info';
      }>;
      const { title, message, type } = customEvent.detail || {};
      if (title && message) {
        // Map types to sileo state methods
        if (type === 'warning') {
          sileo.warning({ title, description: message });
        } else if (type === 'success' || type === 'payment') {
          sileo.success({ title, description: message });
        } else if (type === 'delivery') {
          sileo.info({ title, description: message });
        } else {
          sileo.show({ title, description: message, type: 'info' });
        }
      }
    };

    window.addEventListener('new_order', handleNewOrder);
    window.addEventListener('order_updated', handleOrderUpdate);
    window.addEventListener('show_toast', handleShowToast);

    return () => {
      window.removeEventListener('new_order', handleNewOrder);
      window.removeEventListener('order_updated', handleOrderUpdate);
      window.removeEventListener('show_toast', handleShowToast);
    };
  }, [user]);

  return (
    <Toaster 
      position="top-center" 
      offset={{ top: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }} 
      theme={dark ? 'dark' : 'light'}
    />
  );
}
