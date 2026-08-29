'use client';

import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Bike, MapPin, CheckCircle2, XCircle, Edit, Trash2, Shield, Eye, EyeOff, Search, Star, Phone, Mail, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useUIModal } from '@/components/ui/UIModal';
import { useAppData } from '@/context/AppDataContext';
import { ridersService } from '@/services/api';

const inputCls = 'w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
const labelCls = 'text-[10px] font-black uppercase tracking-wider mb-1 block';
const labelStyle = { color: 'var(--text-muted)' };

export default function RepartidoresPage() {
  const { showConfirm } = useUIModal();
  const { activeTenantId } = useAppData();
  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'busy'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingRider, setEditingRider] = useState<any | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    vehicle_type: 'motorcycle',
    plate_number: '',
    vehicle_model: '',
    vehicle_color: '',
    vehicle_description: ''
  });

  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    fetchRiders();
  }, [activeTenantId]);

  const fetchRiders = async () => {
    setLoading(true);
    try {
      const data = await ridersService.getAll(activeTenantId);
      setRiders(data);
    } catch (error) {
      console.error('Error fetching riders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (rider: any) => {
    setEditingRider(rider);
    setFormData({
      name: rider.name || '',
      email: rider.email || '',
      phone: rider.phone || '',
      password: '',
      vehicle_type: rider.vehicle_type || 'motorcycle',
      plate_number: rider.plate_number || '',
      vehicle_model: rider.vehicle_model || '',
      vehicle_color: rider.vehicle_color || '',
      vehicle_description: rider.vehicle_description || ''
    });
    setShowModal(true);
  };

  const handleOpenCreate = () => {
    setEditingRider(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      vehicle_type: 'motorcycle',
      plate_number: '',
      vehicle_model: '',
      vehicle_color: '',
      vehicle_description: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setMessage(null);

    const isEdit = !!editingRider;
    const url = isEdit ? `/api/riders/${editingRider.id}` : '/api/riders';
    const method = isEdit ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': activeTenantId || '',
        },
        body: JSON.stringify({ ...formData, tenant_id: activeTenantId })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud');
      
      setMessage({ 
        type: 'success', 
        text: isEdit ? 'Repartidor actualizado correctamente' : 'Repartidor creado correctamente' 
      });
      setShowModal(false);
      fetchRiders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await showConfirm({
      title: '¿Eliminar Repartidor?',
      message: `¿Estás seguro de que deseas eliminar al repartidor "${name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    if (!ok) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/riders/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar repartidor');
      
      setMessage({ type: 'success', text: 'Repartidor eliminado exitosamente' });
      fetchRiders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setLoading(false);
    }
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/riders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !currentStatus })
      });
      if (res.ok) {
        setRiders(prev => prev.map(r => r.id === id ? { ...r, is_available: !currentStatus } : r));
      }
    } catch (error) {
      console.error('Error toggling availability:', error);
    }
  };

  const filteredRiders = riders.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.phone?.includes(q) || r.plate_number?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || (filterStatus === 'available' && r.is_available) || (filterStatus === 'busy' && !r.is_available);
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filteredRiders.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRiders = filteredRiders.slice(startIndex, startIndex + pageSize);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-body)]">
      {/* Glow ambient background */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />

      <Topbar title="Repartidores Propios" subtitle="Gestiona tu flota de repartidores, vehículos y credenciales de acceso" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 z-10 relative">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Action Bar & Search */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between animate-fade-in-up">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Buscar por nombre, correo, teléfono o placa..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full text-xs font-semibold pl-11 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'available', label: '● Libres' },
                  { id: 'busy', label: '○ Ocupados' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setFilterStatus(tab.id as any); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      filterStatus === tab.id
                        ? 'bg-[var(--orange)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleOpenCreate}
                className="px-5 py-3 bg-[var(--orange)] text-white rounded-2xl text-xs font-black shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Repartidor</span>
              </button>

              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value={6}>6 / pág</option>
                <option value={9}>9 / pág</option>
                <option value={18}>18 / pág</option>
              </select>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between border ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
            }`}>
              <div className="flex items-center gap-2">
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{message.text}</span>
              </div>
              <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)] space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--orange)]"></div>
              <p className="text-xs font-bold">Cargando flota de reparto...</p>
            </div>
          ) : paginatedRiders.length === 0 ? (
            <div className="card p-14 text-center space-y-3">
              <Bike className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
              <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No se encontraron repartidores</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Registra repartidores para asignación de envíos</p>
              <button onClick={handleOpenCreate} className="px-5 py-2.5 bg-[var(--orange)] text-white rounded-xl text-xs font-black shadow-md cursor-pointer inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Crear Repartidor
              </button>
            </div>
          ) : (
            /* ─── CARDS GRID (SIMETRÍA SaaS 3D) ─── */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
              {paginatedRiders.map((rider) => {
                const initials = rider.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

                return (
                  <div
                    key={rider.id}
                    className="group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 hover:border-orange-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  >
                    {/* Header Gradient */}
                    <div
                      className="relative h-24 overflow-hidden flex items-end px-5 pb-3"
                      style={{
                        background: rider.is_available
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.03) 100%)'
                          : 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.03) 100%)',
                      }}
                    >
                      <div className="relative z-10 flex items-center justify-between w-full">
                        {/* Avatar */}
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--orange)] to-amber-500 flex items-center justify-center font-black text-white text-lg shadow-lg border-2 border-white/20">
                          {initials || <Bike className="w-7 h-7" />}
                        </div>

                        {/* Availability switch button */}
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          <span className="text-[9px] font-black uppercase text-white tracking-wider">
                            {rider.is_available ? '● Libre' : '○ Ocupado'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleAvailability(rider.id, rider.is_available)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              rider.is_available ? 'bg-emerald-500' : 'bg-rose-500/40'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                rider.is_available ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="flex flex-col flex-1 p-5 pt-3 space-y-4">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>{rider.name}</h3>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0 flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {rider.rating?.toFixed(1) || '5.0'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          <Mail className="w-3 h-3 text-[var(--orange)] shrink-0" />
                          <span className="truncate">{rider.email}</span>
                        </p>
                      </div>

                      {/* Vehicle Details Grid */}
                      <div className="p-3.5 rounded-2xl border space-y-2" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Vehículo</span>
                          <span className="font-black capitalize" style={{ color: 'var(--text-primary)' }}>
                            {rider.vehicle_type === 'motorcycle' ? '🛵 Motocicleta' : rider.vehicle_type === 'bicycle' ? '🚲 Bicicleta' : '🚗 Automóvil'}
                          </span>
                        </div>

                        {rider.plate_number && (
                          <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Placa</span>
                            <span className="font-black text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                              {rider.plate_number}
                            </span>
                          </div>
                        )}

                        {rider.phone && (
                          <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Celular</span>
                            <a href={`tel:${rider.phone}`} className="font-black text-[var(--orange)] hover:underline flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {rider.phone}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(rider)}
                          className="py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-[var(--bg-input)] flex items-center justify-center gap-1.5 cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          <Edit className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rider.id, rider.name)}
                          className="py-2.5 rounded-xl text-xs font-bold border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
              Mostrando {filteredRiders.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredRiders.length)} de {filteredRiders.length} repartidores
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
      </div>

      {/* MODAL EDIT / CREATE */}
      {showModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="card p-6 max-w-lg w-full animate-fade-in-up space-y-4 border shadow-2xl" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Bike className="w-5 h-5 text-[var(--orange)]" />
                {editingRider ? `Editar Repartidor: ${editingRider.name}` : 'Nuevo Repartidor'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[var(--bg-input)] transition-all cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className={labelCls} style={labelStyle}>Nombre Completo *</label>
                <input type="text" value={formData.name} required onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} style={inputStyle} placeholder="ej. Pedro Infante" />
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Correo Electrónico (Login) *</label>
                <input type="email" value={formData.email} required onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} style={inputStyle} placeholder="repartidor@empresa.com" />
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Celular / WhatsApp *</label>
                <input type="text" value={formData.phone} required onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} style={inputStyle} placeholder="+57 300 123 4567" />
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>{editingRider ? 'Nueva Contraseña (Opcional)' : 'Contraseña Acceso *'}</label>
                <input type="password" value={formData.password} required={!editingRider} minLength={6} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={inputCls} style={inputStyle} placeholder="••••••••" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Tipo de Vehículo</label>
                  <select value={formData.vehicle_type} onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })} className={inputCls} style={inputStyle}>
                    <option value="motorcycle">🛵 Motocicleta</option>
                    <option value="bicycle">🚲 Bicicleta</option>
                    <option value="car">🚗 Automóvil</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Placa del Vehículo</label>
                  <input type="text" value={formData.plate_number} onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })} className={inputCls} style={inputStyle} placeholder="XYZ-123" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-input)] transition-all" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                Cancelar
              </button>
              <button type="submit" disabled={submitLoading} className="px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-md flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all" style={{ background: 'var(--orange)' }}>
                {submitLoading && <CheckCircle2 className="w-3.5 h-3.5 animate-spin" />}
                {editingRider ? 'Guardar Cambios' : 'Crear Repartidor'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
