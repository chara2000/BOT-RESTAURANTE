'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MoreHorizontal, ArrowRight, TrendingUp, Clock, MapPin } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { useTheme } from '@/context/ThemeContext';
import { formatCompact, formatCurrency } from '@/lib/utils';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const CATEGORY_COLORS = ['#ff6b35', '#38bdf8', '#a78bfa', '#94a3b8'];
const CATEGORY_DATA = [
  { label: 'Mariscos', pct: '30%', color: CATEGORY_COLORS[0] },
  { label: 'Bebidas', pct: '25%', color: CATEGORY_COLORS[1] },
  { label: 'Postres', pct: '25%', color: CATEGORY_COLORS[2] },
  { label: 'Pastas', pct: '20%', color: CATEGORY_COLORS[3] },
];

const TRENDING_DISHES = [
  { name: 'Pollo a la Parrilla', cat: 'Aves', rating: 4.9, sold: 350, price: 32000, img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80' },
  { name: 'Tarta Cítrica de Sol', cat: 'Postres', rating: 4.8, sold: 400, price: 18000, img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80' },
  { name: 'Ensalada de Camarones', cat: 'Mariscos', rating: 4.7, sold: 270, price: 28000, img: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&q=80' },
];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-500 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  preparing: 'bg-amber-500/10 text-amber-500 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  shipping: 'bg-sky-500/10 text-sky-500 border border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.25)]',
  delivered: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
  cancelled: 'bg-rose-500/10 text-rose-500 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En Preparación',
  ready: 'Listo', shipping: 'En Camino', delivered: 'Entregado', cancelled: 'Cancelado',
};

