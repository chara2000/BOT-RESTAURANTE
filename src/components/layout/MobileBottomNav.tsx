'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Utensils, Package, Wallet, Menu, Truck, Settings } from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { useMobileMenu } from '@/context/MobileMenuContext';
import { useAuth } from '@/context/AuthContext';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { activeOrdersCount, lowStockCount, deliveries } = useAppData();
  const { toggle, isOpen } = useMobileMenu();

  const userRole = user?.role || 'admin';
  const activeDeliveries = deliveries.filter((d) => d.status === 'assigned' || d.status === 'searching').length;

  // Build role-adapted quick nav items
  let navItems: { label: string; href?: string; icon: any; badge?: number; alert?: boolean; isMenuToggle?: boolean }[] = [];

  if (userRole === 'kitchen') {
    navItems = [
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag, badge: activeOrdersCount },
      { label: 'Menú', href: '/menu', icon: Utensils },
      { label: 'Ajustes', href: '/configuracion', icon: Settings },
      { label: 'Más', icon: Menu, isMenuToggle: true },
    ];
  } else if (userRole === 'operator') {
    navItems = [
      { label: 'Inicio', href: '/', icon: LayoutDashboard },
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag, badge: activeOrdersCount },
      { label: 'Menú', href: '/menu', icon: Utensils },
      { label: 'Caja POS', href: '/caja', icon: Wallet },
      { label: 'Domicilios', href: '/domicilios', icon: Truck, badge: activeDeliveries },
      { label: 'Más', icon: Menu, isMenuToggle: true },
    ];
  } else {
    // Admin & Super Admin
    navItems = [
      { label: 'Inicio', href: '/', icon: LayoutDashboard },
      { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag, badge: activeOrdersCount },
      { label: 'Inventario', href: '/inventario', icon: Package, alert: lowStockCount > 0 },
      { label: 'Caja POS', href: '/caja', icon: Wallet },
      { label: 'Más', icon: Menu, isMenuToggle: true },
    ];
  }

  const isActive = (href?: string) => {
    if (!href) return false;
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[var(--bg-card)]/95 backdrop-blur-xl border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}>
      <div className="flex justify-around items-center h-14 px-1">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const active = item.isMenuToggle ? isOpen : isActive(item.href);

          if (item.isMenuToggle) {
            return (
              <button
                key={idx}
                type="button"
                onClick={toggle}
                className="flex flex-col items-center justify-center w-full h-full gap-1 group relative cursor-pointer"
              >
                {active && (
                  <span className="absolute -top-[1px] w-8 h-[2px] bg-[var(--orange)] rounded-b-full shadow-[0_0_8px_var(--orange)]" />
                )}
                <Icon
                  className={`w-5 h-5 transition-all duration-300 ${
                    active
                      ? 'text-[var(--orange)] scale-110'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={`text-[9px] font-bold tracking-wide transition-colors ${
                    active ? 'text-[var(--orange)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              className="flex flex-col items-center justify-center w-full h-full gap-1 group relative"
            >
              {active && (
                <span className="absolute -top-[1px] w-8 h-[2px] bg-[var(--orange)] rounded-b-full shadow-[0_0_8px_var(--orange)]" />
              )}
              
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-all duration-300 ${
                    active
                      ? 'text-[var(--orange)] scale-110 drop-shadow-[0_2px_8px_var(--orange-glow)]'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 h-4 min-w-4 px-1 rounded-full text-[9px] font-black text-white bg-[var(--orange)] flex items-center justify-center shadow-md animate-pulse">
                    {item.badge}
                  </span>
                ) : null}
                {item.alert ? (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                ) : null}
              </div>

              <span
                className={`text-[9px] font-bold tracking-wide transition-colors ${
                  active ? 'text-[var(--orange)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
