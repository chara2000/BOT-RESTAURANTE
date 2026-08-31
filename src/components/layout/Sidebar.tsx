'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ChefHat, ChevronLeft, ChevronRight } from 'lucide-react';
import { NAV_ITEMS } from '@/config/navigation';
import { useAppData } from '@/context/AppDataContext';
import { useMobileMenu } from '@/context/MobileMenuContext';
import { useAuth } from '@/context/AuthContext';

// Paths allowed per role. 'Registro Sedes' is ONLY for super_admin.
const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [
    '/', '/pedidos', '/historial', '/menu', '/inventario',
    '/caja', '/pagos', '/clientes', '/domicilios', '/repartidores',
    '/mensajes', '/ia', '/reportes', '/configuracion',
    // Explicitly exclude /registro — only super_admin gets it
  ],
  operator: ['/', '/pedidos', '/historial', '/menu', '/caja', '/pagos', '/clientes', '/domicilios'],
  kitchen: ['/pedidos'],
  delivery: ['/domicilios', '/repartidores', '/mis-pedidos', '/repartidor'],
};

export function Sidebar() {
  const pathname = usePathname();
  const { activeOrdersCount, lowStockCount, deliveries } = useAppData();
  const { isOpen, isCollapsed, toggleCollapse } = useMobileMenu();
  const { user } = useAuth();

  const userRoleStr: string = user?.role || 'admin';
  const customModules = user?.allowed_modules;
  const allowed = (customModules && customModules.length > 0)
    ? customModules
    : (ROLE_ALLOWED_PATHS[userRoleStr] || ROLE_ALLOWED_PATHS.admin);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (userRoleStr === 'super_admin') return true;
    if (item.href === '/registro') return false;
    if (allowed.includes('*')) return true;
    return allowed.includes(item.href);
  });

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Dynamic badge counts
  const activeDeliveries = deliveries.filter((d) => d.status === 'assigned' || d.status === 'searching').length;

  const getDynamicBadge = (label: string) => {
    if (label === 'Pedidos') return activeOrdersCount > 0 ? activeOrdersCount : undefined;
    if (label === 'Domicilios') return activeDeliveries > 0 ? activeDeliveries : undefined;
    return undefined;
  };

  const getShowAlert = (label: string, staticAlert?: boolean) => {
    if (label === 'Inventario') return lowStockCount > 0;
    return staticAlert;
  };

  return (
    <aside className={`sidebar fixed inset-y-0 left-0 z-50 transform transition-all duration-300 md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:flex ${isCollapsed ? 'w-[88px]' : 'w-[260px]'} flex-col justify-between shrink-0 overflow-hidden border-r shadow-2xl md:shadow-none bg-[var(--bg-sidebar)]`} style={{ borderColor: 'var(--border)' }}>
      {/* Background flare */}
      <div className="absolute top-[-50px] left-[-50px] w-32 h-32 bg-[var(--orange)] opacity-10 blur-[50px] rounded-full pointer-events-none" />
      
      <div className="p-6 space-y-8 z-10 relative flex-1 overflow-y-auto">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--orange)] to-[#ff8a4c] shadow-[0_4px_12px_var(--orange-glow)] shrink-0">
            <ChefHat className="text-white w-6 h-6" />
          </div>
          {!isCollapsed && (
            <div>
              <p className="text-lg font-black tracking-tight leading-none text-[var(--text-primary)]">ChefFlow</p>
              <span style={{ color: 'var(--orange)' }} className="text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 block">
                POS Premium
              </span>
            </div>
          )}
        </div>

        <nav className="space-y-1.5">
          {visibleNavItems.map(({ label, href, icon: Icon, alert }) => {
            const active = isActive(href);
            const dynamicBadge = getDynamicBadge(label);
            const showAlert = getShowAlert(label, alert);

            return (
              <Link key={href} href={href}
                className="group relative w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all duration-300"
                style={{
                  background: active ? 'var(--bg-card)' : 'transparent',
                  color: active ? 'var(--orange)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  border: active ? '1px solid var(--border)' : '1px solid transparent'
                }}>
                
                {active && (
                  <div className="absolute left-0 w-1 h-1/2 bg-[var(--orange)] rounded-r-full shadow-[0_0_8px_var(--orange)] top-1/2 -translate-y-1/2" />
                )}

                <Icon className={`h-5 w-5 shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'} ${isCollapsed ? 'mx-auto' : ''}`} />
                {!isCollapsed && <span className="flex-1 text-left tracking-wide whitespace-nowrap">{label}</span>}
                
                {!isCollapsed && dynamicBadge ? (
                  <span className="h-5 px-2 rounded-lg text-[10px] font-black text-white flex items-center shadow-md transition-transform group-hover:scale-105"
                        style={{ background: 'var(--orange)' }}>{dynamicBadge}</span>
                ) : null}
                {/* Collapsed badge dot */}
                {isCollapsed && dynamicBadge ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--orange)] shadow-sm" />
                ) : null}
                {(!isCollapsed && showAlert) ? <AlertTriangle className="h-4 w-4 text-amber-500 drop-shadow-sm animate-pulse" /> : null}
                {(isCollapsed && showAlert) ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button 
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
          className="w-full flex items-center justify-center p-2 rounded-xl text-sm font-black transition-colors hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--orange)] hidden md:flex cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
    </aside>
  );
}