export default function DashboardPage() {
  const { dark } = useTheme();
  const { orders, stats, deliveries } = useAppData();
  const [riderCoords, setRiderCoords] = useState<[number, number]>([6.2088, -75.5678]);
  const [gpsRunning, setGpsRunning] = useState(false);

  const activeDelivery = deliveries.find((d) => d.order.status === 'shipping');
  const orderList = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).slice(0, 4);
  const recentOrders = orders.slice(0, 5);
  const totalCart = orderList.reduce((a, o) => a + o.total, 0);

  useEffect(() => {
    if (!gpsRunning || !activeDelivery) return;
    const id = setInterval(() => {
      setRiderCoords((p) => [p[0] + (Math.random() - 0.5) * 0.002, p[1] + (Math.random() - 0.5) * 0.002]);
    }, 3000);
    return () => clearInterval(id);
  }, [gpsRunning, activeDelivery]);

  const barData = stats.salesByDay.map((d, i) => ({
    day: d.day,
    val: Math.round(d.amount / 5000),
    highlight: i === 3,
  }));

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      {/* Elementos Dinámicos de Fondo para Profundidad */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-[var(--orange)] opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-blue-500 opacity-[0.02] rounded-full blur-[140px] pointer-events-none" />
      
      <Topbar title="Visión General" subtitle="Métricas en tiempo real de tu restaurante" />
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-8 z-10 relative">
        <div className="max-w-7xl mx-auto">
          {/* GRILLA DE ESTADÍSTICAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-8 animate-fade-in-up">
            <StatCard title="Ingresos de Hoy" value={formatCompact(stats.salesToday)} change="+2.1% vs ayer" up emoji="💰" />
            <StatCard title="Órdenes Activas" value={String(stats.activeOrders)} change={`${stats.deliveredOrders} completadas`} up emoji="🧾" />
            <StatCard title="Promedio por Orden" value={formatCompact(stats.avgTicket)} change="+0.8% esta semana" up emoji="📊" />
            <StatCard title="Retención de Clientes" value={String(stats.returningCustomers)} change={`${stats.newCustomers} nuevos hoy`} up emoji="👥" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            <div className="xl:col-span-2 space-y-6 lg:space-y-8">
              
              {/* FILA DE GRÁFICOS */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 animate-fade-in-up delay-100">
                <div className="card p-5 lg:p-6 lg:col-span-3 flex flex-col justify-between group">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p style={{ color: 'var(--text-muted)' }} className="text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[var(--orange)]" /> Tendencia de Ingresos
                      </p>
                      <p className="text-2xl lg:text-3xl font-black tracking-tight">{formatCurrency(stats.salesMonth)}</p>
                    </div>
                    <div className="flex items-center gap-3 lg:gap-4 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_var(--orange)]" style={{ background: 'var(--orange)' }} />Ingresos
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />Gastos
                      </span>
                    </div>
                  </div>
                  <div className="h-40 lg:h-48 mt-2 relative w-full overflow-hidden rounded-xl">
                    <svg className="w-full h-full drop-shadow-md" viewBox="0 0 500 140" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[30, 70, 110].map((y) => (
                        <line key={y} x1="0" y1={y} x2="500" y2={y}
                              stroke={dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'} strokeWidth="1" strokeDasharray="4 4" />
                      ))}
                      <path d="M 0 120 C 83 70, 167 40, 250 70 S 417 30, 500 25 L 500 140 L 0 140 Z" fill="url(#orangeGrad)" 
                            className="transition-all duration-700 ease-in-out group-hover:opacity-80" />
                      <path d="M 0 125 C 83 90, 167 100, 250 105 S 417 85, 500 75"
                            fill="none" stroke={dark ? '#334155' : '#e2e8f0'} strokeWidth="2" strokeLinecap="round" />
                      <path d="M 0 120 C 83 70, 167 40, 250 70 S 417 30, 500 25"
                            fill="none" stroke="var(--orange)" strokeWidth="3.5" strokeLinecap="round" 
                            className="drop-shadow-[0_4px_6px_rgba(255,107,53,0.3)]" />
                      <circle cx="300" cy="55" r="5" fill="var(--orange)" className="drop-shadow-[0_0_8px_var(--orange)]" />
                      <circle cx="300" cy="55" r="2" fill="#fff" />
                    </svg>
                    <div className="absolute top-4 left-[56%] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-[10px] font-bold px-3 py-2 rounded-xl shadow-xl backdrop-blur-md hidden sm:block">
                      <p style={{ color: 'var(--text-muted)' }} className="text-[9px] uppercase tracking-wider mb-0.5">Pico de Ventas</p>
                      <p className="text-[var(--orange)] font-black text-sm">{formatCompact(stats.salesToday)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between mt-3" style={{ color: 'var(--text-muted)' }}>
                    {stats.salesByHour.map((h) => (
                      <span key={h.hour} className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">{h.hour}</span>
                    ))}
                  </div>
                </div>

                <div className="card p-5 lg:p-6 lg:col-span-2 flex flex-col">
                  <p style={{ color: 'var(--text-muted)' }} className="text-[10px] font-bold uppercase tracking-widest mb-4 lg:mb-6 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--orange)]"></span> Categorías Principales
                  </p>
                  <div className="flex justify-center mb-6 lg:mb-8 relative">
                    <div className="absolute inset-0 bg-[var(--orange)] opacity-5 blur-[40px] rounded-full"></div>
                    <svg className="w-28 h-28 lg:w-36 lg:h-36 drop-shadow-lg" viewBox="0 0 36 36">
                      {CATEGORY_DATA.map((c, i) => {
                        const offsets = [0, -26.4, -48.4, -70.4];
                        const dashes = ['26.4 57.5', '22 62', '22 62', '17.6 66.4'];
                        return (
                          <circle key={c.label} cx="18" cy="18" r="14" fill="transparent"
                                  stroke={c.color} strokeWidth="4.5"
                                  strokeDasharray={dashes[i]} strokeDashoffset={offsets[i]} 
                                  className="transition-all duration-500 hover:stroke-w-6 cursor-pointer" />
                        );
                      })}
                      <circle cx="18" cy="18" r="9" fill="var(--bg-card)" className="drop-shadow-sm" />
                    </svg>
                  </div>
                  <div className="space-y-3 mt-auto">
                    {CATEGORY_DATA.map((c) => (
                      <div key={c.label} className="flex items-center justify-between text-xs font-bold p-1.5 lg:p-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full shrink-0 shadow-sm" style={{ background: c.color }} />
                          <span style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                        </div>
                        <span className="font-black bg-[var(--bg-input)] px-2 py-1 rounded-md text-[10px] lg:text-xs">{c.pct}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* SEGUNDA FILA DE GRÁFICOS */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 animate-fade-in-up delay-200">
                <div className="card p-5 lg:p-6 lg:col-span-3">
                  <p style={{ color: 'var(--text-muted)' }} className="text-[10px] font-bold uppercase tracking-widest mb-4 lg:mb-6">Rendimiento Semanal</p>
                  <div className="h-32 lg:h-40 flex items-end justify-between gap-2 sm:gap-3 px-1 lg:px-2">
                    {barData.map((bar) => (
                      <div key={bar.day} className="flex-1 flex flex-col items-center gap-2 sm:gap-3 group relative cursor-pointer">
                        {bar.highlight && (
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 lg:px-3 py-1 lg:py-1.5 rounded-xl text-white text-[9px] lg:text-[10px] font-black shadow-xl whitespace-nowrap bg-slate-800 dark:bg-white dark:text-slate-900 z-10 hidden sm:block">
                            {formatCompact(stats.salesByDay[3]?.amount ?? 0)}
                          </div>
                        )}
                        <div style={{
                          height: `${(bar.val / 200) * 100}%`,
                          background: bar.highlight ? 'linear-gradient(180deg, var(--orange) 0%, #ff8a4c 100%)' : 'var(--bg-input)',
                          borderRadius: '0.5rem lg:0.75rem', width: '100%', transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                        }} className={`group-hover:scale-y-105 origin-bottom ${!bar.highlight ? 'group-hover:bg-slate-200 dark:group-hover:bg-slate-700' : 'shadow-[0_4px_12px_var(--orange-glow)]'}`} />
                        <span style={{ color: bar.highlight ? 'var(--orange)' : 'var(--text-muted)' }} className="text-[8px] sm:text-[10px] font-bold uppercase">{bar.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5 lg:p-6 lg:col-span-2 flex flex-col">
                  <p style={{ color: 'var(--text-muted)' }} className="text-[10px] font-bold uppercase tracking-widest mb-4 lg:mb-6">Distribución de Pedidos</p>
                  <div className="space-y-4 lg:space-y-5 flex-1 flex flex-col justify-center">
                    {[
                      { label: 'Servicio en Mesa', pct: 45, qty: 900, color: 'var(--orange)' },
                      { label: 'Para Llevar', pct: 30, qty: 600, color: '#94a3b8' },
                      { label: 'Domicilios IA', pct: 25, qty: 500, color: '#38bdf8' },
                    ].map((t) => (
                      <div key={t.label} className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] lg:text-xs font-bold">
                          <span style={{ color: 'var(--text-primary)' }}>{t.label} <span style={{ color: 'var(--text-muted)' }} className="font-medium ml-1">({t.pct}%)</span></span>
                          <span className="font-black bg-[var(--bg-input)] px-2 py-0.5 rounded-md">{t.qty}</span>
                        </div>
                        <div className="h-1.5 lg:h-2 rounded-full w-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                          <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${t.pct}%`, background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* TABLA DE ÓRDENES RECIENTES */}
              <div className="card overflow-hidden animate-fade-in-up delay-300">
                <div className="flex items-center justify-between px-5 lg:px-6 py-4 lg:py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-black tracking-wide">Últimos Movimientos</p>
                  <a href="/pedidos" className="text-[11px] lg:text-xs font-black flex items-center gap-1 hover:gap-2 transition-all" style={{ color: 'var(--orange)' }}>
                    Ver Historial <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                    <thead style={{ background: 'var(--bg-input)' }}>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        {['Nº Pedido', 'Detalle', 'Cant.', 'Total', 'Cliente', 'Estado'].map((h) => (
                          <th key={h} className="px-5 lg:px-6 py-3 lg:py-4 font-bold uppercase tracking-wider text-[9px] lg:text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((o) => (
                        <tr key={o.id} className="border-t transition-colors hover:bg-[var(--bg-input)] cursor-pointer"
                            style={{ borderColor: 'var(--border)' }}>
                          <td className="px-5 lg:px-6 py-3 lg:py-4 font-black" style={{ color: 'var(--orange)' }}>
                            {o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] ?? `#${o.id.slice(0, 6).toUpperCase()}`}
                          </td>
                          <td className="px-5 lg:px-6 py-3 lg:py-4">
                            <p className="font-bold text-[13px] lg:text-sm truncate max-w-[150px]">{o.items[0]?.product.name}</p>
                            <span style={{ color: 'var(--text-muted)' }} className="text-[9px] lg:text-[10px] font-medium uppercase tracking-wide">{o.items[0]?.product.category}</span>
                          </td>
                          <td className="px-5 lg:px-6 py-3 lg:py-4 font-bold" style={{ color: 'var(--text-muted)' }}>
                            <span className="bg-[var(--bg-card)] px-2.5 py-1 rounded-lg border border-[var(--border)] shadow-sm">
                              {o.items.reduce((a, i) => a + i.quantity, 0)}
                            </span>
                          </td>
                          <td className="px-5 lg:px-6 py-3 lg:py-4 font-black text-[13px] lg:text-sm">{formatCompact(o.total)}</td>
                          <td className="px-5 lg:px-6 py-3 lg:py-4 font-semibold text-[11px] lg:text-xs truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>{o.customer?.name ?? 'Cliente Mostrador'}</td>
                          <td className="px-5 lg:px-6 py-3 lg:py-4">
                            <span className={`px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${STATUS_STYLES[o.status] ?? ''}`}>
                              {STATUS_LABELS[o.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* BARRA LATERAL DERECHA */}
            <div className="space-y-6 lg:space-y-8 animate-fade-in-up delay-300">
              {/* LISTA DE PREPARACIÓN */}
              <div className="card p-5 lg:p-6 flex flex-col">
                <div className="flex items-center justify-between pb-3 lg:pb-4 border-b mb-3 lg:mb-4" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-black tracking-wide">Fila de Preparación</p>
                  <button className="p-1.5 rounded-lg hover:bg-[var(--bg-input)] transition-colors" style={{ color: 'var(--text-muted)' }}><MoreHorizontal className="h-5 w-5" /></button>
                </div>
                <div className="space-y-4 lg:space-y-5 flex-1">
                  {orderList.map((o) => (
                    <div key={o.id} className="flex gap-3 lg:gap-4 p-2 -mx-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors cursor-pointer group">
                      <div className="relative h-12 w-12 lg:h-14 lg:w-14 rounded-2xl overflow-hidden shrink-0 shadow-md group-hover:shadow-lg transition-all">
                        <img src={o.items[0]?.product.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className="text-[13px] lg:text-sm font-black truncate text-[var(--text-primary)]">{o.items[0]?.product.name}</p>
                        <p style={{ color: 'var(--text-muted)' }} className="text-[10px] lg:text-[11px] truncate font-medium flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {o.notes ?? 'Sin requerimientos especiales'}
                        </p>
                      </div>
                      <div className="flex flex-col justify-center items-end shrink-0">
                        <p className="text-[13px] lg:text-sm font-black" style={{ color: 'var(--orange)' }}>
                          {formatCompact(o.total)}
                        </p>
                        <p className="text-[9px] lg:text-[10px] font-bold px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-md mt-1" style={{ color: 'var(--text-muted)' }}>
                          {o.items.length} prods
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 lg:mt-6 pt-4 lg:pt-5 border-t flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-[10px] lg:text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    <span>Subtotal de Fila</span>
                    <span>{formatCurrency(totalCart * 0.85)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm lg:text-base font-black mt-1.5 lg:mt-2">
                    <span style={{ color: 'var(--text-primary)' }}>Total Proyectado</span>
                    <span style={{ color: 'var(--orange)' }} className="drop-shadow-sm">{formatCurrency(totalCart)}</span>
                  </div>
                </div>
              </div>

              {/* MENÚ TENDENCIA */}
              <div className="card p-5 lg:p-6">
                <div className="flex items-center justify-between pb-3 lg:pb-4 border-b mb-4 lg:mb-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-black tracking-wide">Platos Estrella</p>
                  <span className="bg-[var(--orange-soft)] text-[var(--orange)] text-[9px] lg:text-[10px] font-black uppercase tracking-wider px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-xl border border-[var(--orange-glow)]">Top Ventas</span>
                </div>
                <div className="space-y-4 lg:space-y-6">
                  {(stats.topProducts.length ? stats.topProducts.map((p, i) => ({
                    name: p.name, cat: 'Favorito', rating: 4.8, sold: p.sold, price: p.revenue / p.sold,
                    img: TRENDING_DISHES[i % 3].img,
                  })) : TRENDING_DISHES).slice(0, 3).map((d, i) => (
                    <div key={i} className="group relative">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent rounded-2xl z-10 pointer-events-none" />
                      <img src={d.img} alt={d.name} className="w-full h-28 lg:h-32 object-cover rounded-2xl shadow-md group-hover:shadow-xl transition-all duration-500 group-hover:scale-[1.02]" />
                      
                      <div className="absolute bottom-0 left-0 right-0 p-3 lg:p-4 z-20 flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <div className="min-w-0 pr-2">
                            <span className="bg-[var(--orange)] text-white text-[8px] lg:text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md mb-1.5 inline-block shadow-sm">{d.cat}</span>
                            <p className="text-[13px] lg:text-sm font-black text-white truncate drop-shadow-md">{d.name}</p>
                          </div>
                          <span className="text-[13px] lg:text-sm font-black text-white bg-white/20 backdrop-blur-md px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-xl border border-white/30 shrink-0 shadow-lg">
                            {formatCompact(d.price)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] lg:text-[10px] font-bold text-white/90 mt-1">
                          <span className="flex items-center gap-1 drop-shadow-sm">⭐ {d.rating}</span>
                          <span className="drop-shadow-sm">{d.sold} pedidos semanales</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RASTREO GPS */}
              <div className="card p-5 lg:p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--orange)]" />
                    <p className="text-sm font-black tracking-wide">Ruta de Reparto</p>
                  </div>
                  <button onClick={() => setGpsRunning(!gpsRunning)}
                    className="text-[9px] lg:text-[10px] font-black px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl transition-all border shadow-sm hover:shadow-md"
                    style={{
                      background: gpsRunning ? 'var(--orange)' : 'var(--bg-input)',
                      color: gpsRunning ? '#fff' : 'var(--text-primary)',
                      borderColor: gpsRunning ? 'var(--orange)' : 'var(--border)'
                    }}>
                    {gpsRunning ? '● Monitor Activo' : 'Iniciar Rastreo'}
                  </button>
                </div>
                <div className="h-48 lg:h-56 rounded-2xl overflow-hidden relative shadow-inner border" style={{ borderColor: 'var(--border)' }}>
                  <MapComponent
                    riderCoords={riderCoords}
                    deliveryAddress={activeDelivery?.order.delivery_address ?? 'Calle 10A #34-56, Zona Central'}
                  />
                  {!gpsRunning && (
                    <div className="absolute inset-0 bg-black/5 backdrop-blur-[2px] flex items-center justify-center z-10">
                      <p className="bg-[var(--bg-card)] px-4 py-2 rounded-xl text-xs font-bold shadow-lg border border-[var(--border)] text-[var(--text-muted)]">
                        Señal pausada
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
