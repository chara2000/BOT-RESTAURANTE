'use client';

import { Bell, Moon, Search, Sun, Menu } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useMobileMenu } from '@/context/MobileMenuContext';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle = 'Visión general de tu restaurante' }: TopbarProps) {
  const { dark, toggle: toggleTheme } = useTheme();
  const { toggle: toggleMenu } = useMobileMenu();

  return (
    <header className="shrink-0 px-5 lg:px-8 py-4 lg:py-5 flex items-center justify-between gap-4 sticky top-0 z-30 glass"
            style={{ borderBottom: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
      
      <div className="flex items-center gap-4">
        {/* Mobile Hamburger Menu */}
        <button 
          onClick={toggleMenu}
          className="md:hidden p-2.5 rounded-xl border transition-all active:scale-95"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="hidden sm:block">
          <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">{title}</h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-[11px] lg:text-xs font-bold mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="relative flex-1 max-w-md hidden lg:block group ml-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors group-focus-within:text-[var(--orange)]"
                style={{ color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Buscar platillos, órdenes, clientes..."
          className="w-full text-[13px] font-semibold pl-11 pr-4 py-2.5 lg:py-3 rounded-2xl border transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[var(--orange-soft)] shadow-sm focus:shadow-md"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="hidden xl:inline-flex items-center justify-center px-2 py-1 text-[10px] font-black rounded-lg border bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>⌘K</kbd>
          </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0">
        {/* Theme Toggle in Topbar */}
        <button onClick={toggleTheme}
          className="p-2.5 lg:p-3 rounded-xl border shadow-sm transition-transform hover:scale-105 active:scale-95"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {dark ? <Sun className="h-4.5 w-4.5 text-amber-400" /> : <Moon className="h-4.5 w-4.5 text-indigo-400" />}
        </button>
        
        <button className="p-2.5 lg:p-3 rounded-xl border relative shadow-sm transition-all hover:scale-105 active:scale-95 hover:border-[var(--orange)] group"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <Bell className="h-4.5 w-4.5 group-hover:text-[var(--orange)] transition-colors" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full shadow-[0_0_8px_var(--orange)]"
                style={{ background: 'var(--orange)' }} />
        </button>

        <div className="h-8 w-px bg-[var(--border)] hidden sm:block mx-1 lg:mx-2" />

        <div className="flex items-center gap-3 cursor-pointer group pl-1">
          <div className="text-right hidden sm:block transition-transform group-hover:-translate-x-1">
            <p className="text-xs lg:text-[13px] font-black text-[var(--text-primary)]">Orlando L.</p>
            <span style={{ color: 'var(--orange)' }} className="text-[9px] lg:text-[10px] font-black uppercase tracking-wider">Super Admin</span>
          </div>
          <div className="h-9 w-9 lg:h-10 lg:w-10 rounded-2xl overflow-hidden ring-2 ring-[var(--orange)] ring-offset-2 ring-offset-[var(--bg-app)] shadow-md transition-transform group-hover:scale-105">
            <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80"
                 alt="avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </header>
  );
}
