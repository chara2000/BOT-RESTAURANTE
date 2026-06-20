'use client';

import { useState } from 'react';
import { Edit2, Plus, Search, Trash2, ToggleLeft, ToggleRight, FolderPlus, X, Check, Tag } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import type { Category, Product } from '@/types';

export default function MenuPage() {
  const { products, categories, updateProduct, addProduct, deleteProduct, addCategory, updateCategory } = useAppData();
  const [filter, setFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Category modal state
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const filtered = products.filter((p) => {
    const matchCat = filter === 'Todos' || p.category === filter || p.category_id === categories.find(c => c.name === filter)?.id;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const catId = fd.get('category_id') as string;
    const catName = categories.find(c => c.id === catId)?.name ?? catId;
    const data: Product = {
      id: editing?.id ?? `p${Date.now()}`,
      name: fd.get('name') as string,
      category: catName,
      category_id: catId,
      price: Number(fd.get('price')),
      description: fd.get('description') as string,
      image_url: (fd.get('image_url') as string) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      is_available: fd.get('is_available') === 'on',
      stock: Number(fd.get('stock') ?? 0),
    };
    try {
      if (editing) await updateProduct(data);
      else await addProduct(data);
      setEditing(null);
      setShowForm(false);
      setMessage(editing ? 'Producto actualizado.' : 'Producto creado y guardado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      if (editingCat) {
        await updateCategory({ ...editingCat, name: newCatName.trim() });
      } else {
        await addCategory({ name: newCatName.trim(), sort_order: categories.length, is_active: true });
      }
      setNewCatName('');
      setEditingCat(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const handleToggleCat = async (cat: Category) => {
    try {
      await updateCategory({ ...cat, is_active: !cat.is_active });
    } catch (err) {
      alert('Error al actualizar categoría');
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--orange)] opacity-[0.03] rounded-full blur-[120px] pointer-events-none" />
      <Topbar title="Menú Digital" subtitle="Gestión de productos, categorías y disponibilidad" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        <div className="flex flex-col gap-5 animate-fade-in-up">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors group-focus-within:text-[var(--orange)]" style={{ color: 'var(--text-muted)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar platillos o bebidas..."
                className="w-full text-sm font-semibold pl-12 pr-4 py-3.5 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-[var(--orange)] shadow-sm hover:shadow-md"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>

            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowCatModal(true)}
                className="flex items-center gap-2 text-sm font-black px-4 py-3.5 rounded-xl border hover:bg-[var(--bg-input)] transition-all"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <FolderPlus className="h-4 w-4" /> Categorías
              </button>
              <button onClick={() => { setEditing(null); setShowForm(true); }}
                className="flex items-center gap-2 text-sm font-black px-6 py-3.5 rounded-xl text-white shadow-[0_8px_20px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all"
                style={{ background: 'var(--orange)' }}>
                <Plus className="h-5 w-5" /> Nuevo Plato
              </button>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
            {['Todos', ...categories.filter(c => c.is_active).map(c => c.name)].map((c) => (
              <button key={c} onClick={() => setFilter(c)}
                className="text-xs font-black px-5 py-2.5 rounded-xl transition-all whitespace-nowrap border shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-md hover:-translate-y-0.5"
                style={{
                  background: filter === c ? 'var(--orange)' : 'var(--bg-input)',
                  color: filter === c ? '#fff' : 'var(--text-muted)',
                  borderColor: filter === c ? 'var(--orange)' : 'var(--border)'
                }}>{c}</button>
            ))}
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl border backdrop-blur-md font-bold text-sm animate-fade-in-up ${message.includes('guardado') || message.includes('actualizado') ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
            {message}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in-up">
            <p className="md:col-span-2 text-lg font-black">{editing ? 'Editar Producto' : 'Crear Nuevo Producto'}</p>
            <input name="name" defaultValue={editing?.name} placeholder="Nombre del platillo" required
              className="text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            <select name="category_id" defaultValue={editing?.category_id ?? categories[0]?.id ?? ''}
              className="text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {categories.filter(c => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="price" type="number" defaultValue={editing?.price} placeholder="Precio ($)" required
              className="text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            <input name="stock" type="number" defaultValue={editing?.stock ?? 0} placeholder="Unidades (Opcional)"
              className="text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            <input name="image_url" defaultValue={editing?.image_url} placeholder="URL de la imagen (Alta calidad)"
              className="text-sm font-semibold px-4 py-3 rounded-xl border md:col-span-2 focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            <textarea name="description" defaultValue={editing?.description} placeholder="Descripción apetitosa..." rows={3}
              className="text-sm font-semibold px-4 py-3 rounded-xl border md:col-span-2 focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            <label className="flex items-center gap-3 text-sm font-black md:col-span-2 cursor-pointer p-3 rounded-xl border w-max" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
              <input type="checkbox" name="is_available" defaultChecked={editing?.is_available ?? true} className="w-4 h-4 accent-[var(--orange)]" />
              Disponible para la venta
            </label>
            <div className="flex gap-3 md:col-span-2 pt-2">
              <button type="submit" disabled={saving} className="text-sm font-black px-6 py-3 rounded-xl text-white disabled:opacity-60 shadow-md transition-transform active:scale-95" style={{ background: 'var(--orange)' }}>
                {saving ? 'Guardando...' : editing ? 'Actualizar Producto' : 'Publicar Producto'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm font-black px-6 py-3 rounded-xl border hover:bg-[var(--bg-input)] transition-colors"
                style={{ borderColor: 'var(--border)' }}>Cancelar</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up delay-100">
          {filtered.map((product) => (
            <div key={product.id} className="card overflow-hidden group hover:shadow-lg transition-all duration-300 flex flex-col">
              <div className="relative h-44 overflow-hidden">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                <span className="absolute top-3 left-3 bg-black/40 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border border-white/20">
                  {product.category}
                </span>
                <button onClick={async () => {
                  setMessage(null);
                  try { await updateProduct({ ...product, is_available: !product.is_available }); }
                  catch (err) { setMessage(err instanceof Error ? err.message : 'Error al actualizar disponibilidad'); }
                }}
                  className="absolute top-3 right-3 p-1.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-black/60 transition-colors shadow-lg">
                  {product.is_available ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5 text-rose-400" />}
                </button>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm lg:text-base font-black leading-tight">{product.name}</p>
                  <span className="text-sm lg:text-base font-black bg-[var(--orange-soft)] px-2.5 py-1 rounded-xl text-[var(--orange)] border border-[var(--orange-glow)] shadow-sm shrink-0">
                    {formatCurrency(product.price)}
                  </span>
                </div>
                <p className="text-[11px] lg:text-xs font-medium line-clamp-2 leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
                  {product.description || 'Sin descripción detallada.'}
                </p>
                <div className="flex items-center justify-between pt-4 mt-auto border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg shadow-[0_0_12px_rgba(0,0,0,0.1)] border ${product.is_available ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                    {product.is_available ? '• Disponible' : '• Agotado'}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(product); setShowForm(true); }}
                      className="p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--orange-soft)] hover:text-[var(--orange)] transition-colors border shadow-sm" style={{ borderColor: 'var(--border)' }}>
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={async () => {
                      if (confirm('¿Eliminar producto?')) {
                        try { await deleteProduct(product.id); } catch (err) {}
                      }
                    }}
                      className="p-2 rounded-xl bg-[var(--bg-input)] hover:bg-rose-100 hover:text-rose-600 transition-colors border shadow-sm" style={{ borderColor: 'var(--border)' }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ====== Category Manager Modal ====== */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => { setShowCatModal(false); setEditingCat(null); setNewCatName(''); }}>
          <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-3xl shadow-2xl p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[var(--orange-soft)] text-[var(--orange)]">
                  <Tag className="w-5 h-5" />
                </div>
                <p className="text-lg font-black text-[var(--text-primary)]">Gestión de Categorías</p>
              </div>
              <button onClick={() => { setShowCatModal(false); setEditingCat(null); setNewCatName(''); }}
                className="p-2 rounded-xl hover:bg-[var(--bg-input)] text-[var(--text-muted)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add / edit form */}
            <div className="flex gap-2">
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveCategory(); }}}
                placeholder={editingCat ? `Renombrar "${editingCat.name}"` : 'Nombre de nueva categoría...'}
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button onClick={handleSaveCategory} disabled={savingCat || !newCatName.trim()}
                className="px-4 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50 transition-all active:scale-95"
                style={{ background: 'var(--orange)' }}>
                {savingCat ? '...' : editingCat ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
              {editingCat && (
                <button onClick={() => { setEditingCat(null); setNewCatName(''); }}
                  className="px-3 py-3 rounded-xl border font-black text-sm transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category list */}
            <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] overflow-hidden">
              {categories.length === 0 && (
                <p className="text-center text-[var(--text-muted)] text-sm py-6">No hay categorías aún.</p>
              )}
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-input)] transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${cat.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <p className={`flex-1 text-sm font-bold ${cat.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}>
                    {cat.name}
                    <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                      ({products.filter(p => p.category_id === cat.id || p.category === cat.name).length} productos)
                    </span>
                  </p>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setEditingCat(cat); setNewCatName(cat.name); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--orange-soft)] hover:text-[var(--orange)] transition-colors text-[var(--text-muted)]">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleCat(cat)}
                      className={`p-1.5 rounded-lg transition-colors ${cat.is_active ? 'hover:bg-rose-100 hover:text-rose-500 text-emerald-500' : 'hover:bg-emerald-100 hover:text-emerald-600 text-rose-500'}`}>
                      {cat.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
