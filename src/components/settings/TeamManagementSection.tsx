'use client';

import { useState, useEffect } from 'react';
import { Shield, Plus, Pencil, Trash2, X, Check, RefreshCw, ChevronDown } from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';

// ── Módulos disponibles ────────────────────────────────────────────────────
export const AVAILABLE_MODULES = [
  { id: '/',              label: 'Dashboard',            icon: '📊' },
  { id: '/pedidos',       label: 'Pedidos',              icon: '📋' },
  { id: '/caja',          label: 'Caja / POS',           icon: '💵' },
  { id: '/pagos',         label: 'Registro de Pagos',    icon: '💳' },
  { id: '/clientes',      label: 'Clientes & CRM',       icon: '👥' },
  { id: '/domicilios',    label: 'Domicilios',           icon: '🛵' },
  { id: '/repartidores',  label: 'Repartidores',         icon: '🛵' },
  { id: '/mensajes',      label: 'Mensajes & Chat',      icon: '💬' },
  { id: '/ia',            label: 'IA & Automatizaciones',icon: '🤖' },
  { id: '/reportes',      label: 'Reportes & Analítica', icon: '📈' },
  { id: '/configuracion', label: 'Configuración',        icon: '⚙️' },
];

// Módulos por defecto según rol
export const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
  admin:    AVAILABLE_MODULES.map(m => m.id),  // todos
  operator: ['/', '/pedidos', '/caja', '/pagos', '/clientes', '/mensajes'],
  kitchen:  ['/', '/pedidos'],
  delivery: ['/', '/domicilios', '/repartidores'],
};

// Color badge por rol
const ROLE_COLORS: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  super_admin: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Super Admin', icon: '⭐' },
  admin:       { bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: 'Admin',       icon: '👑' },
  operator:    { bg: 'bg-sky-500/10',    text: 'text-sky-400',    label: 'Operador',    icon: '💵' },
  kitchen:     { bg: 'bg-emerald-500/10',text: 'text-emerald-400',label: 'Cocina',      icon: '👨‍🍳' },
  delivery:    { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Repartidor',  icon: '🛵' },
};

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  allowed_modules: string[];
  is_active: boolean;
}

