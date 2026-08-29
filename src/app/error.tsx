'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ChefFlow Error Boundary]:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
      <div className="max-w-md w-full p-8 rounded-3xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-xl shadow-2xl text-center space-y-6 animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(244,63,94,0.2)]">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-neutral-100">Algo no salió como esperábamos</h2>
          <p className="text-xs font-medium text-neutral-400 leading-relaxed">
            Ocurrió un error inesperado al procesar la solicitud. Nuestro equipo técnico ha sido notificado.
          </p>
          {error.message && (
            <p className="text-[11px] font-mono p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-rose-400/90 text-left overflow-x-auto">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-black text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-500/20"
          >
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
          <Link
            href="/"
            className="flex-1 py-3 px-4 rounded-xl text-xs font-black text-neutral-300 bg-neutral-800 hover:bg-neutral-700 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" /> Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
