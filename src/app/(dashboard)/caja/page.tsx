'use client';

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet, History, AlertCircle, ShoppingCart, Calculator, ChevronLeft, ChevronRight, Shield, Search, Filter } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { PosSalePanel } from '@/components/pos/PosSalePanel';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';

export default function CajaPage() {
  const { cashSession, pastCashSessions, addCashTransaction, openCashRegister, closeCashRegister, orders } = useAppData();
  const [activeTab, setActiveTab] = useState<'pos' | 'admin'>('pos');
  const [selectedPastSession, setSelectedPastSession] = useState<any | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [openBalance, setOpenBalance] = useState('150000');
  const [closeCash, setCloseCash] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Filters for transactions
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Pagination state for transactions
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const income = cashSession.transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const expense = cashSession.transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const expected = cashSession.opening_balance + income - expense;
  const isOpen = cashSession.status === 'open';

  const filteredTx = cashSession.transactions.filter((t) => {
    if (txTypeFilter !== 'all' && t.type !== txTypeFilter) return false;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase().trim();
      if (!t.description.toLowerCase().includes(q) && !String(t.amount).includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredTx.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedTx = filteredTx.slice(startIndex, startIndex + pageSize);

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
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--orange)] opacity-[0.04] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      
      <Topbar title="Punto de Venta (POS)" subtitle="Facturación rápida, control de caja y movimientos" />
      
      <div className="flex-1 flex flex-col overflow-y-auto z-10 relative">
        {/* Header con Estados y Tabs */}
        <div className="px-5 lg:px-8 pt-5 lg:pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up border-b pb-6" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-input)] border shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'pos' ? 'bg-[var(--orange)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ShoppingCart className="h-4 w-4" /> Terminal POS
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'admin' ? 'bg-[var(--orange)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Calculator className="h-4 w-4" /> Gestión de Caja
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border backdrop-blur-sm transition-all ${
              isOpen ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              <div className="relative flex h-2.5 w-2.5">
                {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">{isOpen ? 'Caja Abierta' : 'Caja Cerrada'}</span>
              {isOpen ? <Unlock className="h-3.5 w-3.5 ml-1" /> : <Lock className="h-3.5 w-3.5 ml-1" />}
            </div>
            
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border bg-[var(--bg-card)] shadow-sm hidden md:flex" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sesión:</span>
              <span className="text-xs font-black text-[var(--orange)] font-mono">{cashSession.id.substring(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Notificaciones globales */}
        {message && (
          <div className="px-5 lg:px-8 mt-4">
            <div className={`flex items-center justify-between p-4 rounded-2xl border backdrop-blur-md animate-fade-in-up shadow-md text-xs font-bold ${
              message.includes('guardado') || message.includes('Caja') || message.includes('exitosamente') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
              <button onClick={() => setMessage(null)} className="opacity-70 hover:opacity-100">✕</button>
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
                <StatCard title="Arqueo Ciego Activo" value="***" change="Saldo oculto por seguridad" up emoji="🔒" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left: Movimientos History */}
                <div className="xl:col-span-2">
                  <div className="card rounded-3xl overflow-hidden flex flex-col shadow-xl h-full border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                    <div className="px-6 py-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                          <History className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-black text-sm text-[var(--text-primary)]">Historial de Movimientos</h3>
                          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Sesión actual ({filteredTx.length})</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-44">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={txSearch}
                            onChange={(e) => { setTxSearch(e.target.value); setCurrentPage(1); }}
                            className="w-full text-xs font-semibold pl-8 pr-2.5 py-1.5 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none"
                            style={{ borderColor: 'var(--border)' }}
                          />
                        </div>
                        <select
                          value={txTypeFilter}
                          onChange={(e) => { setTxTypeFilter(e.target.value as any); setCurrentPage(1); }}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <option value="all">Todos</option>
                          <option value="income">Ingresos (+)</option>
                          <option value="expense">Egresos (-)</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="divide-y max-h-[460px] overflow-y-auto custom-scrollbar flex-1" style={{ borderColor: 'var(--border)' }}>
                      {paginatedTx.map((t) => (
                        <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--bg-input)] transition-all group">
                          <div className={`p-2.5 rounded-2xl border shadow-sm ${
                            t.type === 'income' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            {t.type === 'income' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>{t.description}</p>
                            <p className="text-[10px] font-bold mt-0.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} suppressHydrationWarning>
                              {new Date(t.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-black ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                            </span>
                            <p className="text-[9px] font-black uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {t.type === 'income' ? 'Ingreso' : 'Egreso'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {cashSession.transactions.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-14 text-center">
                          <History className="h-12 w-12 mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
                          <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>No hay movimientos registrados en esta sesión.</p>
                        </div>
                      )}
                    </div>

                    {/* Pagination Bar */}
                    <div className="flex items-center justify-between px-6 py-4 border-t bg-[var(--bg-input)]/50" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        Mostrando {filteredTx.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredTx.length)} de {filteredTx.length} movimientos
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={safePage <= 1}
                          className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-card)] transition-all cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-black px-3" style={{ color: 'var(--text-primary)' }}>
                          {safePage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={safePage >= totalPages}
                          className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-card)] transition-all cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="space-y-6">
                  {isOpen ? (
                    <>
                      <form onSubmit={handleTx} className="card p-6 space-y-4 rounded-3xl border shadow-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                          <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Registrar Movimiento</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ingresos o Gastos Extra</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {(['income', 'expense'] as const).map((t) => (
                            <button key={t} type="button" onClick={() => setTxType(t)}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                                txType === t
                                  ? (t === 'income' ? 'bg-emerald-500 text-white border-emerald-400 shadow-md' : 'bg-rose-500 text-white border-rose-400 shadow-md')
                                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-transparent'
                              }`}>
                              {t === 'income' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                              <span>{t === 'income' ? 'Ingreso' : 'Egreso'}</span>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-3">
                          <input value={txAmount} onChange={(e) => setTxAmount(e.target.value)} type="number" placeholder="Monto en COP *" required
                            className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                          
                          <input value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="Concepto (ej. Pago proveedor o cambio) *" required
                            className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                          
                          <button type="submit" className="w-full text-xs font-black py-3.5 rounded-xl text-white shadow-md hover:scale-[1.01] active:scale-95 transition-all cursor-pointer" style={{ background: 'var(--orange)' }}>
                            Guardar Movimiento
                          </button>
                        </div>
                      </form>

                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await closeCashRegister(Number(closeCash));
                          setCloseCash('');
                          setMessage('Cierre de jornada realizado: Caja cerrada, tablero reiniciado a 0 pedidos activos y registros preservados por 3 meses.');
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : 'Error en cierre de caja.');
                        }
                      }}
                        className="card p-6 space-y-4 rounded-3xl border border-rose-500/30 bg-rose-500/5 shadow-xl">
                        <div className="flex items-center gap-3 border-b border-rose-500/20 pb-3">
                          <div className="p-2 rounded-xl bg-rose-500 text-white shadow-md">
                            <Lock className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Cierre de Venta y Jornada</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Arqueo, archivo a 0 pedidos y retención 3 meses</p>
                          </div>
                        </div>

                        {/* Indicador de pedidos del día a archivar */}
                        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--text-primary)]">Pedidos activos en tablero:</span>
                          <span className="font-black px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-500 border border-amber-500/30">
                            {orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'shipping'].includes(o.status)).length} pedidos
                          </span>
                        </div>

                        {/* Banner de retención de 3 meses */}
                        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1.5 text-[11px] leading-relaxed text-sky-400">
                          <p className="font-black flex items-center gap-1.5 text-sky-400">
                            <Shield className="w-3.5 h-3.5" /> Política de Retención Contable (3 Meses)
                          </p>
                          <p className="text-[10px] opacity-90 text-[var(--text-muted)]">
                            Al confirmar el cierre, los pedidos activos se archivan en el Historial y el tablero iniciará mañana en limpio con 0 pedidos y 0 domicilios pendientes. La información se conserva 90 días (3 meses) para auditoría e informes antes de su depuración automática.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <input value={closeCash} onChange={(e) => setCloseCash(e.target.value)} type="number" placeholder="Efectivo físico real en caja *" required
                            className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-[var(--bg-input)]" style={{ color: 'var(--text-primary)' }} />
                          
                          <button type="submit" className="w-full text-xs font-black py-3.5 rounded-xl text-white bg-rose-500 hover:bg-rose-600 shadow-md transition-all active:scale-95 cursor-pointer">
                            Procesar Cierre de Venta y Jornada
                          </button>
                          
                          {cashSession.difference !== undefined && (
                            <div className={`p-3 rounded-xl border text-xs font-black flex items-center justify-between ${cashSession.difference >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                              <span>Diferencia:</span>
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
                        await openCashRegister(Number(openBalance), 'Administrador');
                        setMessage('Caja abierta exitosamente.');
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : 'Error al abrir caja.');
                      }
                    }}
                      className="card p-6 space-y-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 shadow-xl">
                      <div className="flex items-center gap-3 border-b border-emerald-500/20 pb-3">
                        <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-md">
                          <Unlock className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Abrir Jornada</h3>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Habilitar ventas y caja</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <input value={openBalance} onChange={(e) => setOpenBalance(e.target.value)} type="number" placeholder="Base inicial de efectivo *" required
                          className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-[var(--bg-input)]" style={{ color: 'var(--text-primary)' }} />
                        
                        <button type="submit" className="w-full text-xs font-black py-3.5 rounded-xl text-white bg-emerald-500 hover:bg-emerald-600 shadow-md transition-all active:scale-95 cursor-pointer">
                          Confirmar Apertura de Caja
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {/* HISTORIAL DE CIERRES ANTERIORES */}
              <div className="card p-6 rounded-3xl border bg-[var(--bg-card)] shadow-sm space-y-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[var(--text-primary)]">Historial de Cierres de Jornada</h3>
                      <p className="text-[10px] font-bold text-[var(--text-muted)]">Arqueos y sesiones contables cerradas anteriormente</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-[var(--bg-input)] border text-[var(--text-muted)]" style={{ borderColor: 'var(--border)' }}>
                    {pastCashSessions.length} cierres registrados
                  </span>
                </div>

                {pastCashSessions.length === 0 ? (
                  <p className="text-xs text-center py-6 font-bold" style={{ color: 'var(--text-muted)' }}>
                    No hay sesiones anteriores registradas.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pastCashSessions.map((session) => {
                      const sessionSales = session.transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
                      const isSelected = selectedPastSession?.id === session.id;

                      return (
                        <div
                          key={session.id}
                          onClick={() => setSelectedPastSession(isSelected ? null : session)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            isSelected ? 'border-[var(--orange)] shadow-md bg-[var(--orange)]/5' : 'border-[var(--border)] hover:border-orange-500/30 bg-[var(--bg-input)]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              Cerrada
                            </span>
                            <span className="text-[10px] font-bold text-[var(--text-muted)]">
                              {new Date(session.opened_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between font-bold">
                              <span style={{ color: 'var(--text-muted)' }}>Base Apertura:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(session.opening_balance)}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span style={{ color: 'var(--text-muted)' }}>Ventas del Turno:</span>
                              <span className="text-emerald-400 font-black">{formatCurrency(sessionSales)}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span style={{ color: 'var(--text-muted)' }}>Saldo Cierre:</span>
                              <span className="text-[var(--orange)] font-black">{formatCurrency(session.closing_balance ?? (session.opening_balance + sessionSales))}</span>
                            </div>
                            {session.difference !== undefined && (
                              <div className="flex justify-between font-bold text-[11px] pt-1 border-t border-[var(--border)]">
                                <span style={{ color: 'var(--text-muted)' }}>Diferencia:</span>
                                <span className={session.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {formatCurrency(session.difference)}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-black text-[var(--text-muted)]">
                            <span>{session.transactions.length} transacciones</span>
                            <span className="text-[var(--orange)]">{isSelected ? 'Ocultar detalle ▲' : 'Ver detalle ▼'}</span>
                          </div>

                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2 max-h-48 overflow-y-auto">
                              {session.transactions.map((tx) => (
                                <div key={tx.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-[var(--bg-card)]">
                                  <span className="truncate pr-2 font-medium" style={{ color: 'var(--text-primary)' }}>{tx.description}</span>
                                  <span className="font-black shrink-0 text-emerald-400">+{formatCurrency(tx.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