// ── Selector de Módulos ───────────────────────────────────────────────────
function ModuleSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (mods: string[]) => void;
}) {
  const all = selected.length === AVAILABLE_MODULES.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Módulos habilitados ({selected.length}/{AVAILABLE_MODULES.length})
        </span>
        <button
          type="button"
          onClick={() => onChange(all ? [] : AVAILABLE_MODULES.map(m => m.id))}
          className="text-[10px] font-bold cursor-pointer hover:underline"
          style={{ color: 'var(--orange)' }}
        >
          {all ? 'Quitar todos' : 'Marcar todos'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {AVAILABLE_MODULES.map(m => {
          const on = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                onChange(on ? selected.filter(x => x !== m.id) : [...selected, m.id])
              }
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer"
              style={{
                background: on ? 'var(--orange-soft)' : 'var(--bg-input)',
                borderColor: on ? 'var(--orange)' : 'var(--border)',
                color: on ? 'var(--orange)' : 'var(--text-muted)',
              }}
            >
              <span className="text-sm">{m.icon}</span>
              <span className="text-[10px] font-bold flex-1 truncate">{m.label}</span>
              {on && <Check className="w-3 h-3 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal Crear / Editar Usuario ──────────────────────────────────────────
function UserModal({
  mode,
  user,
  tenantId,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  user?: TeamUser;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || 'operator');
  const [modules, setModules] = useState<string[]>(
    user?.allowed_modules?.length ? user.allowed_modules : ROLE_DEFAULT_MODULES['operator']
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function applyRoleDefaults(r: string) {
    setRole(r);
    setModules(ROLE_DEFAULT_MODULES[r] || ROLE_DEFAULT_MODULES['operator']);
  }

  async function handleSubmit() {
    setError('');
    if (mode === 'create' && (!name || !email || !password)) {
      setError('Nombre, correo y contraseña son obligatorios.');
      return;
    }
    if (password && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (modules.length === 0) {
      setError('Selecciona al menos un módulo.');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, role, allowed_modules: modules, tenant_id: tenantId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error creando usuario');
      } else {
        const res = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user!.id, role, allowed_modules: modules }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error actualizando');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  const ROLE_OPTIONS = [
    { role: 'operator', label: 'Operador / Cajero', icon: '💵' },
    { role: 'kitchen',  label: 'Cocina',            icon: '👨‍🍳' },
    { role: 'delivery', label: 'Repartidor',         icon: '🛵' },
    { role: 'admin',    label: 'Admin',              icon: '👑' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div
        className="w-full max-w-lg rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] animate-fade-in-up overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
              {mode === 'create' ? '+ Nuevo Miembro del Equipo' : `✏️ Editar: ${user?.name}`}
            </h3>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {mode === 'create'
                ? 'Crea un usuario y configura su acceso por módulos'
                : 'Cambia el rol y los módulos habilitados'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--bg-input)] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Datos personales — solo en modo crear */}
          {mode === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Correo (Login)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="cajero@rest.com"
                    className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Rol base */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>
              Rol Base — selecciona para cargar módulos por defecto
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROLE_OPTIONS.map(r => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => applyRoleDefaults(r.role)}
                  className="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  style={{
                    background: role === r.role ? 'var(--orange)' : 'var(--bg-input)',
                    color: role === r.role ? '#fff' : 'var(--text-primary)',
                    borderColor: role === r.role ? 'var(--orange)' : 'var(--border)',
                  }}
                >
                  <p className="text-lg mb-1">{r.icon}</p>
                  <p className="text-[10px] font-black leading-tight">{r.label}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-medium mt-2" style={{ color: 'var(--text-muted)' }}>
              ⚡ Seleccionar un rol carga automáticamente sus módulos predeterminados. Puedes personalizar abajo.
            </p>
          </div>

          {/* Módulos */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <ModuleSelector selected={modules} onChange={setModules} />
          </div>

          {error && (
            <p className="text-[11px] font-bold p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
              ❌ {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border text-xs font-black hover:bg-[var(--bg-input)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
            style={{ background: 'var(--orange)' }}
          >
            {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : mode === 'create' ? '✓ Crear Usuario' : '✓ Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card de usuario ───────────────────────────────────────────────────────
function UserCard({
  user,
  currentUserId,
  onEdit,
  onDelete,
}: {
  user: TeamUser;
  currentUserId: string;
  onEdit: (u: TeamUser) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMe = user.id === currentUserId;
  const roleInfo = ROLE_COLORS[user.role] || { bg: 'bg-gray-500/10', text: 'text-gray-400', label: user.role, icon: '👤' };
  const mods = user.allowed_modules?.length ? user.allowed_modules : ROLE_DEFAULT_MODULES[user.role] || [];
  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
    >
      <div className="p-4 flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0 shadow-sm"
          style={{ background: 'var(--orange)' }}
        >
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>
              {user.name || 'Sin nombre'}
              {isMe && <span className="ml-1 text-[9px] font-bold text-emerald-500"> (Tú)</span>}
            </p>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${roleInfo.bg} ${roleInfo.text} border-current/20`}>
              {roleInfo.icon} {roleInfo.label}
            </span>
          </div>
          <p className="text-[10px] font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {user.email}
          </p>
        </div>

        {/* Acciones */}
        {!isMe && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(user)}
              className="p-1.5 rounded-lg hover:bg-sky-500/10 text-sky-400 transition-colors cursor-pointer"
              title="Editar módulos"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(user.id)}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors cursor-pointer"
              title="Eliminar acceso"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Módulos expandibles */}
      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            {mods.includes('*') ? '⭐ Acceso total' : `${mods.length} módulo${mods.length !== 1 ? 's' : ''} habilitado${mods.length !== 1 ? 's' : ''}`}
          </span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform"
            style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        </button>
        {expanded && (
          <div className="px-4 pb-3 flex flex-wrap gap-1">
            {mods.includes('*') ? (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                ⭐ Todos los módulos
              </span>
            ) : mods.map(modId => {
              const m = AVAILABLE_MODULES.find(x => x.id === modId);
              return (
                <span
                  key={modId}
                  className="text-[9px] font-bold px-2 py-0.5 rounded-md border"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  {m ? `${m.icon} ${m.label}` : modId}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal del equipo ───────────────────────────────────────
export function TeamManagementSection() {
  const { selectedTenantId } = useAppData();
  const { user } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<TeamUser | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);

  const tenantId = selectedTenantId || '';
  const isAdminOrSuper = user?.role === 'admin' || user?.role === 'super_admin';

  async function fetchTeam() {
    setLoading(true);
    try {
      const res = await fetch(`/api/users?tenant_id=${tenantId}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchTeam(); }, [tenantId]);

  async function handleDelete(userId: string) {
    if (!confirm('¿Eliminar el acceso de este usuario? Esta acción no se puede deshacer.')) return;
    setDeleting(userId);
    await fetch(`/api/users?id=${userId}`, { method: 'DELETE' });
    await fetchTeam();
    setDeleting(null);
  }

  function openCreate() {
    setEditUser(undefined);
    setShowModal(true);
  }

  function openEdit(u: TeamUser) {
    setEditUser(u);
    setShowModal(true);
  }

  // My profile card
  const myProfile = users.find(u => u.id === user?.id);
  const myRoleInfo = ROLE_COLORS[user?.role || 'operator'] || ROLE_COLORS['operator'];
  const myMods = myProfile?.allowed_modules?.length ? myProfile.allowed_modules : ROLE_DEFAULT_MODULES[user?.role || 'operator'] || [];
  const otherUsers = users.filter(u => u.id !== user?.id);

  return (
    <>
      <div
        className="card p-6 rounded-3xl xl:col-span-2 animate-fade-in-up delay-[225ms] border shadow-md space-y-6"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Shield className="h-5 w-5 text-amber-500" /> Equipo de Trabajo & Permisos Modulares
            </p>
            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Gestiona usuarios, roles y personaliza exactamente qué módulos puede ver cada persona.
            </p>
          </div>
          {isAdminOrSuper && (
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2.5 rounded-2xl text-xs font-black text-white shadow-md flex items-center gap-2 cursor-pointer transition-all hover:scale-105 shrink-0"
              style={{ background: 'var(--orange)' }}
            >
              <Plus className="w-4 h-4" /> Crear Usuario
            </button>
          )}
        </div>

        {/* Mi Perfil */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Tu Perfil</p>
          <div
            className="p-4 rounded-2xl border flex items-center gap-4"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-black text-white shadow-sm shrink-0"
              style={{ background: 'var(--orange)' }}
            >
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                  {user?.name || user?.email}
                </p>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${myRoleInfo.bg} ${myRoleInfo.text} border-current/20`}>
                  {myRoleInfo.icon} {myRoleInfo.label}
                </span>
              </div>
              <p className="text-[11px] font-medium mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {myMods.includes('*') || user?.role === 'admin' || user?.role === 'super_admin' ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    ⭐ Acceso total a todos los módulos
                  </span>
                ) : myMods.slice(0, 5).map(modId => {
                  const m = AVAILABLE_MODULES.find(x => x.id === modId);
                  return (
                    <span
                      key={modId}
                      className="text-[9px] font-bold px-2 py-0.5 rounded-md border"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {m ? `${m.icon} ${m.label}` : modId}
                    </span>
                  );
                })}
                {myMods.length > 5 && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    +{myMods.length - 5} más
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Equipo */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Miembros del equipo ({otherUsers.length})
          </p>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-[var(--orange)] border-t-transparent animate-spin" />
            </div>
          ) : otherUsers.length === 0 ? (
            <div className="text-center py-8 border rounded-2xl border-dashed" style={{ borderColor: 'var(--border)' }}>
              <p className="text-2xl mb-2">👥</p>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>No hay otros usuarios aún</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Crea un cajero, cocinero o repartidor con acceso personalizado.
              </p>
              {isAdminOrSuper && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer"
                  style={{ background: 'var(--orange)' }}
                >
                  + Crear primer usuario
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {otherUsers.map(u => (
                <UserCard
                  key={u.id}
                  user={u}
                  currentUserId={user?.id || ''}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <UserModal
          mode={editUser ? 'edit' : 'create'}
          user={editUser}
          tenantId={tenantId}
          onClose={() => { setShowModal(false); setEditUser(undefined); }}
          onSaved={fetchTeam}
        />
      )}
    </>
  );
}
