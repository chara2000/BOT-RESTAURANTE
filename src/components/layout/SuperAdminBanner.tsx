'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAppData } from '@/context/AppDataContext';
import { Building2, Store, LogOut, Settings, RefreshCw, ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';

export function SuperAdminBanner() {
  const { user } = useAuth();
  const { selectedTenantId, setSelectedTenantId, allTenants } = useAppData();
  const [showSelectorModal, setShowSelectorModal] = useState(false);

  // Only super_admin can see the tenant switcher — regular admin is locked to their restaurant
  const isSuperAdmin = user?.role === 'super_admin';
  if (!isSuperAdmin) return null;

  const currentTenant = allTenants.find((t) => t.id === selectedTenantId);

  return (
    <>
      {/* Full Top Banner - Color Naranja con Letras Blancas */}
      <div className="w-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-md z-30 border-b border-orange-400/40 relative">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-amber-200 border border-white/20 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
            <span>SUPER ADMIN</span>
          </div>

          <div className="flex items-center gap-2 min-w-0 font-bold text-xs">
            {currentTenant ? (
              <>
                <span className="opacity-90 flex items-center gap-1 shrink-0">
                  <Store className="w-4 h-4 text-white" />
                  <span className="hidden sm:inline">Restaurante Activo:</span>
                </span>
                <span className="font-black text-white bg-white/20 px-2.5 py-0.5 rounded-md truncate max-w-[200px] sm:max-w-[300px]">
                  {currentTenant.name}
                </span>
                <span className="text-[10px] uppercase font-extrabold bg-emerald-400/20 text-emerald-100 px-2 py-0.5 rounded border border-emerald-300/30 shrink-0">
                  {currentTenant.plan_type || 'PRO'}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-2 text-white animate-pulse">
                <Zap className="w-4 h-4 text-yellow-300" />
                <span className="font-black">⚠️ SIN RESTAURANTE SELECCIONADO</span>
                <span className="hidden md:inline text-[11px] text-orange-100 font-medium">
                  (Selecciona una sede para habilitar los módulos)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Acciones Rápidas del Super Admin */}
        <div className="flex items-center gap-2 shrink-0 text-xs font-black">
          <button
            type="button"
            onClick={() => setShowSelectorModal(true)}
            aria-label="Cambiar restaurante seleccionado"
            className="flex items-center gap-1.5 bg-white text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{currentTenant ? 'Cambiar Restaurante' : 'Loguéate en un Restaurante'}</span>
          </button>

          <Link
            href="/registro"
            className="hidden sm:flex items-center gap-1.5 bg-black/20 hover:bg-black/30 text-white px-3 py-1.5 rounded-xl border border-white/20 transition-all active:scale-95"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Gestión Restaurantes</span>
          </Link>

          {currentTenant && (
            <>
              <Link
                href="/configuracion"
                className="hidden lg:flex items-center gap-1.5 bg-black/20 hover:bg-black/30 text-white px-3 py-1.5 rounded-xl border border-white/20 transition-all active:scale-95"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Ajustes</span>
              </Link>

              <button
                type="button"
                onClick={() => setSelectedTenantId(null)}
                aria-label="Desloguearme de esta sede"
                title="Desloguearme de esta sede"
                className="flex items-center gap-1.5 bg-red-600/90 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Salir Sede</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modal Selector de Restaurantes */}
      {showSelectorModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-lg w-full animate-fade-in-up space-y-4">
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Building2 className="w-5 h-5 text-[var(--orange)]" /> Conmutador de Restaurantes
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Selecciona la sede que deseas administrar en este momento
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectorModal(false)}
                aria-label="Cerrar modal de selección de restaurante"
                className="text-sm font-bold text-[var(--text-muted)] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {allTenants.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTenantId(t.id);
                    setShowSelectorModal(false);
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left font-black text-xs transition-all cursor-pointer ${
                    t.id === selectedTenantId
                      ? 'border-[var(--orange)] bg-[var(--orange)]/10 shadow-md'
                      : 'hover:border-[var(--orange)] hover:bg-[var(--bg-input)]'
                  }`}
                  style={{ borderColor: t.id === selectedTenantId ? 'var(--orange)' : 'var(--border)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--orange)]/10 text-[var(--orange)] flex items-center justify-center font-black shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                      <p className="text-[11px] font-bold text-[var(--text-muted)] truncate">
                        app.chefflow.com/{t.subdomain}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.id === selectedTenantId ? (
                      <span className="text-[10px] font-black uppercase text-white bg-[var(--orange)] px-2.5 py-1 rounded-lg">
                        Activo
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-emerald-500 hover:text-white transition-all">
                        Ingresar <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <Link
                href="/registro"
                onClick={() => setShowSelectorModal(false)}
                className="text-xs font-black text-[var(--orange)] hover:underline flex items-center gap-1"
              >
                + Registrar Nuevo Restaurante
              </Link>

              {selectedTenantId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTenantId(null);
                    setShowSelectorModal(false);
                  }}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  Desloguearse de Sede
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
