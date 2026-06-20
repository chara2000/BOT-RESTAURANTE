'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ChefHat } from 'lucide-react';
import { NAV_ITEMS } from '@/config/navigation';
import { useAppData } from '@/context/AppDataContext';
import { useMobileMenu } from '@/context/MobileMenuContext';

export function Sidebar() {
  const pathname = usePathname();
  const { activeOrdersCount, lowStockCount } = useAppData();
  const { isOpen } = useMobileMenu();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className={`sidebar fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:flex w-[260px] flex-col justify-between shrink-0 overflow-hidden border-r shadow-2xl md:shadow-none`} style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
      {/* Background flare */}
      <div className="absolute top-[-50px] left-[-50px] w-32 h-32 bg-[var(--orange)] opacity-10 blur-[50px] rounded-full pointer-events-none" />
      
      <div className="p-6 space-y-8 z-10 relative flex-1 overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--orange)] to-[#ff8a4c] shadow-[0_4px_12px_var(--orange-glow)] shrink-0">
            <ChefHat className="text-white w-6 h-6" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight leading-none text-[var(--text-primary)]">ChefFlow</p>
            <span style={{ color: 'var(--orange)' }} className="text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 block">
              POS Premium
            </span>
          </div>
        </div>

        <nav className="space-y-1.5">
          {NAV_ITEMS.map(({ label, href, icon: Icon, badge, alert }) => {
            const active = isActive(href);
            const dynamicBadge = label === 'Pedidos' ? activeOrdersCount : badge;
            const showAlert = label === 'Inventario' ? lowStockCount > 0 : alert;

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

                <Icon className={`h-5 w-5 shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="flex-1 text-left tracking-wide">{label}</span>
                
                {dynamicBadge ? (
                  <span className="h-5 px-2 rounded-lg text-[10px] font-black text-white flex items-center shadow-md transition-transform group-hover:scale-105"
                        style={{ background: 'var(--orange)' }}>{dynamicBadge}</span>
                ) : null}
                {showAlert ? <AlertTriangle className="h-4 w-4 text-amber-500 drop-shadow-sm animate-pulse" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
