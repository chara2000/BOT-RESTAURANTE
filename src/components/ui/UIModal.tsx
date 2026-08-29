'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, HelpCircle, X, ShieldAlert } from 'lucide-react';

interface AlertOptions {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  confirmText?: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface UIModalContextValue {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const UIModalContext = createContext<UIModalContextValue | null>(null);

export function UIModalProvider({ children }: { children: ReactNode }) {
  // Alert State
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    confirmText: string;
    resolve?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: 'Entendido',
  });

  // Confirm State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDanger: boolean;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    isDanger: false,
  });

  const showAlert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
      setAlertState({
        isOpen: true,
        title: opts.title || (opts.type === 'error' ? 'Atención' : opts.type === 'success' ? 'Éxito' : 'Información'),
        message: opts.message,
        type: opts.type || 'info',
        confirmText: opts.confirmText || 'Entendido',
        resolve,
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
      setConfirmState({
        isOpen: true,
        title: opts.title || '¿Confirmar acción?',
        message: opts.message,
        confirmText: opts.confirmText || 'Confirmar',
        cancelText: opts.cancelText || 'Cancelar',
        isDanger: opts.isDanger ?? true,
        resolve,
      });
    });
  }, []);

  const handleAlertClose = () => {
    alertState.resolve?.();
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleConfirmAction = (value: boolean) => {
    confirmState.resolve?.(value);
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <UIModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* ALERT MODAL */}
      {alertState.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="card p-6 max-w-sm w-full animate-fade-in-up space-y-4 text-center border shadow-2xl" style={{ borderColor: 'var(--border)' }}>
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-md shrink-0 border"
                 style={{
                   background: alertState.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : alertState.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 107, 53, 0.1)',
                   borderColor: alertState.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : alertState.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 107, 53, 0.3)',
                 }}>
              {alertState.type === 'error' && <AlertCircle className="w-7 h-7 text-rose-500" />}
              {alertState.type === 'success' && <CheckCircle2 className="w-7 h-7 text-emerald-500" />}
              {alertState.type === 'warning' && <ShieldAlert className="w-7 h-7 text-amber-500" />}
              {alertState.type === 'info' && <Info className="w-7 h-7 text-[var(--orange)]" />}
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>{alertState.title}</h3>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-muted)' }}>{alertState.message}</p>
            </div>

            <button
              type="button"
              onClick={handleAlertClose}
              className="w-full py-3 rounded-xl text-white font-black text-xs transition-all hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer"
              style={{ background: 'var(--orange)' }}
            >
              {alertState.confirmText}
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="card p-6 max-w-sm w-full animate-fade-in-up space-y-4 text-center border shadow-2xl" style={{ borderColor: 'var(--border)' }}>
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-md shrink-0 border bg-orange-500/10 border-orange-500/30 text-[var(--orange)]">
              <HelpCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>{confirmState.title}</h3>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-muted)' }}>{confirmState.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmAction(false)}
                className="py-3 rounded-xl border text-xs font-bold transition-all hover:bg-[var(--bg-input)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {confirmState.cancelText}
              </button>

              <button
                type="button"
                onClick={() => handleConfirmAction(true)}
                className={`py-3 rounded-xl text-white text-xs font-black transition-all hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer ${
                  confirmState.isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[var(--orange)]'
                }`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIModalContext.Provider>
  );
}

export function useUIModal() {
  const ctx = useContext(UIModalContext);
  if (!ctx) throw new Error('useUIModal must be used within UIModalProvider');
  return ctx;
}
