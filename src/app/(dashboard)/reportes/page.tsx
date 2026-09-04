'use client';

import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, FileText, BarChart3, TrendingUp, Filter, Calendar, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';
import { isSameDay, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

export default function ReportesPage() {
  const { stats, orders, customers, inventory, cashSession, categories, products } = useAppData();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');

  // Platos disponibles según la categoría seleccionada
  const availableProducts = useMemo(() => {
    if (categoryFilter === 'all') return products;
    return products.filter(p => p.category_id === categoryFilter || p.category === categoryFilter);
  }, [products, categoryFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      let passDate = true;
      let passStatus = true;
      let passCategory = true;
      let passProduct = true;
      const oDate = parseISO(o.created_at);
      
      if (dateFrom) passDate = passDate && !isBefore(oDate, startOfDay(parseISO(dateFrom)));
      if (dateTo) passDate = passDate && !isAfter(oDate, endOfDay(parseISO(dateTo)));
      if (statusFilter !== 'all') {
        if (statusFilter === 'delivered') passStatus = o.status === 'delivered';
        else if (statusFilter === 'active') passStatus = ['confirmed', 'preparing', 'ready', 'shipping'].includes(o.status);
        else passStatus = o.status === statusFilter;
      }

      if (categoryFilter !== 'all') {
        passCategory = (o.items || []).some(i => 
          i.product?.category_id === categoryFilter || 
          i.product?.category === categoryFilter ||
          (i.product as any)?.categories?.name === categoryFilter
        );
      }

      if (productFilter !== 'all') {
        passProduct = (o.items || []).some(i => i.product?.id === productFilter || (i as any).product_id === productFilter);
      }
      
      return passDate && passStatus && passCategory && passProduct;
    });
  }, [orders, dateFrom, dateTo, statusFilter, categoryFilter, productFilter]);

  const localStats = useMemo(() => {
    const totalSales = filteredOrders.reduce((sum, o) => {
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

    const avgTicket = filteredOrders.length ? totalSales / filteredOrders.length : 0;
    
    const daysMap = new Map<string, number>();
    filteredOrders.forEach(o => {
      const dayStr = o.created_at.slice(0, 10);
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
      .map(([date, amount]) => ({ day: date.slice(5), amount }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-7);
      
    if (salesByDay.length === 0) {
      salesByDay.push({ day: 'N/A', amount: 0 });
    }

    return { totalSales, avgTicket, salesByDay, orderCount: filteredOrders.length };
  }, [filteredOrders, productFilter, categoryFilter]);

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
    exportCSV(header + rows, `reporte-ventas-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportInventory = () => {
    const header = 'Insumo,Unidad,Stock,Minimo\n';
    const rows = inventory.map((i) => `${i.name},${i.unit},${i.stock},${i.min_stock}`).join('\n');
    exportCSV(header + rows, `reporte-inventario-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const maxDayAmount = Math.max(...localStats.salesByDay.map((x) => x.amount), 1);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Analítica y Reportes" subtitle="Visualización de KPIs, rendimiento y exportación de datos" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        {/* Filtros Avanzados */}
        <div className="card p-6 flex flex-col gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2 text-sm font-black text-[var(--text-primary)]">
            <Filter className="w-5 h-5 text-[var(--orange)]" />
            <span>Filtros de Reporte:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Desde</label>
              <input 
                type="date" 
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Hasta</label>
              <input 
                type="date" 
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Categoría Menú</label>
              <select 
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setProductFilter('all');
                }}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id || cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Plato / Producto</label>
              <select 
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todos los platos</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Estado del pedido</label>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[var(--bg-input)] border rounded-2xl px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todos los estados</option>
                <option value="delivered">Entregados (Completados)</option>
                <option value="active">Activos en Preparación</option>
                <option value="pending">Pendientes de Aprobación</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 animate-fade-in-up delay-75">
          <StatCard title="Ventas Filtradas" value={formatCompact(localStats.totalSales)} change={`${localStats.orderCount} pedidos`} up emoji="💰" />
          <StatCard title="Ticket Promedio" value={formatCompact(localStats.avgTicket)} change="En rango seleccionado" up emoji="📈" />
          <StatCard title="Base de Clientes" value={String(customers.length)} change={`${stats.newCustomers} registrados`} up emoji="👥" />
          <StatCard title="Flujo de Caja" value={String(cashSession.transactions.length)} change={`Sesión activa: ${cashSession.id.substring(0,6)}`} up emoji="💳" />
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
