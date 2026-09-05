'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

export function useRealtimeOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    
    // Suscripción a la tabla 'orders'
    const channel = supabase.channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('[Realtime] Order event received:', payload);
          // Invalidar consultas relevantes en React Query
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
          // Si tuviéramos un query para 'active_orders', 'history_orders', los invalidamos
          
          // Emitir eventos personalizados para NotificationManager y el sistema de alarma
          if (payload.eventType === 'INSERT') {
            window.dispatchEvent(new CustomEvent('new_order', { detail: payload.new }));
          } else if (payload.eventType === 'UPDATE') {
            const oldStatus = (payload.old as any)?.status;
            const newStatus = (payload.new as any)?.status;
            // Si una comanda pasa de borrador/incompleto a 'pending' o 'confirmed', tratarla como nueva orden para cocina
            if ((oldStatus === 'draft' || !oldStatus) && (newStatus === 'pending' || newStatus === 'confirmed')) {
              window.dispatchEvent(new CustomEvent('new_order', { detail: payload.new }));
            } else {
              window.dispatchEvent(new CustomEvent('order_updated', { detail: payload.new }));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_events',
        },
        (payload) => {
          console.log('[Realtime] Order Event Log added:', payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && process.env.NODE_ENV === 'development') {
          console.log('[Realtime] Successfully connected to orders channel');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}
