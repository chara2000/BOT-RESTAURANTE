'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Package, Navigation, User, Bell, Home } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function RiderLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { dark } = useTheme();
  const { user } = useAuth();

  const NAV_ITEMS = [
    { label: 'Inicio', href: '/inicio', icon: Home },
    { label: 'Disponibles', href: '/disponibles', icon: Bell },
    { label: 'Mis Pedidos', href: '/mis-pedidos', icon: Package },
    { label: 'Ruta', href: '/ruta', icon: Navigation },
    { label: 'Perfil', href: '/perfil', icon: User },
  ];

  return (
    <div className={`min-h-[100dvh] flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] ${dark ? 'dark' : ''}`}>
      
      {/* HEADER MÓVIL */}
      <header className="sticky top-0 z-40 bg-[var(--bg-card)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--orange)] text-white flex items-center justify-center font-black">
            {user?.name?.[0]?.toUpperCase() ?? 'R'}
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">ChefFlow Rider</p>
            <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Conectado
            </p>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL (SCROLLABLE) */}
      <main className="flex-1 overflow-y-auto relative" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </main>

      {/* BARRA DE NAVEGACIÓN INFERIOR (PWA STYLE) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-card)]/95 backdrop-blur-xl border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}>
        <div className="flex justify-around items-center h-14">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center w-full h-full gap-1 group relative"
              >
                {isActive && (
                  <span className="absolute -top-[1px] w-8 h-[2px] bg-[var(--orange)] rounded-b-full"></span>
                )}
                <Icon
                  className={`w-5 h-5 transition-all duration-300 ${
                    isActive
                      ? 'text-[var(--orange)] drop-shadow-[0_2px_8px_var(--orange-glow)] scale-110'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={`text-[9px] font-bold tracking-wide transition-colors ${
                    isActive ? 'text-[var(--orange)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
