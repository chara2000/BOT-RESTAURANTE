'use client';

import { Download, FileSpreadsheet, FileText, BarChart3, TrendingUp } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';

export default function ReportesPage() {
  const { stats, orders, customers, inventory, cashSession } = useAppData();

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
    const rows = orders.map((o) =>
      `${o.id},${o.customer?.name ?? 'N/A'},${o.total},${o.status},${o.created_at}`
    ).join('\n');
    exportCSV(header + rows, `reporte-ventas-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportInventory = () => {
    const header = 'Insumo,Unidad,Stock,Minimo\n';
    const rows = inventory.map((i) => `${i.name},${i.unit},${i.stock},${i.min_stock}`).join('\n');
    exportCSV(header + rows, `reporte-inventario-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const maxDayAmount = Math.max(...stats.salesByDay.map((x) => x.amount), 1);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-violet-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Analítica y Reportes" subtitle="Visualización de KPIs, rendimiento y exportación de datos" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 animate-fade-in-up">
          <StatCard title="Proyección Semanal" value={formatCompact(stats.salesWeek)} change="Últimos 7 días" up emoji="📅" />
          <StatCard title="Facturación Mensual" value={formatCompact(stats.salesMonth)} change="Últimos 30 días" up emoji="📊" />
          <StatCard title="Base de Clientes" value={String(customers.length)} change={`${stats.newCustomers} registrados`} up emoji="👥" />
          <StatCard title="Flujo de Caja" value={String(cashSession.transactions.length)} change={`Sesión activa: ${cashSession.id.substring(0,6)}`} up emoji="💳" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up delay-100">
          <div className="card p-6 space-y-6 flex flex-col">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <BarChart3 className="h-5 w-5 text-[var(--orange)]" /> Volumen de Ventas por Día
            </p>
            <div className="space-y-4 flex-1 justify-center flex flex-col">
              {stats.salesByDay.map((d) => (
                <div key={d.day} className="flex items-center gap-4 group">
                  <span className="text-[11px] font-black uppercase tracking-wider w-10 shrink-0" style={{ color: 'var(--text-muted)' }}>{d.day}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden bg-[var(--bg-input)] shadow-inner">
                    <div className="h-full rounded-full transition-all duration-1000 ease-out relative" style={{
                      width: `${(d.amount / maxDayAmount) * 100}%`,
                      background: 'linear-gradient(90deg, var(--orange) 0%, #ff8a4c 100%)',
                      boxShadow: '0 0 10px var(--orange-glow)'
                    }}>
                      <div className="absolute inset-0 bg-white/20 w-0 group-hover:w-full transition-all duration-500" />
                    </div>
                  </div>
                  <span className="text-sm font-black w-24 text-right shrink-0 text-[var(--text-primary)]">{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6 space-y-6 flex flex-col">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <TrendingUp className="h-5 w-5 text-[var(--orange)]" /> Top 5 Productos Rentables
            </p>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {stats.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:bg-[var(--bg-input)] group hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm"
                       style={{ background: i === 0 ? 'var(--orange)' : 'var(--bg-card)', color: i === 0 ? '#fff' : 'var(--orange)', border: i !== 0 ? '1px solid var(--border)' : 'none' }}>
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate">{p.name}</p>
                    <p className="text-[10px] font-bold mt-0.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {p.sold} unidades desplazadas
                    </p>
                  </div>
                  <span className="text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                    {formatCompact(p.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-6 animate-fade-in-up delay-200">
          <p className="text-sm font-black mb-6">Generación de Reportes y Exportación</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { label: 'Exportar Ventas CSV', icon: FileSpreadsheet, action: exportSales, desc: 'Historial completo y montos' },
              { label: 'Exportar Inventario CSV', icon: FileText, action: exportInventory, desc: 'Stock actual y alertas' },
              { label: 'Imprimir Reporte PDF', icon: Download, action: () => window.print(), desc: 'Métricas visuales actuales' },
            ].map(({ label, icon: Icon, action, desc }) => (
              <button key={label} onClick={action}
                className="flex flex-col items-start gap-3 p-5 rounded-2xl border bg-[var(--bg-input)] transition-all hover:-translate-y-1 hover:shadow-lg group" style={{ borderColor: 'var(--border)' }}>
                <div className="p-3 rounded-xl bg-[var(--bg-card)] shadow-sm border group-hover:border-[var(--orange)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <Icon className="h-6 w-6 transition-colors group-hover:text-[var(--orange)]" style={{ color: 'var(--text-primary)' }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black mb-1 text-[var(--text-primary)]">{label}</p>
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
