'use client';

import { useState } from 'react';
import { Edit2, Plus, Search, Trash2, ToggleLeft, ToggleRight, FolderPlus, X, Check, Tag, ChevronLeft, ChevronRight, Utensils, Layers, PlusCircle, CheckCircle2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import type { Category, Product, AdditionItem } from '@/types';
import { ImageInputPicker } from '@/components/ImageInputPicker';
import { useUIModal } from '@/components/ui/UIModal';

export default function MenuPage() {
  const { products, categories, settings, updateSettings, updateProduct, addProduct, deleteProduct, addCategory, updateCategory, deleteCategory } = useAppData();
  const { showConfirm, showAlert } = useUIModal();
  const [filter, setFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  
  // Controlled product form state
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState<number | string>('');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAvailable, setFormAvailable] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  // Category modal state
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Additions modal state
  const [showAdditionsModal, setShowAdditionsModal] = useState(false);
  const [newAddName, setNewAddName] = useState('');
  const [newAddPrice, setNewAddPrice] = useState<number | string>('');
  const [savingAdd, setSavingAdd] = useState(false);

  const startEditProduct = (prod: Product) => {
    setEditing(prod);
    setFormName(prod.name);
    setFormPrice(prod.price);
    setFormCategory(prod.category);
    setFormDescription(prod.description || '');
    setFormImageUrl(prod.image_url || '');
    setFormAvailable(prod.is_available ?? true);
    setShowForm(true);
  };

  const startNewProduct = () => {
    setEditing(null);
    setFormName('');
    setFormPrice('');
    setFormCategory(categories[0]?.name || 'Hamburguesas');
    setFormDescription('');
    setFormImageUrl('');
    setFormAvailable(true);
    setShowForm(true);
  };

  const filtered = products.filter((p) => {
    const matchCat = filter === 'Todos' || p.category === filter || p.category_id === categories.find(c => c.name === filter)?.id;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const catName = formCategory || categories[0]?.name || 'General';
    const matchedCat = categories.find((c) => c.name === catName);

    const payload: Partial<Product> = {
      name: formName.trim(),
      price: Number(formPrice) || 0,
      category: catName,
      category_id: matchedCat?.id,
      image_url: formImageUrl || (editing?.image_url ?? 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'),
      description: formDescription.trim(),
      is_available: formAvailable,
    };

    try {
      if (editing) {
        await updateProduct({ ...editing, ...payload });
        setMessage('Producto actualizado exitosamente.');
      } else {
        await addProduct(payload as any);
        setMessage('Producto creado exitosamente.');
      }
      setShowForm(false);
      setEditing(null);
      setFormName('');
      setFormPrice('');
      setFormDescription('');
      setFormImageUrl('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      if (editingCat) {
        await updateCategory({ ...editingCat, name: newCatName.trim() });
      } else {
        await addCategory({ name: newCatName.trim() } as any);
      }
      setNewCatName('');
      setEditingCat(null);
    } catch (err) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Error al guardar categoría', type: 'error' });
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCat = async (cat: Category) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar Categoría?',
      message: `¿Estás seguro de que deseas eliminar la categoría "${cat.name}"?`,
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });

    if (confirmed) {
      try {
        await deleteCategory(cat.id);
        showAlert({ title: 'Éxito', message: 'Categoría eliminada correctamente', type: 'success' });
      } catch (err) {
        showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Error al eliminar categoría', type: 'error' });
      }
    }
  };

  // Additions handlers
  const currentAdditions = settings?.additions || [
    { id: 'add_1', name: '🧀 Extra Queso Costeño', price: 3500, is_available: true },
    { id: 'add_2', name: '🥓 Tocineta Ahumada', price: 4000, is_available: true },
    { id: 'add_3', name: '🥩 Carne Extra (150g)', price: 8500, is_available: true },
    { id: 'add_4', name: '🥚 Huevos de Codorniz (3 und)', price: 2500, is_available: true },
    { id: 'add_5', name: '🍟 Porción de Papas Francesas', price: 6000, is_available: true },
    { id: 'add_6', name: '🌽 Maíz Tierno Dulce', price: 3000, is_available: true },
    { id: 'add_7', name: '🥫 Salsa Tártara / Piña', price: 1500, is_available: true },
  ];

  const handleAddAddition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddName.trim() || !newAddPrice) return;
    setSavingAdd(true);
    try {
      const newItem: AdditionItem = {
        id: 'add_' + Date.now(),
        name: newAddName.trim(),
        price: Number(newAddPrice),
        is_available: true,
      };
      const updated = [...currentAdditions, newItem];
      await updateSettings({ additions: updated });
      setNewAddName('');
      setNewAddPrice('');
      showAlert({ title: 'Adición Creada', message: `Se agregó "${newItem.name}" al catálogo de adiciones.`, type: 'success' });
    } catch (err) {
      showAlert({ title: 'Error', message: 'No se pudo guardar la adición', type: 'error' });
    } finally {
      setSavingAdd(false);
    }
  };

  const handleToggleAddition = async (id: string) => {
    try {
      const updated = currentAdditions.map(a => a.id === id ? { ...a, is_available: !a.is_available } : a);
      await updateSettings({ additions: updated });
    } catch (err) {
      showAlert({ title: 'Error', message: 'No se pudo actualizar la disponibilidad', type: 'error' });
    }
  };

  const handleDeleteAddition = async (id: string, name: string) => {
    const ok = await showConfirm({
      title: '¿Eliminar Adición?',
      message: `¿Deseas eliminar la adición "${name}"?`,
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    if (ok) {
      try {
        const updated = currentAdditions.filter(a => a.id !== id);
        await updateSettings({ additions: updated });
        showAlert({ title: 'Eliminada', message: 'Adición eliminada correctamente', type: 'success' });
      } catch (err) {
        showAlert({ title: 'Error', message: 'No se pudo eliminar la adición', type: 'error' });
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Menú & Platillos" subtitle={`${products.length} platillos registrados en el sistema`} />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {message && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-black animate-fade-in-up flex items-center justify-between">
            <span>{message}</span>
            <button onClick={() => setMessage(null)} className="text-emerald-500 hover:opacity-75">✕</button>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar platillo o ingrediente..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl text-xs font-semibold border outline-none focus:ring-2 focus:ring-[var(--orange)] transition-all"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
            <button
              onClick={() => setShowAdditionsModal(true)}
              className="px-4 py-3 rounded-2xl border text-xs font-black hover:bg-[var(--bg-input)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <Layers className="h-4 w-4 text-[var(--orange)]" />
              <span>Adiciones ({currentAdditions.length})</span>
            </button>

            <button
              onClick={() => setShowCatModal(true)}
              className="px-4 py-3 rounded-2xl border text-xs font-black hover:bg-[var(--bg-input)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <FolderPlus className="h-4 w-4 text-[var(--orange)]" />
              <span>Categorías</span>
            </button>

            <button
              onClick={startNewProduct}
              className="px-5 py-3 rounded-2xl text-xs font-black text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
              style={{ background: 'var(--orange)' }}
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Producto</span>
            </button>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value={8}>8 / pág</option>
              <option value={12}>12 / pág</option>
              <option value={24}>24 / pág</option>
            </select>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {['Todos', ...categories.map((c) => c.name)].map((cat) => (
            <button
              key={cat}
              onClick={() => { setFilter(cat); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                filter === cat
                  ? 'bg-[var(--orange)] text-white shadow-md'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border hover:text-[var(--text-primary)]'
              }`}
              style={{ borderColor: filter === cat ? 'transparent' : 'var(--border)' }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Form Create/Edit Product */}
        {showForm && (
          <form key={editing?.id ?? 'new'} onSubmit={handleSave} className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up border shadow-xl" style={{ borderColor: 'var(--orange-glow)' }}>
            <div className="md:col-span-2 flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-black flex items-center gap-2">
                <Tag className="w-5 h-5 text-[var(--orange)]" />
                {editing ? `Editar "${editing.name}"` : 'Nuevo Producto / Platillo'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Nombre del Platillo *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Salchipapa Salvaje, Hamburguesa Doble, Granizado de Milo..."
                required
                className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Precio en COP *
              </label>
              <input
                type="number"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="Ej: 28000"
                required
                className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Categoría *
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                required
                className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <ImageInputPicker
                label="Imagen del Platillo (Foto de Referencia o Archivo Local)"
                value={formImageUrl}
                onChange={(url) => setFormImageUrl(url)}
                placeholder="https://images.unsplash.com/..."
                bucket="products"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Descripción del Platillo
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción apetitosa con ingredientes y detalles de preparación..."
                rows={3}
                className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <label className="flex items-center gap-3 text-xs font-black md:col-span-2 cursor-pointer p-3 rounded-xl border w-max" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
              <input
                type="checkbox"
                checked={formAvailable}
                onChange={(e) => setFormAvailable(e.target.checked)}
                className="w-4 h-4 accent-[var(--orange)]"
              />
              Disponible para la venta
            </label>

            <div className="flex gap-3 md:col-span-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="text-xs font-black px-6 py-3 rounded-xl text-white shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--orange)' }}
              >
                {saving ? 'Guardando...' : editing ? 'Actualizar Producto' : 'Publicar Producto'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs font-black px-6 py-3 rounded-xl border hover:bg-[var(--bg-input)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Product Cards Grid */}
        {paginated.length === 0 ? (
          <div className="card p-14 text-center space-y-3">
            <Utensils className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No hay platillos en esta categoría</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Intenta cambiar el filtro o crea un nuevo producto</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up">
            {paginated.map((product) => (
              <div key={product.id} className="group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 hover:border-orange-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                {/* Image Header with Gradient Overlay */}
                <div className="relative h-48 overflow-hidden">
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  {/* Category Pill */}
                  <span className="absolute top-3 left-3 bg-black/50 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/20">
                    {product.category}
                  </span>

                  {/* Toggle availability */}
                  <button onClick={async () => {
                    setMessage(null);
                    try { await updateProduct({ ...product, is_available: !product.is_available }); }
                    catch (err) { setMessage(err instanceof Error ? err.message : 'Error al actualizar'); }
                  }}
                    className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white hover:bg-black/70 transition-all shadow-lg cursor-pointer">
                    {product.is_available ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5 text-rose-400" />}
                  </button>

                  {/* Floating Price */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <span className="text-base font-black text-white drop-shadow-md bg-[var(--orange)] px-3 py-1 rounded-xl shadow-md">
                      {formatCurrency(product.price)}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex flex-col flex-1 space-y-3">
                  <h3 className="text-base font-black leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{product.name}</h3>
                  <p className="text-xs font-medium line-clamp-2 leading-relaxed flex-1" style={{ color: 'var(--text-muted)' }}>
                    {product.description || 'Sin descripción detallada.'}
                  </p>

                  <div className="flex items-center justify-between pt-3 mt-auto border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      product.is_available ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {product.is_available ? '● Disponible' : '○ Agotado'}
                    </span>

                    <div className="flex gap-1.5">
                      <button onClick={() => startEditProduct(product)}
                        className="p-2 rounded-xl border transition-all hover:bg-[var(--bg-input)] cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={async () => {
                        const ok = await showConfirm({
                          title: '¿Eliminar Producto?',
                          message: `¿Estás seguro de que deseas eliminar "${product.name}" del menú?`,
                          confirmText: 'Eliminar Plato',
                          cancelText: 'Cancelar',
                          isDanger: true,
                        });
                        if (ok) {
                          try {
                            await deleteProduct(product.id);
                            showAlert({ title: 'Éxito', message: 'Producto eliminado del menú', type: 'success' });
                          } catch (err) {
                            showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Error al eliminar', type: 'error' });
                          }
                        }
                      }}
                        className="p-2 rounded-xl border border-rose-500/20 text-rose-500 transition-all hover:bg-rose-500/10 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
              Mostrando {startIndex + 1}-{Math.min(startIndex + pageSize, filtered.length)} de {filtered.length} productos
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={safePage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-xl border bg-[var(--bg-card)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-black px-3 py-1 rounded-xl bg-[var(--orange)] text-white shadow-sm">
                {safePage} / {totalPages}
              </span>
              <button
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-xl border bg-[var(--bg-card)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Gestión de Adiciones */}
      {showAdditionsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-lg w-full animate-fade-in-up space-y-5 border shadow-2xl" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-black flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--orange)]" />
                Gestionar Adiciones del Menú
              </h3>
              <button
                onClick={() => setShowAdditionsModal(false)}
                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>

            <p className="text-xs font-medium text-[var(--text-muted)]">
              Crea o edita las adiciones que el cliente podrá añadir a sus platillos desde el bot de Telegram o la caja POS.
            </p>

            {/* Formulario de Nueva Adición */}
            <form onSubmit={handleAddAddition} className="p-4 rounded-2xl border space-y-3 bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-black text-[var(--text-primary)] flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-[var(--orange)]" /> Nueva Adición
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Nombre (ej: Extra Queso)"
                  value={newAddName}
                  onChange={(e) => setNewAddName(e.target.value)}
                  required
                  className="sm:col-span-2 text-xs font-semibold px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <input
                  type="number"
                  placeholder="Precio COP"
                  value={newAddPrice}
                  onChange={(e) => setNewAddPrice(e.target.value)}
                  required
                  className="text-xs font-semibold px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                type="submit"
                disabled={savingAdd}
                className="w-full text-xs font-black py-2.5 rounded-xl text-white shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--orange)' }}
              >
                {savingAdd ? 'Guardando...' : '➕ Agregar al Menú de Adiciones'}
              </button>
            </form>

            {/* Lista de Adiciones Existentes */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {currentAdditions.length === 0 ? (
                <p className="text-xs font-bold text-center text-[var(--text-muted)] py-4">No hay adiciones configuradas.</p>
              ) : (
                currentAdditions.map((addition) => (
                  <div
                    key={addition.id}
                    className="flex items-center justify-between p-3 rounded-xl border bg-[var(--bg-card)] hover:border-[var(--orange)] transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleAddition(addition.id)}
                        className="text-[var(--orange)] cursor-pointer"
                        title={addition.is_available ? 'Disponible' : 'No disponible'}
                      >
                        {addition.is_available ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-rose-400" />}
                      </button>
                      <div>
                        <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{addition.name}</p>
                        <p className="text-[10px] font-bold text-[var(--orange)]">+{formatCurrency(addition.price)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteAddition(addition.id, addition.name)}
                      className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Categorías */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full animate-fade-in-up space-y-4">
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-black flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[var(--orange)]" /> Administrar Categorías
              </p>
              <button
                type="button"
                onClick={() => { setShowCatModal(false); setEditingCat(null); setNewCatName(''); }}
                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Formulario de Categoría */}
            <form onSubmit={handleSaveCat} className="flex gap-2">
              <input
                type="text"
                placeholder={editingCat ? `Renombrar "${editingCat.name}"` : 'Nueva categoría...'}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
                className="flex-1 text-xs font-semibold px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="submit"
                disabled={savingCat}
                className="px-4 py-2.5 rounded-xl text-white text-xs font-black shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--orange)' }}
              >
                {savingCat ? '...' : editingCat ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
              {editingCat && (
                <button
                  type="button"
                  onClick={() => { setEditingCat(null); setNewCatName(''); }}
                  className="px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

            {/* Listado de Categorías */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 rounded-xl border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
                >
                  <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setEditingCat(cat); setNewCatName(cat.name); }}
                      className="p-1.5 rounded-lg border hover:bg-[var(--bg-card)] cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCat(cat)}
                      className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
