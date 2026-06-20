'use client';

import { AlertTriangle, ArrowDown, ArrowUp, Package, Search } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCompact } from '@/lib/utils';

export default function InventarioPage() {
  const { inventory, stockMovements, lowStockCount, updateInventory } = useAppData();

  const totalItems = inventory.length;
  const totalStock = inventory.reduce((a, i) => a + i.stock, 0);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-emerald-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Control de Inventario" subtitle="Gestión de insumos, alertas de stock y movimientos" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-in-up">
          <StatCard title="Total de Insumos" value={String(totalItems)} change="Catálogo activo" up emoji="📦" />
          <StatCard title="Volumen en Bodega" value={formatCompact(totalStock)} change="Unidades acumuladas" up emoji="⚖️" />
          <StatCard title="Alertas de Escasez" value={String(lowStockCount)} change={lowStockCount ? 'Requiere reabastecimiento' : 'Stock saludable'} up={!lowStockCount} emoji="⚠️" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in-up delay-100">
          <div className="xl:col-span-2 card overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-black text-sm tracking-wide">Stock Actual</p>
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Buscar insumo..." 
                  className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead style={{ background: 'var(--bg-input)' }}>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    {['Nombre del Insumo', 'U. Medida', 'Stock Actual', 'Mínimo', 'Estado', 'Ajuste Rápido'].map((h) => (
                      <th key={h} className="px-6 py-4 font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const low = item.stock <= item.min_stock;
                    return (
                      <tr key={item.id} className="border-t transition-colors hover:bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-6 py-4 font-bold flex items-center gap-3">
                          {low ? (
                            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.25)]"><AlertTriangle className="h-4 w-4" /></span>
                          ) : (
                            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]"><Package className="h-4 w-4" /></span>
                          )}
                          <span className="text-sm font-black text-[var(--text-primary)]">{item.name}</span>
                        </td>
                        <td className="px-6 py-4 font-bold" style={{ color: 'var(--text-muted)' }}>
                          <span className="px-2 py-1 bg-[var(--bg-card)] border rounded-md shadow-sm" style={{ borderColor: 'var(--border)' }}>{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 font-black text-sm" style={{ color: low ? 'var(--orange)' : 'var(--text-primary)' }}>{item.stock}</td>
                        <td className="px-6 py-4 font-bold" style={{ color: 'var(--text-muted)' }}>{item.min_stock}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(0,0,0,0.1)] border ${low ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 shadow-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shadow-emerald-500/20'}`}>
                            {low ? 'Stock Bajo' : 'Normal'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => updateInventory({ ...item, stock: item.stock + 10 })}
                            className="text-[10px] font-black px-3 py-1.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95 border"
                            style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-glow)' }}>
                            + 10 {item.unit}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-6 flex flex-col h-full animate-fade-in-up delay-200">
            <p className="text-sm font-black flex items-center gap-2 mb-6 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <Package className="h-5 w-5 text-[var(--orange)]" /> Auditoría de Movimientos
            </p>
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {stockMovements.map((m) => (
                <div key={m.id} className="flex items-start gap-4 p-3.5 rounded-2xl border transition-colors hover:bg-[var(--bg-input)] group" style={{ borderColor: 'var(--border)' }}>
                  <div className={`p-2 rounded-xl shadow-[0_0_12px_rgba(0,0,0,0.1)] border shrink-0 transition-transform group-hover:scale-110 ${m.quantity > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                    {m.quantity > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-[var(--text-primary)] truncate">{m.inventory_name}</p>
                      <span className={`text-xs font-black ${m.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold mt-1" style={{ color: 'var(--text-muted)' }}>
                      {m.reason}
                    </p>
                    <p className="text-[9px] font-bold mt-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
