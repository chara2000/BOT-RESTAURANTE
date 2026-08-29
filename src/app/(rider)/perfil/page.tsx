'use client';

import { User, Star, Package, Phone, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDeliveries } from '@/hooks/useOrders';

export default function RiderProfilePage() {
  const { user, signOut } = useAuth();
  const { deliveries } = useDeliveries();

  const delivered = deliveries.filter(d => d.status === 'delivered').length;

  return (
    <div className="p-5 space-y-5">
      {/* Avatar & Name */}
      <div className="bg-gradient-to-br from-[var(--orange)] to-[#ff6b2b] rounded-3xl p-6 text-white text-center relative overflow-hidden shadow-[0_8px_24px_var(--orange-glow)]">
        <div className="absolute -bottom-12 -left-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 text-3xl font-black border-2 border-white/30 relative z-10">
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <h2 className="text-xl font-black relative z-10">{user?.name ?? 'Repartidor'}</h2>
        <p className="text-sm font-bold opacity-75 mt-1 relative z-10">{user?.email}</p>
        <div className="flex items-center justify-center gap-1.5 mt-3 relative z-10">
          <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
          <span className="font-black text-sm">4.9</span>
          <span className="opacity-60 text-sm">· Excelente</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Entregados', value: delivered, icon: Package },
          { label: 'Calificación', value: '4.9 ★', icon: Star },
          { label: 'Teléfono', value: 'N/A', icon: Phone },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3 text-center">
              <Icon className="w-5 h-5 mx-auto mb-1 text-[var(--orange)]" />
              <p className="text-base font-black text-[var(--text-primary)]">{item.value}</p>
              <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wide">{item.label}</p>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Datos del perfil</p>
        {[
          { label: 'Nombre', value: user?.name ?? '—' },
          { label: 'Correo', value: user?.email ?? '—' },
          { label: 'Rol', value: 'Repartidor' },
        ].map((item, i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-none">
            <span className="text-xs font-bold text-[var(--text-muted)]">{item.label}</span>
            <span className="text-xs font-black text-[var(--text-primary)]">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-500/30 text-red-500 bg-red-500/5 text-sm font-black transition-colors active:bg-red-500/10"
      >
        <LogOut className="w-4 h-4" />
        Cerrar Sesión
      </button>
    </div>
  );
}
