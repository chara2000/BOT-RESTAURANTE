'use client';

import { useState, useEffect } from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md border text-xs font-black animate-fade-in-up transition-all ${
        isOnline
          ? 'bg-emerald-500/90 text-white border-emerald-400/50'
          : 'bg-rose-600/95 text-white border-rose-400/50 shadow-[0_0_20px_rgba(225,29,72,0.4)]'
      }`}
    >
      {isOnline ? (
        <>
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>Conexión restablecida. Sincronizando datos...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-rose-200 animate-pulse shrink-0" />
          <span>Sin conexión a Internet. Los cambios se guardarán al reconectar.</span>
        </>
      )}
    </div>
  );
}
