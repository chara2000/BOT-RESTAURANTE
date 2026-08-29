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
          
          // Opcional: Emitir un evento personalizado para que NotificationManager lo recoja
          if (payload.eventType === 'INSERT') {
            window.dispatchEvent(new CustomEvent('new_order', { detail: payload.new }));
          } else if (payload.eventType === 'UPDATE') {
            window.dispatchEvent(new CustomEvent('order_updated', { detail: payload.new }));
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
