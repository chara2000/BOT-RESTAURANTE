'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';
import { safeLocalStorage } from '@/lib/utils/safeStorage';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (already installed as PWA)
    if (typeof window !== 'undefined') {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      if (isStandalone) {
        setInstalled(true);
        return;
      }

      // Check if user dismissed prompt in last 24h
      const dismissedAt = safeLocalStorage.getItem('chefflow_pwa_dismissed');
      if (dismissedAt) {
        const timeDiff = Date.now() - Number(dismissedAt);
        if (timeDiff < 24 * 60 * 60 * 1000) return; // 24h cooldown
      }

      // Detect iOS Safari
      const ua = window.navigator.userAgent;
      const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      setIsIOS(iosDevice);

      if (iosDevice) {
        // Show iOS banner after a short delay
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }

      // Listen for Chrome/Android/Windows PWA install prompt
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    safeLocalStorage.setItem('chefflow_pwa_dismissed', String(Date.now()));
  };

  if (!showPrompt || installed) return null;

  return (
    <>
      {/* Banner Flotante PWA */}
      <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-fade-in-up">
        <div 
          className="p-4 rounded-3xl border shadow-2xl backdrop-blur-xl space-y-3 relative overflow-hidden"
          style={{ 
            background: 'var(--bg-card)', 
            borderColor: 'var(--orange)',
            boxShadow: '0 12px 40px rgba(255, 107, 53, 0.25)' 
          }}
        >
          {/* Background Glow */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--orange)] opacity-15 blur-2xl rounded-full pointer-events-none" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--orange)] to-[#ff8a4c] flex items-center justify-center text-white shadow-lg shrink-0">
                <Smartphone className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Instalar ChefFlow POS</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                </div>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {isIOS ? 'Añádelo a tu inicio para experiencia App nativa' : 'Accede más rápido y trabaja offline'}
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ff8a4c] text-white text-xs font-black shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {isIOS ? 'Ver Instrucciones' : 'Instalar App PWA'}
            </button>
            <button
              onClick={handleDismiss}
              className="py-2.5 px-3 rounded-xl border text-[11px] font-bold transition-all hover:bg-[var(--bg-input)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>

      {/* Modal de instrucciones para iOS Safari */}
      {showIOSInstructions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-sm w-full animate-fade-in-up space-y-4 rounded-3xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Smartphone className="w-4 h-4 text-[var(--orange)]" /> Instalar en iPhone / iPad
              </p>
              <button onClick={() => setShowIOSInstructions(false)} className="text-xs font-bold text-[var(--text-muted)]">✕</button>
            </div>

            <div className="space-y-3 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              <div className="flex items-start gap-3 p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <div className="w-7 h-7 rounded-xl bg-[var(--orange)]/10 text-[var(--orange)] flex items-center justify-center font-black shrink-0">1</div>
                <div>
                  <p className="font-bold">Toca el botón Compartir</p>
                  <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    En la barra inferior de Safari <Share className="w-3.5 h-3.5 text-blue-500 inline" />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <div className="w-7 h-7 rounded-xl bg-[var(--orange)]/10 text-[var(--orange)] flex items-center justify-center font-black shrink-0">2</div>
                <div>
                  <p className="font-bold">Selecciona "Añadir a pantalla de inicio"</p>
                  <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    Busca la opción con el ícono <PlusSquare className="w-3.5 h-3.5 text-emerald-500 inline" />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <div className="w-7 h-7 rounded-xl bg-[var(--orange)]/10 text-[var(--orange)] flex items-center justify-center font-black shrink-0">3</div>
                <div>
                  <p className="font-bold">Toca "Añadir" en la esquina superior</p>
                  <p className="text-[10px] text-[var(--text-muted)]">¡Listo! Tendrás la App en tu pantalla de inicio.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIOSInstructions(false);
                setShowPrompt(false);
              }}
              className="w-full py-3 rounded-2xl bg-[var(--orange)] text-white text-xs font-black shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
