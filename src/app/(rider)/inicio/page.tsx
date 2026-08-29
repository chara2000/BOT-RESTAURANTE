'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package, CheckCircle2, Clock, Star, TrendingUp, Bell, ChevronRight, MapPin, Navigation
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDeliveries, useOrders } from '@/hooks/useOrders';
import { formatCurrency } from '@/lib/utils';

export default function RiderHomePage() {
  const { user } = useAuth();
  const { orders } = useOrders();
  const { deliveries } = useDeliveries();
  const [greeting, setGreeting] = useState('Hola');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Buenos días');
    else if (hour < 18) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');
  }, []);

  // Stats del día — solo los registros de este repartidor
  const myDeliveries = deliveries.filter(d => d.rider_id === user?.id);
  const todayDeliveries = myDeliveries.filter(d => {
    const date = d.order?.created_at ? new Date(d.order.created_at) : new Date();
    const today = new Date();
    return date.toDateString() === today.toDateString();
  });

  const deliveredToday = todayDeliveries.filter(d => d.status === 'delivered').length;
  const activeNow = myDeliveries.filter(d => ['assigned', 'searching', 'on_the_way'].includes(d.status ?? '')).length;

  // sum of delivery fee for delivered today
  const earningsToday = todayDeliveries
    .filter(d => d.status === 'delivered')
    .reduce((sum, d) => sum + (d.order?.delivery_fee || 5000), 0);

  // sum of order total for cash payments today
  const cashPaymentsToday = todayDeliveries
    .filter(d => d.status === 'delivered' && d.order?.payment_method === 'cash')
    .reduce((sum, d) => sum + (d.order?.total || 0), 0);

  // sum of order total for non-cash payments today
  const digitalPaymentsToday = todayDeliveries
    .filter(d => d.status === 'delivered' && d.order?.payment_method !== 'cash')
    .reduce((sum, d) => sum + (d.order?.total || 0), 0);
  // Pedidos en pool = pedidos a domicilio disponibles sin repartidor asignado
  const activeAssignedOrderIds = new Set(
    deliveries
      .filter(d => Boolean(d.rider_id) && d.status !== 'searching')
      .map(d => d.order_id)
      .filter(Boolean)
  );
  const poolCount = orders.filter((o) => {
    const isDelivery = o.type === 'delivery' || (o.delivery_address && o.delivery_address !== 'Para Recoger en el local');
    if (!isDelivery) return false;
    if (['delivered', 'cancelled', 'draft'].includes(o.status)) return false;
    if (o.rider_id) return false;
    if (activeAssignedOrderIds.has(o.id)) return false;
    return true;
  }).length;

  const STATS = [
    {
      label: 'Entregados Hoy',
      value: deliveredToday,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'En Curso',
      value: activeNow,
      icon: Navigation,
      color: 'text-[var(--orange)]',
      bg: 'bg-[var(--orange-soft)]',
    },
    {
      label: 'En la Pool',
      value: poolCount,
      icon: Bell,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Calificación',
      value: '4.9',
      icon: Star,
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
  ];

  return (
    <div className="p-5 space-y-6">
      {/* Saludo */}
      <div className="bg-gradient-to-br from-[var(--orange)] to-[#ff6b2b] text-white rounded-3xl p-6 shadow-[0_8px_32px_var(--orange-glow)] relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
        <div className="absolute -bottom-12 -right-4 w-40 h-40 bg-white/5 rounded-full" />
        <p className="text-sm font-bold opacity-80 mb-1">{greeting},</p>
        <h1 className="text-2xl font-black tracking-tight leading-tight relative z-10">
          {user?.name?.split(' ')[0] ?? 'Repartidor'} 👋
        </h1>
        <p className="text-sm font-bold opacity-80 mt-2 relative z-10">
          {poolCount > 0
            ? `Hay ${poolCount} pedido${poolCount !== 1 ? 's' : ''} disponible${poolCount !== 1 ? 's' : ''} para ti.`
            : 'No hay pedidos disponibles por ahora.'}
        </p>
        <div className="mt-4 relative z-10">
          <Link
            href="/disponibles"
            className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-black px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <Bell className="w-4 h-4" />
            Ver Disponibles
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-2"
            >
              <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="text-[11px] font-bold text-[var(--text-muted)] mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Finanzas del Repartidor */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Mis Finanzas de Hoy
          </p>
          <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            Al día
          </span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 bg-[var(--bg-input)] rounded-2xl border border-[var(--border)]">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Ganado</p>
            <p className="text-sm font-black text-emerald-500">{formatCurrency(earningsToday)}</p>
            <p className="text-[9px] font-bold text-[var(--text-muted)] mt-0.5">Domicilios</p>
          </div>

          <div className="p-3 bg-[var(--bg-input)] rounded-2xl border border-[var(--border)]">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Efectivo</p>
            <p className="text-sm font-black text-amber-500">{formatCurrency(cashPaymentsToday)}</p>
            <p className="text-[9px] font-bold text-[var(--text-muted)] mt-0.5">A entregar</p>
          </div>

          <div className="p-3 bg-[var(--bg-input)] rounded-2xl border border-[var(--border)]">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Digital</p>
            <p className="text-sm font-black text-sky-500">{formatCurrency(digitalPaymentsToday)}</p>
            <p className="text-[9px] font-bold text-[var(--text-muted)] mt-0.5">Transferido</p>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-3">Accesos Rápidos</p>

        <Link
          href="/disponibles"
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between group hover:border-[var(--orange)] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-[var(--text-primary)]">Pedidos Disponibles</p>
              <p className="text-[11px] text-[var(--text-muted)] font-medium">{poolCount} esperando ser tomados</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--orange)] transition-colors" />
        </Link>

        <Link
          href="/mis-pedidos"
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between group hover:border-[var(--orange)] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--orange-soft)] text-[var(--orange)] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-[var(--text-primary)]">Mis Pedidos Activos</p>
              <p className="text-[11px] text-[var(--text-muted)] font-medium">{activeNow} en curso</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--orange)] transition-colors" />
        </Link>

        <Link
          href="/ruta"
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between group hover:border-[var(--orange)] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-[var(--text-primary)]">Mi Ruta GPS</p>
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Próximamente disponible</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--orange)] transition-colors" />
        </Link>
      </div>
    </div>
  );
}
