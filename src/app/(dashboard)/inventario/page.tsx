'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Package, Search, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCompact } from '@/lib/utils';
import type { InventoryItem } from '@/types';

const UNITS = ['unidades', 'kg', 'g', 'litros', 'ml', 'porciones', 'cajas', 'bolsas', 'latas'];

const emptyItem = (): Partial<InventoryItem> => ({
  name: '',
  unit: 'unidades',
  stock: 0,
  min_stock: 10,
});

export default function InventarioPage() {
  const { inventory, stockMovements, lowStockCount, updateInventory, addInventoryItem, deleteInventoryItem } = useAppData();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<Partial<InventoryItem>>(emptyItem());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const totalItems = inventory.length;
  const totalStock = inventory.reduce((a, i) => a + i.stock, 0);

  const filtered = inventory.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setForm(emptyItem()); setModal('create'); };
  const openEdit = (item: InventoryItem) => { setForm({ ...item }); setModal('edit'); };
  const closeModal = () => { setModal(null); setForm(emptyItem()); };

  const handleSave = async () => {
    if (!form.name || form.stock === undefined || form.min_stock === undefined) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await addInventoryItem!(form as Omit<InventoryItem, 'id'>);
        setMessage({ type: 'ok', text: 'Insumo creado correctamente.' });
      } else if (modal === 'edit' && form.id) {
        await updateInventory(form as InventoryItem);
        setMessage({ type: 'ok', text: 'Insumo actualizado correctamente.' });
      }
      closeModal();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await deleteInventoryItem!(item.id);
      setMessage({ type: 'ok', text: 'Insumo eliminado.' });
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Error al eliminar.' });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-emerald-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Control de Inventario" subtitle="Gestión de insumos, alertas de stock y movimientos" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-in-up">
          <StatCard title="Total de Insumos" value={String(totalItems)} change="Catálogo activo" up emoji="📦" />
          <StatCard title="Volumen en Bodega" value={formatCompact(totalStock)} change="Unidades acumuladas" up emoji="⚖️" />
          <StatCard title="Alertas de Escasez" value={String(lowStockCount)} change={lowStockCount ? 'Requiere reabastecimiento' : 'Stock saludable'} up={!lowStockCount} emoji="⚠️" />
        </div>

        {/* Notification */}
        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-2xl border font-bold text-sm animate-fade-in-up ${message.type === 'ok' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
            {message.type === 'ok' ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in-up delay-100">
          {/* Main Table */}
          <div className="xl:col-span-2 card overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-black text-sm tracking-wide">Stock Actual</p>
              <div className="flex items-center gap-3">
                <div className="relative max-w-xs w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar insumo..."
                    className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 text-xs font-black px-4 py-2 rounded-xl text-white shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all shrink-0"
                  style={{ background: 'var(--orange)' }}
                >
                  <Plus className="h-4 w-4" /> Nuevo
                </button>
              </div>
            </div>

            {/* Scrollable table — max 5 rows visible */}
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '296px' }}>
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-input)' }}>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    {['Insumo', 'Unidad', 'Stock', 'Mín.', 'Estado', 'Acciones'].map((h) => (
                      <th key={h} className="px-4 py-3.5 font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                        {search ? 'Sin resultados para tu búsqueda.' : 'No hay insumos registrados. Crea el primero.'}
                      </td>
                    </tr>
                  )}
                  {filtered.map((item) => {
                    const low = item.stock <= item.min_stock;
                    return (
                      <tr key={item.id} className="border-t transition-colors hover:bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {low ? (
                              <span className="p-1 shrink-0 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/30">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span className="p-1 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                                <Package className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <span className="text-xs font-black text-[var(--text-primary)] truncate">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-bold" style={{ color: 'var(--text-muted)' }}>
                          <span className="text-[10px]">{item.unit}</span>
                        </td>
                        <td className="px-4 py-3.5 font-black text-sm" style={{ color: low ? 'var(--orange)' : 'var(--text-primary)' }}>{item.stock}</td>
                        <td className="px-4 py-3.5 font-bold text-xs" style={{ color: 'var(--text-muted)' }}>{item.min_stock}</td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${low ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'}`}>
                            {low ? 'Bajo' : 'Normal'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateInventory({ ...item, stock: item.stock + 10 })}
                              className="text-[10px] font-black px-2 py-1 rounded-lg transition-all hover:scale-105 active:scale-95 border"
                              style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-glow)' }}
                              title={`+10 ${item.unit}`}
                            >
                              +10
                            </button>
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1.5 rounded-lg border transition-all hover:scale-105 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-500"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 rounded-lg border transition-all hover:scale-105 hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-500"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
            {/* Altura máxima de ~280px que muestra exactamente un máximo de 3 movimientos sin scroll, y el resto con scroll */}
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: '280px' }}>
              {stockMovements.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Sin movimientos registrados.</p>
              )}
              {stockMovements.map((m) => (
                <div key={m.id} className="flex items-start gap-4 p-3.5 rounded-2xl border transition-colors hover:bg-[var(--bg-input)] group" style={{ borderColor: 'var(--border)' }}>
                  <div className={`p-2 rounded-xl border shrink-0 transition-transform group-hover:scale-110 ${m.quantity > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                    {m.quantity > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-[var(--text-primary)] truncate">{m.inventory_name}</p>
                      <span className={`text-xs font-black ${m.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold mt-1" style={{ color: 'var(--text-muted)' }}>{m.reason}</p>
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

      {/* Modal: Create / Edit */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={closeModal}>
          <div
            className="relative w-full max-w-md mx-4 rounded-3xl border shadow-2xl p-6 space-y-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={closeModal} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors" style={{ color: 'var(--text-muted)' }}>
              <X className="h-4 w-4" />
            </button>

            <div>
              <h3 className="text-base font-black text-[var(--text-primary)]">
                {modal === 'create' ? '+ Nuevo Insumo' : '✎ Editar Insumo'}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {modal === 'create' ? 'Agrega un nuevo ítem al inventario' : `Editando: ${form.name}`}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Nombre del Insumo *</label>
                <input
                  value={form.name ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Harina de trigo"
                  className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Unidad de Medida *</label>
                <select
                  value={form.unit ?? 'unidades'}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] appearance-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Stock Actual *</label>
                  <input
                    type="number"
                    value={form.stock ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
                    min={0}
                    className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Stock Mínimo *</label>
                  <input
                    type="number"
                    value={form.min_stock ?? 10}
                    onChange={(e) => setForm((f) => ({ ...f, min_stock: Number(e.target.value) }))}
                    min={0}
                    className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl font-black text-sm border transition-all hover:bg-[var(--bg-input)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="flex-1 py-3 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-[0_4px_12px_var(--orange-glow)]"
                style={{ background: 'var(--orange)' }}
              >
                {saving ? 'Guardando...' : modal === 'create' ? 'Crear Insumo' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
