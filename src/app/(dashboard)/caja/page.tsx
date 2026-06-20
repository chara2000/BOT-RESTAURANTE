'use client';

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet, History, AlertCircle, ShoppingCart, Calculator } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { PosSalePanel } from '@/components/pos/PosSalePanel';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';

export default function CajaPage() {
  const { cashSession, addCashTransaction, openCashRegister, closeCashRegister } = useAppData();
  const [activeTab, setActiveTab] = useState<'pos' | 'admin'>('pos');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [openBalance, setOpenBalance] = useState('150000');
  const [closeCash, setCloseCash] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const income = cashSession.transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const expense = cashSession.transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const expected = cashSession.opening_balance + income - expense;
  const isOpen = cashSession.status === 'open';

  const handleTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || !txDesc) return;
    try {
      await addCashTransaction(txType, Number(txAmount), txDesc);
      setTxAmount('');
      setTxDesc('');
      setMessage('Movimiento guardado exitosamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--orange)] opacity-[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      
      <Topbar title="Punto de Venta (POS)" subtitle="Facturación rápida, control de caja y movimientos" />
      
      <div className="flex-1 flex flex-col overflow-y-auto z-10 relative">
        {/* Header con Estados y Tabs */}
        <div className="px-5 lg:px-8 pt-5 lg:pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up border-b pb-6" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-input)] border shadow-inner" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-300 ${activeTab === 'pos' ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'}`}
            >
              <ShoppingCart className="h-4 w-4" /> Terminal POS
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-300 ${activeTab === 'admin' ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'}`}
            >
              <Calculator className="h-4 w-4" /> Gestión de Caja
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className={`flex items-center gap-2.5 px-5 py-2.5 rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.08)] border backdrop-blur-sm transition-all ${isOpen ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
              <div className="relative flex h-3 w-3">
                {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest">{isOpen ? 'Caja Abierta' : 'Caja Cerrada'}</span>
              {isOpen ? <Unlock className="h-4 w-4 ml-1" /> : <Lock className="h-4 w-4 ml-1" />}
            </div>
            
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border bg-[var(--bg-card)] shadow-sm hidden md:flex" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sesión:</span>
              <span className="text-xs font-black text-[var(--text-primary)] font-mono">{cashSession.id.substring(0, 8)}</span>
              <span className="text-[10px] text-[var(--text-muted)] mx-1">•</span>
              <span className="text-xs font-black text-[var(--orange)]">{cashSession.opened_by}</span>
            </div>
          </div>
        </div>

        {/* Notificaciones globales */}
        {message && (
          <div className="px-5 lg:px-8 mt-6">
            <div className={`flex items-center gap-3 p-4 rounded-2xl border backdrop-blur-md animate-fade-in-up shadow-lg ${message.includes('guardado') || message.includes('Caja') || message.includes('exitosamente') ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-bold text-sm">{message}</p>
            </div>
          </div>
        )}

        <div className="p-5 lg:p-8 w-full">
          {/* TAB: TERMINAL POS */}
          {activeTab === 'pos' && (
            <div className="animate-fade-in-up w-full max-w-7xl mx-auto">
              <PosSalePanel />
            </div>
          )}

          {/* TAB: GESTIÓN DE CAJA */}
          {activeTab === 'admin' && (
            <div className="animate-fade-in-up space-y-8 max-w-7xl mx-auto w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard title="Saldo Base Inicial" value={formatCurrency(cashSession.opening_balance)} change="Apertura" up emoji="💰" />
                <StatCard title="Ingresos Netos" value={formatCompact(income)} change={`${cashSession.transactions.filter((t) => t.type === 'income').length} movimientos`} up emoji="📈" />
                <StatCard title="Egresos Totales" value={formatCompact(expense)} change={`${cashSession.transactions.filter((t) => t.type === 'expense').length} movimientos`} up={false} emoji="📉" />
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--orange)] to-amber-500 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity blur duration-500" />
                  <div className="relative h-full">
                    <StatCard title="Saldo Esperado en Caja" value={formatCurrency(expected)} change="Arqueo teórico" up emoji="🏦" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Columna Izquierda: Historial */}
                <div className="xl:col-span-2">
                  <div className="card overflow-hidden flex flex-col bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-input)] shadow-xl h-full">
                    <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-slate-800 text-white shadow-lg">
                          <History className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-black text-sm text-[var(--text-primary)]">Historial de Movimientos</h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sesión actual</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="divide-y max-h-[500px] overflow-y-auto custom-scrollbar" style={{ borderColor: 'var(--border)' }}>
                      {cashSession.transactions.slice(0, 10).map((t) => (
                        <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--bg-card)] transition-all duration-300 group">
                          <div className={`p-3 rounded-2xl border shadow-sm transition-transform group-hover:scale-110 group-hover:rotate-3 ${t.type === 'income' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white border-emerald-500 shadow-emerald-500/30' : 'bg-gradient-to-br from-rose-400 to-rose-600 text-white border-rose-500 shadow-rose-500/30'}`}>
                            {t.type === 'income' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-black text-[var(--text-primary)] group-hover:text-[var(--orange)] transition-colors">{t.description}</p>
                            <p className="text-[10px] font-bold mt-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                              {new Date(t.created_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`text-base font-black tracking-tight ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                            </span>
                            <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-[var(--text-muted)]">
                              {t.type === 'income' ? 'Ingreso' : 'Egreso'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {cashSession.transactions.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                          <History className="h-12 w-12 mb-4" style={{ color: 'var(--text-muted)' }} />
                          <p className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>No hay movimientos registrados en esta sesión.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Acciones Administrativas */}
                <div className="space-y-6">
                  {isOpen ? (
                    <>
                      <form onSubmit={handleTx} className="card p-6 space-y-5 bg-[var(--bg-card)] shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--orange)] opacity-5 blur-[50px] rounded-full" />
                        
                        <div className="flex items-center gap-3 border-b pb-4 relative z-10" style={{ borderColor: 'var(--border)' }}>
                          <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--orange)] to-orange-500 text-white shadow-lg">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-[var(--text-primary)]">Registrar Movimiento</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ingresos o Gastos Extra</p>
                          </div>
                        </div>

                        <div className="flex gap-3 relative z-10">
                          {(['income', 'expense'] as const).map((t) => (
                            <button key={t} type="button" onClick={() => setTxType(t)}
                              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all duration-300 border ${txType === t ? (t === 'income' ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_8px_20px_rgba(16,185,129,0.3)]' : 'bg-rose-500 text-white border-rose-400 shadow-[0_8px_20px_rgba(244,63,94,0.3)]') : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-transparent hover:border-[var(--border)]'}`}>
                              {t === 'income' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                              <span className="text-[11px] font-black uppercase tracking-wider">{t === 'income' ? 'Ingreso' : 'Egreso'}</span>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-4 relative z-10">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color: 'var(--text-muted)' }}>$</span>
                            <input value={txAmount} onChange={(e) => setTxAmount(e.target.value)} type="number" placeholder="Monto"
                              className="w-full text-sm font-bold pl-8 pr-4 py-3.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] bg-[var(--bg-input)] transition-all" style={{ borderColor: 'var(--border)' }} />
                          </div>
                          <input value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="Concepto (ej. Pago a proveedor)"
                            className="w-full text-sm font-bold px-4 py-3.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] bg-[var(--bg-input)] transition-all" style={{ borderColor: 'var(--border)' }} />
                          <button type="submit" className="w-full text-sm font-black py-4 rounded-xl text-white shadow-[0_8px_20px_var(--orange-glow)] hover:scale-[1.02] active:scale-95 transition-all overflow-hidden relative group/btn" style={{ background: 'var(--orange)' }}>
                            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                            Guardar Movimiento
                          </button>
                        </div>
                      </form>

                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await closeCashRegister(Number(closeCash));
                          setMessage('Cierre de caja realizado exitosamente.');
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : 'Error en cierre de caja.');
                        }
                      }}
                        className="card p-6 space-y-5 border-rose-500/20 shadow-xl bg-gradient-to-b from-[var(--bg-card)] to-rose-500/5">
                        <div className="flex items-center gap-3 border-b border-rose-500/10 pb-4">
                          <div className="p-2 rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                            <Lock className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-[var(--text-primary)]">Cierre de Jornada</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Bloquear e imprimir arqueo</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-rose-400">$</span>
                            <input value={closeCash} onChange={(e) => setCloseCash(e.target.value)} type="number" placeholder="Efectivo físico real en caja"
                              className="w-full text-sm font-bold pl-8 pr-4 py-3.5 rounded-xl border border-rose-200 dark:border-rose-900/30 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-[var(--bg-input)] transition-all" />
                          </div>
                          <button type="submit" className="w-full text-sm font-black py-4 rounded-xl border border-rose-500 text-white bg-rose-500 shadow-[0_8px_20px_rgba(244,63,94,0.3)] hover:bg-rose-600 transition-all active:scale-95">
                            Procesar Arqueo y Cerrar
                          </button>
                          
                          {cashSession.difference !== undefined && (
                            <div className={`p-4 rounded-2xl border text-sm font-black flex items-center justify-between shadow-inner ${cashSession.difference >= 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                              <span>Diferencia de Arqueo:</span>
                              <span>{formatCurrency(cashSession.difference)}</span>
                            </div>
                          )}
                        </div>
                      </form>
                    </>
                  ) : (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await openCashRegister(Number(openBalance), 'Orlando Laurentius');
                        setMessage('Caja abierta exitosamente.');
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : 'Error al abrir caja.');
                      }
                    }}
                      className="card p-6 space-y-5 border-emerald-500/20 shadow-xl bg-gradient-to-b from-[var(--bg-card)] to-emerald-500/5">
                      <div className="flex items-center gap-3 border-b border-emerald-500/10 pb-4">
                        <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                          <Unlock className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-[var(--text-primary)]">Abrir Jornada</h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Habilitar ventas y caja</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-400">$</span>
                          <input value={openBalance} onChange={(e) => setOpenBalance(e.target.value)} type="number" placeholder="Base inicial de efectivo"
                            className="w-full text-sm font-bold pl-8 pr-4 py-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-[var(--bg-input)] transition-all" />
                        </div>
                        <button type="submit" className="w-full text-sm font-black py-4 rounded-xl border border-emerald-500 text-white bg-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.3)] hover:bg-emerald-600 transition-all active:scale-95">
                          Confirmar Apertura de Caja
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
