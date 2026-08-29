'use client';

import { useState, useEffect, useCallback } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { useUIModal } from '@/components/ui/UIModal';
import { ImageInputPicker } from '@/components/ImageInputPicker';
import {
  Building2, CheckCircle2, ShieldCheck, Sparkles,
  Store, Loader2, AlertCircle, Search, Edit3, Trash2,
  LogIn, Plus, RefreshCw, Check, Crown, Users, Globe,
  Calendar, Hash, Mail, Lock, ChevronRight, X, ShieldAlert, Wifi
} from 'lucide-react';

interface TenantItem {
  id: string;
  name: string;
  subdomain: string;
  plan_type: string;
  is_active: boolean;
  nit?: string;
  logo_url?: string;
  created_at?: string;
  admin_email?: string;
  admin_name?: string;
}

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  starter:    { label: 'Starter',    color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30',     icon: <Wifi className="w-3 h-3" /> },
  pro:        { label: 'Pro',        color: 'text-[#FF6B35]',   bg: 'bg-orange-500/10 border-orange-500/30', icon: <Sparkles className="w-3 h-3" /> },
  enterprise: { label: 'Enterprise', color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/30', icon: <Crown className="w-3 h-3" /> },
};

const inputCls = 'w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
const labelCls = 'text-[10px] font-black uppercase tracking-wider mb-1.5 block';
const labelStyle = { color: 'var(--text-muted)' };

export default function RegistroRestaurantePage() {
  const { selectedTenantId, setSelectedTenantId } = useAppData();
  const { showConfirm, showAlert } = useUIModal();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Create form
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [nit, setNit] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [planType, setPlanType] = useState('pro');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [telegramToken, setTelegramToken] = useState('');

  // Edit modal
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        if (data.tenants) setTenants(data.tenants);
      }
    } catch (err) {
      console.warn('Error fetching tenants:', err);
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!name.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setError('Por favor completa los campos obligatorios: Nombre, Email y Contraseña.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), subdomain: subdomain.trim(), nit: nit.trim(),
          logo_url: logoUrl.trim(), plan_type: planType,
          admin_name: adminName.trim(), admin_email: adminEmail.trim(),
          admin_password: adminPassword, telegram_bot_token: telegramToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar restaurante.');
      setSuccessMsg(data.message || `¡Restaurante "${name}" creado exitosamente!`);
      setName(''); setSubdomain(''); setNit(''); setLogoUrl('');
      setAdminName(''); setAdminEmail(''); setAdminPassword(''); setTelegramToken('');
      await fetchTenants();
      setTimeout(() => setActiveTab('list'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/tenants/${editingTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTenant.name, subdomain: editingTenant.subdomain,
          plan_type: editingTenant.plan_type, nit: editingTenant.nit,
          logo_url: editLogoUrl || editingTenant.logo_url,
          admin_email: editingTenant.admin_email, admin_name: editingTenant.admin_name,
          admin_password: editPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      setSuccessMsg(`¡Restaurante "${editingTenant.name}" actualizado!`);
      setEditingTenant(null);
      setEditPassword('');
      setEditLogoUrl('');
      await fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tenant: TenantItem) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar Restaurante?',
      message: `Eliminarás "${tenant.name}" junto con todos sus pedidos, productos, clientes e inventario. Las finanzas (caja registradora) se conservarán por auditoría. Esta acción NO se puede deshacer.`,
      confirmText: 'Sí, Eliminar Restaurante',
      cancelText: 'Cancelar',
      isDanger: true,
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/tenants/${tenant.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      // Si el tenant eliminado era el activo, deseleccionar
      if (selectedTenantId === tenant.id) setSelectedTenantId(null);

      showAlert({ title: '¡Eliminado!', message: data.message, type: 'success' });
      await fetchTenants();
    } catch (err) {
      showAlert({
        title: 'Error al eliminar',
        message: err instanceof Error ? err.message : 'No se pudo eliminar el restaurante.',
        type: 'error',
      });
    }
  };

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.subdomain.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.nit && t.nit.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500 opacity-[0.02] rounded-full blur-[100px] pointer-events-none" />

      <Topbar title="Gestión SaaS B2B de Restaurantes" subtitle="Super Admin — Alta, edición, eliminación y conmutación de sedes" />

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Stats banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <Store className="w-4 h-4" />, label: 'Restaurantes', value: tenants.length, color: 'text-[var(--orange)]', bg: 'bg-orange-500/10' },
              { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Activos', value: tenants.filter(t => t.is_active).length, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { icon: <Crown className="w-4 h-4" />, label: 'Enterprise', value: tenants.filter(t => t.plan_type === 'enterprise').length, color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { icon: <Sparkles className="w-4 h-4" />, label: 'Pro', value: tenants.filter(t => t.plan_type === 'pro').length, color: 'text-[var(--orange)]', bg: 'bg-orange-500/10' },
            ].map((s, i) => (
              <div key={i} className="card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center ${s.color} shrink-0`}>{s.icon}</div>
                <div>
                  <p className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tab selector */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1.5 rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => setActiveTab('list')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'list' ? 'bg-[var(--orange)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}>
                <Building2 className="w-4 h-4" />
                <span>Restaurantes ({tenants.length})</span>
              </button>
              <button type="button" onClick={() => setActiveTab('create')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'create' ? 'bg-[var(--orange)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}>
                <Plus className="w-4 h-4" />
                <span>Nuevo Restaurante</span>
              </button>
            </div>

            <button type="button" onClick={fetchTenants}
              className="p-2.5 rounded-xl border text-xs font-black hover:bg-[var(--bg-input)] transition-all flex items-center gap-2 cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <RefreshCw className={`w-4 h-4 ${loadingTenants ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 animate-fade-in-up">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-xs font-bold">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 animate-fade-in-up">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-xs font-bold">{successMsg}</p>
              <button onClick={() => setSuccessMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ─── TAB 1: Lista de Restaurantes ─── */}
          {activeTab === 'list' && (
            <div className="space-y-5 animate-fade-in-up">
              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input type="text" placeholder="Buscar por nombre, NIT o subdominio..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs font-semibold pl-11 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {loadingTenants ? (
                <div className="flex items-center justify-center p-16">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-10 h-10 animate-spin text-[var(--orange)] mx-auto" />
                    <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Cargando restaurantes...</p>
                  </div>
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="card p-14 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
                    <Store className="w-8 h-8 text-[var(--orange)]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No hay restaurantes aún</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Crea tu primer restaurante para empezar</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('create')}
                    className="px-6 py-2.5 rounded-xl bg-[var(--orange)] text-white text-xs font-black shadow-md cursor-pointer inline-flex items-center gap-2 hover:scale-[1.02] transition-all">
                    <Plus className="w-4 h-4" /> Crear Primer Restaurante
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredTenants.map((t) => {
                    const isSelected = t.id === selectedTenantId;
                    const plan = PLAN_CONFIG[t.plan_type] || PLAN_CONFIG.pro;
                    const initials = t.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

                    return (
                      <div key={t.id} className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 ${
                        isSelected
                          ? 'border-[var(--orange)] shadow-[0_0_40px_rgba(255,107,53,0.15)] ring-2 ring-[var(--orange)]/30'
                          : 'border-[var(--border)] hover:border-orange-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                      }`} style={{ background: 'var(--bg-card)' }}>

                        {/* Active badge */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 z-10 bg-[var(--orange)] text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Activa
                          </div>
                        )}

                        {/* Card header with gradient */}
                        <div className="relative h-24 overflow-hidden flex items-end px-5 pb-3"
                          style={{ background: isSelected ? 'linear-gradient(135deg, rgba(255,107,53,0.2) 0%, rgba(255,140,66,0.1) 100%)' : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                          {/* Decorative circles */}
                          <div className="absolute top-[-20px] right-[-20px] w-28 h-28 rounded-full opacity-10" style={{ background: 'var(--orange)' }} />
                          <div className="absolute top-2 right-8 w-12 h-12 rounded-full opacity-5" style={{ background: 'var(--orange)' }} />

                          {/* Logo / Initials */}
                          <div className="relative z-10">
                            {t.logo_url ? (
                              <img src={t.logo_url} alt={t.name}
                                className="w-16 h-16 rounded-2xl object-cover border-2 shadow-lg"
                                style={{ borderColor: isSelected ? 'var(--orange)' : 'var(--border)' }} />
                            ) : (
                              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg border-2 ${
                                isSelected ? 'bg-[var(--orange)] text-white border-orange-400' : 'bg-orange-500/15 text-[var(--orange)] border-orange-500/30'
                              }`}>
                                {initials || <Store className="w-7 h-7" />}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="flex flex-col flex-1 p-5 pt-2 space-y-3">
                          {/* Name + plan */}
                          <div className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-base font-black leading-tight" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
                              <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border flex items-center gap-1 ${plan.bg} ${plan.color}`}>
                                {plan.icon} {plan.label}
                              </span>
                            </div>
                            <p className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                              <Globe className="w-3 h-3 shrink-0" />
                              app.chefflow.com/<span className="font-black">{t.subdomain}</span>
                            </p>
                          </div>

                          {/* Metadata grid */}
                          <div className="grid grid-cols-1 gap-1.5 border-t border-b py-3" style={{ borderColor: 'var(--border)' }}>
                            {t.nit && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
                                  <Hash className="w-3 h-3" /> NIT
                                </span>
                                <span className="font-black text-emerald-500">{t.nit}</span>
                              </div>
                            )}
                            {t.admin_email && (
                              <div className="flex items-center justify-between text-xs gap-2">
                                <span className="flex items-center gap-1.5 font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                                  <Mail className="w-3 h-3" /> Admin
                                </span>
                                <span className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>{t.admin_email}</span>
                              </div>
                            )}
                            {t.created_at && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
                                  <Calendar className="w-3 h-3" /> Creado
                                </span>
                                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatDate(t.created_at)}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
                                <ShieldAlert className="w-3 h-3" /> Estado
                              </span>
                              <span className={`font-black text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                                t.is_active ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-500 bg-rose-500/10 border-rose-500/30'
                              }`}>
                                {t.is_active ? '● Activo' : '○ Inactivo'}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="space-y-2 pt-1">
                            {/* Login button */}
                            <button type="button" onClick={() => setSelectedTenantId(t.id)}
                              className={`w-full py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 cursor-default'
                                  : 'bg-[var(--orange)] text-white hover:scale-[1.02] active:scale-95 shadow-md hover:shadow-orange-500/20 hover:shadow-lg'
                              }`}>
                              {isSelected ? <><Check className="w-4 h-4" /> Sede Activa</> : <><LogIn className="w-4 h-4" /> Ingresar a esta Sede</>}
                            </button>

                            {/* Edit + Delete row */}
                            <div className="grid grid-cols-2 gap-2">
                              <button type="button"
                                onClick={() => {
                                  setEditingTenant(t);
                                  setEditLogoUrl(t.logo_url || '');
                                  setEditPassword('');
                                }}
                                className="py-2 rounded-xl text-xs font-bold border transition-all hover:bg-[var(--bg-input)] flex items-center justify-center gap-1.5 cursor-pointer"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                                <Edit3 className="w-3.5 h-3.5" /> Editar
                              </button>

                              <button type="button"
                                onClick={() => handleDelete(t)}
                                className="py-2 rounded-xl text-xs font-bold border border-rose-500/20 bg-rose-500/5 text-rose-500 transition-all hover:bg-rose-500/15 hover:border-rose-500/40 flex items-center justify-center gap-1.5 cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" /> Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add new card */}
                  <button type="button" onClick={() => setActiveTab('create')}
                    className="group flex flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all duration-300 min-h-[320px] cursor-pointer hover:border-[var(--orange)] hover:bg-orange-500/5"
                    style={{ borderColor: 'var(--border)' }}>
                    <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center text-[var(--orange)] group-hover:scale-110 transition-transform mb-3">
                      <Plus className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Nuevo Restaurante</p>
                    <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Crear sede y admin</p>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 2: Crear Restaurante ─── */}
          {activeTab === 'create' && (
            <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
              {/* Datos del Restaurante */}
              <div className="card p-6 space-y-4">
                <p className="text-sm font-black flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                  <Building2 className="h-5 w-5 text-[var(--orange)]" /> 1. Información de la Sede
                </p>

                <div>
                  <label className={labelCls} style={labelStyle}>Nombre del Restaurante *</label>
                  <input type="text" placeholder="Ej: La Casona Gourmet" value={name} required
                    onChange={(e) => { setName(e.target.value); if (!subdomain) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-')); }}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>NIT / Identificación Tributaria</label>
                  <input type="text" placeholder="Ej: 900.123.456-7" value={nit} onChange={(e) => setNit(e.target.value)} className={inputCls} style={inputStyle} />
                </div>

                <ImageInputPicker label="Logo del Restaurante (URL o Foto)" value={logoUrl} onChange={setLogoUrl} placeholder="https://ejemplo.com/logo.png" bucket="products" />

                <div>
                  <label className={labelCls} style={labelStyle}>Subdominio / Slug URL</label>
                  <input type="text" placeholder="lacasona-gourmet" value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Plan de Suscripción</label>
                  <select value={planType} onChange={(e) => setPlanType(e.target.value)} className={inputCls} style={inputStyle}>
                    <option value="starter">Starter — Hasta 500 pedidos/mes</option>
                    <option value="pro">Pro — Bot Telegram, Domicilios & Delivery</option>
                    <option value="enterprise">Enterprise — Multisede & VIP</option>
                  </select>
                </div>
              </div>

              {/* Credenciales Admin */}
              <div className="card p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <p className="text-sm font-black flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                    <ShieldCheck className="h-5 w-5 text-emerald-500" /> 2. Credenciales Admin Inicial
                  </p>
                  <div>
                    <label className={labelCls} style={labelStyle}>Nombre del Administrador</label>
                    <input type="text" placeholder="Roberto Gómez" value={adminName} onChange={(e) => setAdminName(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelCls} style={labelStyle}>Correo Electrónico Login *</label>
                    <input type="email" placeholder="admin@lacasona.com" value={adminEmail} required onChange={(e) => setAdminEmail(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelCls} style={labelStyle}>Contraseña Inicial *</label>
                    <input type="password" placeholder="••••••••" value={adminPassword} required minLength={6} onChange={(e) => setAdminPassword(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelCls} style={labelStyle}>Token Bot Telegram (Opcional)</label>
                    <input type="text" placeholder="1234567890:ABC..." value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-4 rounded-xl text-white font-black text-xs transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-4"
                  style={{ background: 'var(--orange)' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Crear Restaurante & Habilitar Administrador
                </button>
              </div>
            </form>
          )}

          {/* ─── MODAL DE EDICIÓN ─── */}
          {editingTenant && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <form onSubmit={handleEditSubmit} className="card p-6 max-w-lg w-full animate-fade-in-up space-y-4 border shadow-2xl" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    {editingTenant.logo_url ? (
                      <img src={editLogoUrl || editingTenant.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border" style={{ borderColor: 'var(--border)' }} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-[var(--orange)]"><Store className="w-5 h-5" /></div>
                    )}
                    <div>
                      <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Editar Restaurante</h3>
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{editingTenant.name}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setEditingTenant(null); setEditPassword(''); setEditLogoUrl(''); }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[var(--bg-input)] transition-all cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <div><label className={labelCls} style={labelStyle}>Nombre</label>
                    <input type="text" value={editingTenant.name} required onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })} className={inputCls} style={inputStyle} /></div>
                  <div><label className={labelCls} style={labelStyle}>NIT</label>
                    <input type="text" value={editingTenant.nit || ''} onChange={(e) => setEditingTenant({ ...editingTenant, nit: e.target.value })} className={inputCls} style={inputStyle} /></div>

                  <ImageInputPicker label="Logo del Restaurante" value={editLogoUrl} onChange={setEditLogoUrl} placeholder="https://ejemplo.com/logo.png" bucket="products" />

                  <div><label className={labelCls} style={labelStyle}>Subdominio</label>
                    <input type="text" value={editingTenant.subdomain} onChange={(e) => setEditingTenant({ ...editingTenant, subdomain: e.target.value })} className={inputCls} style={inputStyle} /></div>
                  <div><label className={labelCls} style={labelStyle}>Plan</label>
                    <select value={editingTenant.plan_type} onChange={(e) => setEditingTenant({ ...editingTenant, plan_type: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div><label className={labelCls} style={labelStyle}>Email Admin</label>
                    <input type="email" value={editingTenant.admin_email || ''} onChange={(e) => setEditingTenant({ ...editingTenant, admin_email: e.target.value })} className={inputCls} style={inputStyle} /></div>
                  <div><label className={labelCls} style={labelStyle}>Nombre Admin</label>
                    <input type="text" value={editingTenant.admin_name || ''} onChange={(e) => setEditingTenant({ ...editingTenant, admin_name: e.target.value })} className={inputCls} style={inputStyle} /></div>
                  <div>
                    <label className={labelCls} style={labelStyle}>Nueva Contraseña Admin (Opcional)</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <input type="password" placeholder="Dejar en blanco para conservar actual" value={editPassword} minLength={6}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full text-xs font-semibold pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all"
                        style={inputStyle} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button type="button" onClick={() => { setEditingTenant(null); setEditPassword(''); setEditLogoUrl(''); }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-input)] transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                  <button type="submit" disabled={loading}
                    className="px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-md flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
                    style={{ background: 'var(--orange)' }}>
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
