'use client';

import { useState, useEffect } from 'react';
import { Clock, User, ArrowRight, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AssignmentLog {
  id: string;
  order_id: string;
  prev_rider_name: string | null;
  new_rider_name: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

interface OrderEvent {
  id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  orderId: string;
}

export function OrderHistoryPanel({ orderId }: Props) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentLog[]>([]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'assignments'>('timeline');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const supabase = createClient();
    if (!supabase) { setIsLoading(false); return; }

    setIsLoading(true);

    Promise.all([
      supabase
        .from('order_events')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      supabase
        .from('rider_assignments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
    ])
      .then(([eventsRes, assignRes]) => {
        setEvents((eventsRes.data ?? []) as OrderEvent[]);
        setAssignments((assignRes.data ?? []) as AssignmentLog[]);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [orderId]);

  const EVENT_LABELS: Record<string, string> = {
    ORDER_CREATED: '🆕 Pedido creado',
    STATUS_CHANGE: '🔄 Cambio de estado',
    RIDER_ASSIGNED: '🛵 Repartidor asignado',
    RIDER_REASSIGNED: '🔁 Repartidor reasignado',
  };

  const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    preparing: 'Preparando',
    ready: 'Listo',
    shipping: 'En Camino',
    delivered: 'Entregado',
    cancelled: 'Cancelado',
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 p-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-[var(--bg-input)] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'timeline'
              ? 'bg-[var(--orange-soft)] text-[var(--orange)] border-b-2 border-[var(--orange)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Timeline
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'assignments'
              ? 'bg-[var(--orange-soft)] text-[var(--orange)] border-b-2 border-[var(--orange)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Asignaciones ({assignments.length})
        </button>
      </div>

      <div className="p-4 max-h-64 overflow-y-auto">
        {activeTab === 'timeline' ? (
          events.length === 0 ? (
            <p className="text-center text-xs text-[var(--text-muted)] font-medium py-6">
              Sin eventos registrados aún.
            </p>
          ) : (
            <ol className="relative border-l border-[var(--border)] ml-3 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="ml-4">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-[var(--orange)] border-2 border-[var(--bg-card)]" />
                  <p className="text-xs font-black text-[var(--text-primary)]">
                    {EVENT_LABELS[event.event_type] ?? event.event_type}
                  </p>
                  {event.from_value && event.to_value && (
                    <p className="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                      <span>{STATUS_LABELS[event.from_value] ?? event.from_value}</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span className="text-[var(--orange)]">{STATUS_LABELS[event.to_value] ?? event.to_value}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {new Date(event.created_at).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    {event.actor_name && <span className="ml-1">· {event.actor_name}</span>}
                  </p>
                </li>
              ))}
            </ol>
          )
        ) : (
          assignments.length === 0 ? (
            <p className="text-center text-xs text-[var(--text-muted)] font-medium py-6">
              Sin cambios de repartidor registrados.
            </p>
          ) : (
            <div className="space-y-3">
              {assignments.map((log) => (
                <div key={log.id} className="bg-[var(--bg-input)] rounded-xl p-3 border border-[var(--border)]">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text-muted)] line-through">{log.prev_rider_name ?? 'Sin asignar'}</span>
                    <ArrowRight className="w-3 h-3 text-[var(--orange)]" />
                    <span className="text-[var(--orange)] font-black">{log.new_rider_name ?? 'Liberado'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Por: {log.changed_by_name ?? 'Sistema'}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {new Date(log.created_at).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {log.reason && (
                    <p className="text-[10px] text-amber-500 mt-1 font-medium italic">"{log.reason}"</p>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
