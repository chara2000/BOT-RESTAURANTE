'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Moon, Search, Sun, Menu, LogOut, User, ChevronDown, CheckCircle } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useMobileMenu } from '@/context/MobileMenuContext';
import { useAuth } from '@/context/AuthContext';
import { useAppData } from '@/context/AppDataContext';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  operator: 'Operador',
  kitchen: 'Cocina',
  delivery: 'Repartidor',
};

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle = 'Visión general de tu restaurante' }: TopbarProps) {
  const { dark, toggle: toggleTheme } = useTheme();
  const { toggle: toggleMenu } = useMobileMenu();
  const { user, signOut } = useAuth();
  const { orders } = useAppData();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [seenOrders, setSeenOrders] = useState<Set<string>>(new Set());

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Recent pending orders as notifications
  const pendingOrders = orders
    .filter((o) => o.status === 'pending')
    .slice(0, 5);

  const unreadCount = pendingOrders.filter((o) => !seenOrders.has(o.id)).length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAllSeen = () => {
    setSeenOrders(new Set(pendingOrders.map((o) => o.id)));
  };

  const displayName = user?.name ?? 'Usuario';
  const displayRole = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : 'Operador';
  const initials = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header
      className="shrink-0 px-5 lg:px-8 py-4 lg:py-5 flex items-center justify-between gap-4 sticky top-0 z-30 glass"
      style={{ borderBottom: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={toggleMenu}
          className="md:hidden p-2.5 rounded-xl border transition-all active:scale-95"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:block">
          <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">{title}</h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-[11px] lg:text-xs font-bold mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="relative flex-1 max-w-md hidden lg:block group ml-4">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors group-focus-within:text-[var(--orange)]"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          placeholder="Buscar platillos, órdenes, clientes..."
          className="w-full text-[13px] font-semibold pl-11 pr-4 py-2.5 lg:py-3 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[var(--orange-soft)] shadow-sm focus:shadow-md"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <kbd
            className="hidden xl:inline-flex items-center justify-center px-2 py-1 text-[10px] font-black rounded-lg border bg-[var(--bg-input)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 lg:p-3 rounded-xl border shadow-sm transition-transform hover:scale-105 active:scale-95"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); markAllSeen(); }}
            className="p-2.5 lg:p-3 rounded-xl border relative shadow-sm transition-all hover:scale-105 active:scale-95 hover:border-[var(--orange)] group"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <Bell className="h-4 w-4 group-hover:text-[var(--orange)] transition-colors" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-black text-white shadow-[0_0_8px_var(--orange)]"
                style={{ background: 'var(--orange)' }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              className="absolute right-0 top-full mt-2 w-80 rounded-2xl border shadow-2xl overflow-hidden z-50 animate-fade-in-up"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-black">Notificaciones</p>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg" style={{ background: 'var(--orange)', color: '#fff' }}>
                  {pendingOrders.length} nuevos
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {pendingOrders.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Sin pedidos pendientes</p>
                  </div>
                ) : (
                  pendingOrders.map((o) => {
                    const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
                    return (
                      <div key={o.id} className="px-4 py-3 border-b hover:bg-[var(--bg-input)] transition-colors cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black" style={{ color: 'var(--orange)' }}>{shortId}</p>
                          <span className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            {new Date(o.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>
                          {o.customer?.name ?? 'Cliente Mostrador'} · {o.items.length} producto(s)
                        </p>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>Nuevo pedido pendiente</p>
                      </div>
                    );
                  })
                )}
              </div>
              <a href="/pedidos" className="block px-4 py-3 text-center text-xs font-black transition-colors hover:bg-[var(--bg-input)]" style={{ color: 'var(--orange)' }}>
                Ver todos los pedidos →
              </a>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-[var(--border)] hidden sm:block mx-1 lg:mx-2" />

        {/* User Menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 cursor-pointer group pl-1"
          >
            <div className="text-right hidden sm:block transition-transform group-hover:-translate-x-0.5">
              <p className="text-xs lg:text-[13px] font-black text-[var(--text-primary)]">{displayName}</p>
              <span style={{ color: 'var(--orange)' }} className="text-[9px] lg:text-[10px] font-black uppercase tracking-wider">
                {displayRole}
              </span>
            </div>
            <div
              className="h-9 w-9 lg:h-10 lg:w-10 rounded-2xl overflow-hidden ring-2 ring-[var(--orange)] ring-offset-2 ring-offset-[var(--bg-app)] shadow-md transition-transform group-hover:scale-105 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--orange) 0%, #ff8a4c 100%)' }}
            >
              <span className="text-white font-black text-sm">{initials}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 hidden sm:block" style={{ color: 'var(--text-muted)' }} />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-2xl border shadow-2xl overflow-hidden z-50 animate-fade-in-up"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-black truncate">{displayName}</p>
                <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{user?.email ?? ''}</p>
              </div>
              <a
                href="/configuracion"
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-[var(--bg-input)]"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => setShowUserMenu(false)}
              >
                <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                Mi Perfil
              </a>
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-rose-500/10 w-full text-left"
                style={{ color: '#f87171' }}
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
