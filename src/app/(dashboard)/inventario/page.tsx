'use client';

import { useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Package, Search, Plus, Pencil, Trash2, X, Check,
  LayoutGrid, Table as TableIcon, Filter, ChevronLeft, ChevronRight, Layers, ShieldCheck, TrendingDown
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCompact } from '@/lib/utils';
import type { InventoryItem } from '@/types';
import { useUIModal } from '@/components/ui/UIModal';

const UNITS = ['unidades', 'kg', 'g', 'litros', 'ml', 'porciones', 'cajas', 'bolsas', 'latas'];

const emptyItem = (): Partial<InventoryItem> => ({
  name: '',
  unit: 'unidades',
  stock: 0,
  min_stock: 10,
});

export default function InventarioPage() {
  const { showConfirm } = useUIModal();
  const { inventory, stockMovements, lowStockCount, updateInventory, addInventoryItem, deleteInventoryItem } = useAppData();

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'healthy'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<Partial<InventoryItem>>(emptyItem());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const totalItems = inventory.length;
  const totalStock = inventory.reduce((a, i) => a + i.stock, 0);

  const filtered = inventory.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const isLow = item.stock <= item.min_stock;
    const matchesFilter =
      stockFilter === 'all' ||
      (stockFilter === 'low' && isLow) ||
      (stockFilter === 'healthy' && !isLow);
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

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
    const ok = await showConfirm({
      title: '¿Eliminar Insumo?',
      message: `¿Estás seguro de que deseas eliminar "${item.name}" del inventario?`,
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    if (!ok) return;
    try {
      await deleteInventoryItem!(item.id);
      setMessage({ type: 'ok', text: 'Insumo eliminado.' });
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Error al eliminar.' });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleQuickAdjust = async (item: InventoryItem, delta: number) => {
    const newStock = Math.max(0, item.stock + delta);
    try {
      await updateInventory({ ...item, stock: newStock });
    } catch (err) {
      setMessage({ type: 'err', text: 'No se pudo ajustar el stock.' });
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-orange-500 opacity-[0.02] rounded-full blur-[100px] pointer-events-none" />

      <Topbar title="Control de Inventario" subtitle="Gestión de insumos, alertas de stock, entradas/salidas y auditoría" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">

        {/* Stats Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-fade-in-up">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-[var(--orange)] flex items-center justify-center font-black shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{totalItems}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Catálogo de Insumos</p>
            </div>
          </div>

          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{formatCompact(totalStock)}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Volumen en Bodega</p>
            </div>
          </div>

          <div className="card p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0 ${
              lowStockCount ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-500'
            }`}>
              {lowStockCount ? <AlertTriangle className="w-6 h-6 animate-pulse" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: lowStockCount ? 'var(--orange)' : 'var(--text-primary)' }}>
                {lowStockCount}
              </p>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                {lowStockCount ? 'Requiere reabastecimiento' : 'Stock en nivel óptimo'}
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className={`flex items-center justify-between p-4 rounded-2xl border font-bold text-xs animate-fade-in-up ${
            message.type === 'ok' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'ok' ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Action Controls & Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between animate-fade-in-up">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar insumo por nombre..."
              className="w-full text-xs font-semibold pl-11 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            {/* Filter buttons */}
            <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'low', label: '⚠️ Escasez' },
                { id: 'healthy', label: '✅ Normal' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setStockFilter(tab.id as any); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    stockFilter === tab.id
                      ? 'bg-[var(--orange)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                title="Vista Cuadrícula de Tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${viewMode === 'table' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                title="Vista Tabla Lista"
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={openCreate}
              className="px-5 py-3 rounded-2xl text-xs font-black text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
              style={{ background: 'var(--orange)' }}
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Insumo</span>
            </button>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in-up delay-100">

          {/* Left Area: Grid or Table view */}
          <div className="xl:col-span-2 space-y-5">
            {paginated.length === 0 ? (
              <div className="card p-14 text-center space-y-3">
                <Package className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
                <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No se encontraron insumos</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {search ? 'Intenta modificar el término de búsqueda' : 'Registra tu primer insumo para llevar control de stock'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              /* ─── GRID CARDS VIEW (SIMETRÍA SaaS) ─── */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginated.map((item) => {
                  const isLow = item.stock <= item.min_stock;
                  const ratio = item.min_stock > 0 ? Math.min(100, Math.round((item.stock / (item.min_stock * 2)) * 100)) : 100;

                  return (
                    <div
                      key={item.id}
                      className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 ${
                        isLow
                          ? 'border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.12)] ring-1 ring-amber-500/30'
                          : 'border-[var(--border)] hover:border-orange-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                      }`}
                      style={{ background: 'var(--bg-card)' }}
                    >
                      {/* Gradient Header */}
                      <div
                        className="relative h-20 overflow-hidden flex items-end px-5 pb-3"
                        style={{
                          background: isLow
                            ? 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(239,68,68,0.1) 100%)'
                            : 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.03) 100%)',
                        }}
                      >
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-md border ${
                            isLow ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          }`}>
                            {isLow ? <AlertTriangle className="w-6 h-6 animate-bounce" /> : <Package className="w-6 h-6" />}
                          </div>

                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                            isLow ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {isLow ? '⚠️ Escasez' : '● Saludable'}
                          </span>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="flex flex-col flex-1 p-5 pt-3 space-y-4">
                        <div>
                          <h3 className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            Unidad: <span className="text-[var(--text-primary)] font-black">{item.unit}</span>
                          </p>
                        </div>

                        {/* Stock Stats & Level Bar */}
                        <div className="p-3 rounded-2xl border space-y-2" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stock Actual</span>
                            <span className={`text-base font-black ${isLow ? 'text-[var(--orange)]' : 'text-[var(--text-primary)]'}`}>
                              {item.stock} <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{item.unit}</span>
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.max(8, ratio)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            <span>Mínimo: {item.min_stock} {item.unit}</span>
                            <span>{isLow ? 'Reabastecer' : 'OK'}</span>
                          </div>
                        </div>

                        {/* Quick stock adjustments */}
                        <div className="flex items-center justify-between gap-1.5 pt-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(item, 5)}
                              className="px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-glow)' }}
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(item, 10)}
                              className="px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-glow)' }}
                            >
                              +10
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(item, -1)}
                              className="px-2 py-1.5 rounded-xl text-[10px] font-black border text-rose-400 border-rose-500/30 bg-rose-500/10 hover:scale-105 active:scale-95 cursor-pointer"
                            >
                              -1
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="p-2 rounded-xl border transition-all hover:bg-[var(--bg-input)] cursor-pointer"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="p-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ─── TABLE VIEW (MODERNA CON SCROLL & STICKY HEADER) ─── */
              <div className="card bg-[var(--bg-card)] rounded-3xl border shadow-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-10 backdrop-blur-md" style={{ background: 'var(--bg-input)' }}>
                      <tr className="border-b text-[10px] font-black uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        <th className="px-5 py-3.5">Insumo</th>
                        <th className="px-4 py-3.5">Unidad</th>
                        <th className="px-4 py-3.5">Stock</th>
                        <th className="px-4 py-3.5">Mínimo</th>
                        <th className="px-4 py-3.5">Estado</th>
                        <th className="px-5 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-semibold" style={{ borderColor: 'var(--border)' }}>
                      {paginated.map((item) => {
                        const isLow = item.stock <= item.min_stock;
                        return (
                          <tr key={item.id} className="hover:bg-[var(--bg-input)] transition-colors">
                            <td className="px-5 py-4 font-black" style={{ color: 'var(--text-primary)' }}>
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                                  isLow ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                                }`}>
                                  {isLow ? <AlertTriangle className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                                </div>
                                <span>{item.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>{item.unit}</td>
                            <td className="px-4 py-4 font-black text-sm" style={{ color: isLow ? 'var(--orange)' : 'var(--text-primary)' }}>{item.stock}</td>
                            <td className="px-4 py-4 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{item.min_stock}</td>
                            <td className="px-4 py-4">
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                                isLow ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              }`}>
                                {isLow ? '⚠️ Escasez' : '● OK'}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleQuickAdjust(item, 10)}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all hover:scale-105 cursor-pointer"
                                  style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-glow)' }}
                                >
                                  +10
                                </button>
                                <button
                                  onClick={() => openEdit(item)}
                                  className="p-1.5 rounded-lg border transition-all hover:bg-[var(--bg-input)] cursor-pointer"
                                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(item)}
                                  className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
            )}

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                Mostrando {filtered.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filtered.length)} de {filtered.length} insumos
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={safePage <= 1}
                  className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-black px-3" style={{ color: 'var(--text-primary)' }}>
                  Página {safePage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={safePage >= totalPages}
                  className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Area: Stock Movements Audit Timeline */}
          <div className="card p-6 flex flex-col h-full animate-fade-in-up delay-200">
            <p className="text-sm font-black flex items-center gap-2 mb-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <Package className="h-5 w-5 text-[var(--orange)]" /> Auditoría de Movimientos
            </p>

            <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 max-h-[550px] custom-scrollbar">
              {stockMovements.length === 0 && (
                <p className="text-xs text-center py-12" style={{ color: 'var(--text-muted)' }}>Sin movimientos registrados aún.</p>
              )}
              {stockMovements.map((m) => {
                const isPositive = m.quantity > 0;
                return (
                  <div
                    key={m.id}
                    className="flex items-start gap-3.5 p-3.5 rounded-2xl border transition-all hover:bg-[var(--bg-input)] group"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  >
                    <div className={`p-2 rounded-xl border shrink-0 transition-transform group-hover:scale-110 ${
                      isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {isPositive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-[var(--text-primary)] truncate">{m.inventory_name}</p>
                        <span className={`text-xs font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}{m.quantity}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.reason}</p>
                      <p className="text-[9px] font-bold mt-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        {new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Modal: Create / Edit Insumo */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in p-4" onClick={closeModal}>
          <div
            className="relative w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-base font-black text-[var(--text-primary)]">
                  {modal === 'create' ? '+ Nuevo Insumo' : '✎ Editar Insumo'}
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {modal === 'create' ? 'Agrega un nuevo ítem al inventario' : `Editando: ${form.name}`}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Nombre del Insumo *</label>
                <input
                  value={form.name ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Pan Brioche o Carne Madurada"
                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Unidad de Medida *</label>
                <select
                  value={form.unit ?? 'unidades'}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
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
                    className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Stock Mínimo (Alerta) *</label>
                  <input
                    type="number"
                    value={form.min_stock ?? 10}
                    onChange={(e) => setForm((f) => ({ ...f, min_stock: Number(e.target.value) }))}
                    min={0}
                    className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl font-black text-xs border transition-all hover:bg-[var(--bg-input)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="flex-1 py-3 rounded-xl font-black text-xs text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-md cursor-pointer"
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
