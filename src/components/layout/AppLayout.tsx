'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileMenuProvider, useMobileMenu } from '@/context/MobileMenuContext';
import { useAuth } from '@/context/AuthContext';

import { useState } from 'react';
import { useAppData } from '@/context/AppDataContext';
import { Topbar } from './Topbar';
import { SuperAdminBanner } from './SuperAdminBanner';
import { Store, Building2, Lock, ChefHat } from 'lucide-react';

function NoTenantBlockedScreen() {
  const { allTenants, setSelectedTenantId } = useAppData();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <Topbar title="ChefFlow SaaS" subtitle="Selección de restaurante requerida" />
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 text-center z-10 relative">
        <div className="w-24 h-24 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[var(--orange)] mb-6 shadow-[0_8px_30px_rgba(255,107,53,0.15)] animate-pulse">
          <Store className="w-12 h-12" />
        </div>

        <h2 className="text-2xl lg:text-3xl font-black text-[var(--text-primary)] tracking-tight">
          Por favor, loguéate en un restaurante para gestionar
        </h2>
        <p className="text-xs lg:text-sm font-semibold text-[var(--text-muted)] max-w-md mt-3 leading-relaxed">
          Actualmente no hay ninguna sede o restaurante activo seleccionado. Selecciona una sede para habilitar los módulos de Pedidos, Menú, Caja e Inventario.
        </p>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-8 px-8 py-4 rounded-2xl bg-[var(--orange)] text-white text-xs font-black shadow-[0_8px_25px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 cursor-pointer"
        >
          <Building2 className="w-5 h-5" />
          Loguéate en un Restaurante
        </button>

        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="card p-6 max-w-md w-full animate-fade-in-up space-y-4">
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-black flex items-center gap-2">
                  <Store className="w-4 h-4 text-[var(--orange)]" /> Selecciona un Restaurante
                </p>
                <button type="button" onClick={() => setShowModal(false)} className="text-xs font-bold text-[var(--text-muted)]">✕</button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {allTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTenantId(t.id);
                      setShowModal(false);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border text-left font-black text-xs transition-all hover:border-[var(--orange)] hover:bg-[var(--bg-input)] cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-[var(--orange)] shrink-0" />
                      <div>
                        <p style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                        <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>app.chefflow.com/{t.subdomain}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Ingresar</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { usePathname } from 'next/navigation';
import { MobileBottomNav } from './MobileBottomNav';
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isOpen, setIsOpen } = useMobileMenu();
  const { selectedTenantId } = useAppData();
  const pathname = usePathname();

  const isBypassedRoute = pathname === '/registro';

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden relative"
         style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>

      {/* Super Admin Full Top Bar */}
      <SuperAdminBanner />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Fondo oscuro al abrir el menú en móviles */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
            onClick={() => setIsOpen(false)}
          />
        )}

        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden w-full relative z-0 md:pb-0" style={{ paddingBottom: 'max(calc(4.5rem + env(safe-area-inset-bottom, 0px)), 80px)' }}>
          {(selectedTenantId || isBypassedRoute) ? children : <NoTenantBlockedScreen />}
        </main>
      </div>

      {/* Universal PWA Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  // Grace period — prevents a flash redirect between isLoading→false and user being set
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => setGrace(false), 200);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || grace) return;

    // Not authenticated → go to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // Repartidor → their own PWA, not the admin dashboard
    if (user.role === 'delivery') {
      router.replace('/inicio');
    }
  }, [user, isLoading, grace, router]);

  if (isLoading || (grace && !user)) {
    return (
      <div className="flex h-screen w-full items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg-app)' }}>
        {/* Glowing ambient backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[var(--orange)] opacity-5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-amber-500 opacity-5 blur-[120px] pointer-events-none" />
        
        <div className="flex flex-col items-center gap-6 text-center p-6 max-w-xs z-10">
          <div className="relative flex items-center justify-center w-24 h-24">
            {/* Ambient pulsing glow */}
            <div className="absolute inset-0 rounded-full border border-[var(--orange)]/20 animate-ping opacity-75" style={{ animationDuration: '3s' }} />
            
            {/* Spinning gradient ring */}
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--orange)] border-r-[var(--orange)]/30 animate-spin" style={{ animationDuration: '1.2s' }} />
            
            {/* Inner badge with logo */}
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[var(--orange)] to-amber-500 flex items-center justify-center shadow-[0_10px_30px_var(--orange-glow)] transform transition-transform duration-300">
              <ChefHat className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-wider text-[var(--text-primary)]">ChefFlow</h3>
            <p className="text-xs font-bold text-[var(--text-muted)] tracking-wider animate-pulse">Verificando acceso...</p>
          </div>
        </div>
      </div>
    );
  }

  // Repartidor or unauthenticated → don't render dashboard (redirect already queued)
  if (!user || user.role === 'delivery') {
    return null;
  }

  return (
    <MobileMenuProvider>
      <LayoutContent>{children}</LayoutContent>
    </MobileMenuProvider>
  );
}

