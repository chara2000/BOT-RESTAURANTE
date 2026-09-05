'use client';

import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, FileText, BarChart3, TrendingUp, Filter, Calendar, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData, getLocalDayString } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';

export default function ReportesPage() {
  const { stats, orders, customers, inventory, cashSession, categories, products } = useAppData();

  // Period Selector: 'today' | 'yesterday' | 'week' | 'month' | 'custom' (inicia en 'today')
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');

  const todayStr = getLocalDayString(new Date());
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayStr = getLocalDayString(yesterdayDate);
  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;

  // Platos disponibles según la categoría seleccionada
  const availableProducts = useMemo(() => {
    if (categoryFilter === 'all') return products;
    return products.filter(p => p.category_id === categoryFilter || p.category === categoryFilter);
  }, [products, categoryFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const orderDateStr = getLocalDayString(o.created_at);

      // 1. Filtro de periodo temporal
      if (period === 'today' && orderDateStr !== todayStr) return false;
      if (period === 'yesterday' && orderDateStr !== yesterdayStr) return false;
      if (period === 'week' && new Date(o.created_at).getTime() < weekAgo) return false;
      if (period === 'month' && new Date(o.created_at).getTime() < monthAgo) return false;
      if (period === 'custom') {
        if (dateFrom && orderDateStr < dateFrom) return false;
        if (dateTo && orderDateStr > dateTo) return false;
      }

      // 2. Filtro de estado
      if (statusFilter !== 'all') {
        if (statusFilter === 'delivered' && o.status !== 'delivered') return false;
        if (statusFilter === 'active' && ['delivered', 'cancelled'].includes(o.status)) return false;
        if (statusFilter === 'pending' && o.status !== 'pending') return false;
        if (statusFilter === 'cancelled' && o.status !== 'cancelled') return false;
      }

      // 3. Filtro de categoría
      if (categoryFilter !== 'all') {
        const hasCategory = (o.items || []).some(i => 
          i.product?.category_id === categoryFilter || 
          i.product?.category === categoryFilter ||
          (i.product as any)?.categories?.name === categoryFilter
        );
        if (!hasCategory) return false;
      }

      // 4. Filtro de producto
      if (productFilter !== 'all') {
        const hasProduct = (o.items || []).some(i => i.product?.id === productFilter || (i as any).product_id === productFilter);
        if (!hasProduct) return false;
      }
      
      return true;
    });
  }, [orders, period, dateFrom, dateTo, statusFilter, categoryFilter, productFilter, todayStr, yesterdayStr, weekAgo, monthAgo]);

  const localStats = useMemo(() => {
    // Pedidos válidos (no cancelados ni borradores)
    const validOrders = filteredOrders.filter(o => !['cancelled', 'draft'].includes(o.status));

    const totalSales = validOrders.reduce((sum, o) => {
      if (productFilter !== 'all') {
        const prodItems = (o.items || []).filter(i => i.product?.id === productFilter);
        return sum + prodItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      }
      if (categoryFilter !== 'all') {
        const catItems = (o.items || []).filter(i => i.product?.category_id === categoryFilter || i.product?.category === categoryFilter);
        return sum + catItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      }
      return sum + (o.total || 0);
    }, 0);

    const avgTicket = validOrders.length ? Math.round(totalSales / validOrders.length) : 0;
    
    // Agrupación por día local usando getLocalDayString para evitar desfase de zona horaria
    const daysMap = new Map<string, number>();
    validOrders.forEach(o => {
      const dayStr = getLocalDayString(o.created_at);
      let orderAmount = o.total || 0;
      if (productFilter !== 'all') {
        const prodItems = (o.items || []).filter(i => i.product?.id === productFilter);
        orderAmount = prodItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      } else if (categoryFilter !== 'all') {
        const catItems = (o.items || []).filter(i => i.product?.category_id === categoryFilter || i.product?.category === categoryFilter);
        orderAmount = catItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      }
      daysMap.set(dayStr, (daysMap.get(dayStr) || 0) + orderAmount);
    });
    
    const salesByDay = Array.from(daysMap.entries())
      .map(([date, amount]) => ({ day: date.slice(5), amount, rawDate: date }))
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
      .slice(-7);
      
    if (salesByDay.length === 0) {
      salesByDay.push({ day: todayStr.slice(5), amount: 0, rawDate: todayStr });
    }

    return {
      totalSales,
      avgTicket,
      salesByDay,
      orderCount: filteredOrders.length,
      deliveredCount: filteredOrders.filter(o => o.status === 'delivered').length,
      activeCount: filteredOrders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
    };
  }, [filteredOrders, productFilter, categoryFilter, todayStr]);

  const exportCSV = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSales = () => {
    const header = 'ID,Cliente,Total,Estado,Fecha\n';
    const rows = filteredOrders.map((o) =>
      `${o.id},${o.customer?.name ?? 'N/A'},${o.total},${o.status},${o.created_at}`
    ).join('\n');
    exportCSV(header + rows, `reporte-ventas-${todayStr}.csv`);
  };

  const exportInventory = () => {
    const header = 'Insumo,Unidad,Stock,Minimo\n';
    const rows = inventory.map((i) => `${i.name},${i.unit},${i.stock},${i.min_stock}`).join('\n');
    exportCSV(header + rows, `reporte-inventario-${todayStr}.csv`);
  };

  const maxDayAmount = Math.max(...localStats.salesByDay.map((x) => x.amount), 1);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Analítica y Reportes" subtitle="Visualización de KPIs, rendimiento y exportación de datos" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        {/* Filtros Avanzados */}
        <div className="card p-6 flex flex-col gap-5 bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm animate-fade-in-up">
          {/* Fila Superior: Selector de Período Rápido */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Período de Análisis</h3>
                <p className="text-[10px] font-bold text-[var(--text-muted)]">
                  {period === 'today' && 'Mostrando únicamente transacciones del día actual'}
                  {period === 'yesterday' && 'Mostrando histórico contable del día de ayer'}
                  {period === 'week' && 'Mostrando consolidado de los últimos 7 días'}
                  {period === 'month' && 'Mostrando consolidado de los últimos 30 días'}
                  {period === 'custom' && 'Filtrando por rango de fechas personalizado'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
              {[
                { id: 'today', label: 'Hoy' },
                { id: 'yesterday', label: 'Ayer' },
                { id: 'week', label: '7 Días' },
                { id: 'month', label: '30 Días' },
                { id: 'custom', label: 'Personalizado' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    period === p.id
                      ? 'bg-[var(--orange)] text-white shadow-md'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rango Personalizado si está activo */}
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-2xl bg-[var(--bg-input)]/60 border border-[var(--border)] animate-fade-in">
              <span className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[var(--orange)]" /> Definir Rango:
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Desde:</label>
                <input 
                  type="date" 
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-[var(--bg-card)] border rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Hasta:</label>
                <input 
                  type="date" 
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-[var(--bg-card)] border rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
            </div>
          )}

          {/* Fila Inferior: Filtros de Categoría, Plato y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Categoría de Menú</label>
              <select 
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setProductFilter('all');
                }}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">🍽️ Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id || cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Plato / Producto Específico</label>
              <select 
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">🍔 Todos los platos</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Estado del Pedido</label>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">📋 Todos los estados</option>
                <option value="delivered">✅ Entregados</option>
                <option value="active">⏳ Activos en Preparación</option>
                <option value="pending">⚠️ Pendientes de Aprobación</option>
                <option value="cancelled">❌ Cancelados</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 animate-fade-in-up delay-75">
          <StatCard title="Ventas Totales" value={formatCompact(localStats.totalSales)} change={`${localStats.orderCount} pedidos`} up emoji="💰" />
          <StatCard title="Ticket Promedio" value={formatCompact(localStats.avgTicket)} change="En rango seleccionado" up emoji="📈" />
          <StatCard title="Total Órdenes" value={String(localStats.orderCount)} change={`${localStats.activeCount} activas`} up emoji="🧾" />
          <StatCard title="Flujo de Caja" value={String(cashSession.transactions.length)} change={`Sesión: ${cashSession.id.substring(0,6)}`} up emoji="💳" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up delay-100">
          <div className="card p-6 rounded-3xl space-y-6 flex flex-col border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <BarChart3 className="h-5 w-5 text-[var(--orange)]" /> Volumen de Ventas por Día
            </p>
            <div className="space-y-4 flex-1 justify-center flex flex-col">
              {localStats.salesByDay.map((d) => (
                <div key={d.day} className="flex items-center gap-4 group">
                  <span className="text-[11px] font-black uppercase tracking-wider w-12 shrink-0" style={{ color: 'var(--text-muted)' }}>{d.day}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden bg-[var(--bg-input)] shadow-inner border" style={{ borderColor: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all duration-1000 ease-out relative" style={{
                      width: `${(d.amount / maxDayAmount) * 100}%`,
                      background: 'linear-gradient(90deg, var(--orange) 0%, #ff8a4c 100%)',
                      boxShadow: '0 0 10px var(--orange-glow)'
                    }}>
                      <div className="absolute inset-0 bg-white/20 w-0 group-hover:w-full transition-all duration-500" />
                    </div>
                  </div>
                  <span className="text-xs font-black w-28 text-right shrink-0" style={{ color: 'var(--text-primary)' }}>{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6 rounded-3xl space-y-6 flex flex-col border shadow-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <TrendingUp className="h-5 w-5 text-[var(--orange)]" /> Top 5 Productos Rentables
            </p>
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[320px] custom-scrollbar pr-1">
              {stats.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:bg-[var(--bg-input)] group hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                  <div className="h-10 w-10 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm"
                       style={{ background: i === 0 ? 'var(--orange)' : 'var(--bg-input)', color: i === 0 ? '#fff' : 'var(--orange)', border: i !== 0 ? '1px solid var(--border)' : 'none' }}>
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                    <p className="text-[10px] font-bold mt-0.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {p.sold} unidades desplazadas
                    </p>
                  </div>
                  <span className="text-xs font-black px-3 py-1.5 rounded-xl border shadow-sm bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)', color: 'var(--orange)' }}>
                    {formatCompact(p.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-6 rounded-3xl border shadow-md animate-fade-in-up delay-200" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm font-black mb-6" style={{ color: 'var(--text-primary)' }}>Generación de Reportes y Exportación</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { label: 'Exportar Ventas CSV', icon: FileSpreadsheet, action: exportSales, desc: 'Historial completo y montos' },
              { label: 'Exportar Inventario CSV', icon: FileText, action: exportInventory, desc: 'Stock actual y alertas' },
              { label: 'Imprimir Reporte PDF', icon: Download, action: () => window.print(), desc: 'Métricas visuales actuales' },
            ].map(({ label, icon: Icon, action, desc }) => (
              <button key={label} onClick={action}
                className="flex flex-col items-start gap-3 p-5 rounded-2xl border bg-[var(--bg-input)] transition-all hover:-translate-y-1 hover:shadow-lg group cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                <div className="p-3 rounded-xl bg-[var(--bg-card)] shadow-sm border group-hover:border-[var(--orange)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <Icon className="h-6 w-6 transition-colors group-hover:text-[var(--orange)]" style={{ color: 'var(--text-primary)' }} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
