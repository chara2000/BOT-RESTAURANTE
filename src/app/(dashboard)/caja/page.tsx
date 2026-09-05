'use client';

import { useState, useMemo } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet, History, AlertCircle, ShoppingCart, Calculator,
  ChevronLeft, ChevronRight, Shield, Search, Filter, Plus, Trash2, Edit, X, Check, Calendar, DollarSign
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { PosSalePanel } from '@/components/pos/PosSalePanel';
import { StatCard } from '@/components/ui/StatCard';
import { useAppData, getLocalDayString } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';

export default function CajaPage() {
  const {
    cashSession,
    pastCashSessions,
    addCashTransaction,
    openCashRegister,
    closeCashRegister,
    deleteCashSession,
    updateCashSession,
    createPastCashSession,
    orders,
  } = useAppData();
  const [activeTab, setActiveTab] = useState<'pos' | 'admin'>('pos');
  const [selectedPastSession, setSelectedPastSession] = useState<any | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [openBalance, setOpenBalance] = useState('150000');
  const [closeCash, setCloseCash] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // CRUD states for past cash sessions
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [deletingSession, setDeletingSession] = useState<any | null>(null);
  const [isCreatingHistorical, setIsCreatingHistorical] = useState(false);
  const [isSavingPastSession, setIsSavingPastSession] = useState(false);

  // Edit form states
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editClosingBalance, setEditClosingBalance] = useState('');
  const [editActualCash, setEditActualCash] = useState('');
  const [editOpenedAt, setEditOpenedAt] = useState('');
  const [editClosedAt, setEditClosedAt] = useState('');

  // Create form states
  const [newOpeningBalance, setNewOpeningBalance] = useState('150000');
  const [newClosingBalance, setNewClosingBalance] = useState('');
  const [newActualCash, setNewActualCash] = useState('');
  const [newOpenedAt, setNewOpenedAt] = useState('');
  const [newClosedAt, setNewClosedAt] = useState('');
  const [newOpenedBy, setNewOpenedBy] = useState('ChefFlow');

  const handleDeleteSession = async () => {
    if (!deletingSession) return;
    setIsSavingPastSession(true);
    try {
      await deleteCashSession(deletingSession.id);
      if (selectedPastSession?.id === deletingSession.id) {
        setSelectedPastSession(null);
      }
      setDeletingSession(null);
      setMessage('Cierre de jornada eliminado exitosamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al eliminar el cierre.');
    } finally {
      setIsSavingPastSession(false);
    }
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setIsSavingPastSession(true);
    try {
      const openBal = Number(editOpeningBalance || 0);
      const closeBal = Number(editClosingBalance || 0);
      const actualCash = Number(editActualCash || closeBal);
      const difference = actualCash - closeBal;

      await updateCashSession(editingSession.id, {
        opening_balance: openBal,
        closing_balance: closeBal,
        actual_cash: actualCash,
        difference,
        opened_at: editOpenedAt ? new Date(editOpenedAt).toISOString() : editingSession.opened_at,
        closed_at: editClosedAt ? new Date(editClosedAt).toISOString() : editingSession.closed_at,
      });

      setEditingSession(null);
      setMessage('Cierre de jornada actualizado correctamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al actualizar el cierre.');
    } finally {
      setIsSavingPastSession(false);
    }
  };

  const handleCreateHistorical = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPastSession(true);
    try {
      const openBal = Number(newOpeningBalance || 0);
      const closeBal = Number(newClosingBalance || openBal);
      const actualCash = Number(newActualCash || closeBal);
      const difference = actualCash - closeBal;

      await createPastCashSession({
        opening_balance: openBal,
        closing_balance: closeBal,
        actual_cash: actualCash,
        difference,
        opened_by: newOpenedBy || 'ChefFlow',
        opened_at: newOpenedAt ? new Date(newOpenedAt).toISOString() : new Date().toISOString(),
        closed_at: newClosedAt ? new Date(newClosedAt).toISOString() : new Date().toISOString(),
      });

      setIsCreatingHistorical(false);
      setMessage('Cierre de jornada registrado correctamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al registrar el cierre.');
    } finally {
      setIsSavingPastSession(false);
    }
  };

  // Filters for transactions & period
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Period filter for Gestión de Caja ('today' by default, no 'all')
  const [cajaPeriod, setCajaPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [cajaDateFrom, setCajaDateFrom] = useState('');
  const [cajaDateTo, setCajaDateTo] = useState('');

  const todayStr = getLocalDayString(new Date());
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayStr = getLocalDayString(yesterdayDate);
  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;

  // Consolidado de transacciones (sesión actual + sesiones pasadas)
  const allTransactions = useMemo(() => {
    const list = [...cashSession.transactions];
    pastCashSessions.forEach(ps => {
      (ps.transactions || []).forEach(tx => {
        if (!list.some(t => t.id === tx.id)) {
          list.push(tx);
        }
      });
    });
    return list;
  }, [cashSession.transactions, pastCashSessions]);

  // Transacciones filtradas por el período seleccionado
  const periodTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const txDateStr = getLocalDayString(t.created_at);
      if (cajaPeriod === 'today') return txDateStr === todayStr;
      if (cajaPeriod === 'yesterday') return txDateStr === yesterdayStr;
      if (cajaPeriod === 'week') return new Date(t.created_at).getTime() >= weekAgo;
      if (cajaPeriod === 'month') return new Date(t.created_at).getTime() >= monthAgo;
      if (cajaPeriod === 'custom') {
        if (cajaDateFrom && txDateStr < cajaDateFrom) return false;
        if (cajaDateTo && txDateStr > cajaDateTo) return false;
      }
      return true;
    });
  }, [allTransactions, cajaPeriod, todayStr, yesterdayStr, weekAgo, monthAgo, cajaDateFrom, cajaDateTo]);

  // Cierres de jornada filtrados por el período seleccionado
  const filteredPastSessions = useMemo(() => {
    return pastCashSessions.filter(s => {
      const sessionDateStr = getLocalDayString(s.closed_at || s.opened_at);
      if (cajaPeriod === 'today') return sessionDateStr === todayStr;
      if (cajaPeriod === 'yesterday') return sessionDateStr === yesterdayStr;
      if (cajaPeriod === 'week') return new Date(s.closed_at || s.opened_at).getTime() >= weekAgo;
      if (cajaPeriod === 'month') return new Date(s.closed_at || s.opened_at).getTime() >= monthAgo;
      if (cajaPeriod === 'custom') {
        if (cajaDateFrom && sessionDateStr < cajaDateFrom) return false;
        if (cajaDateTo && sessionDateStr > cajaDateTo) return false;
      }
      return true;
    });
  }, [pastCashSessions, cajaPeriod, todayStr, yesterdayStr, weekAgo, monthAgo, cajaDateFrom, cajaDateTo]);

  // Pagination state for transactions
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const income = periodTransactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const expense = periodTransactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const expected = cashSession.opening_balance + income - expense;
  const isOpen = cashSession.status === 'open';

  const filteredTx = periodTransactions.filter((t) => {
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
            <div className="animate-fade-in-up space-y-6 max-w-7xl mx-auto w-full">
              {/* Selector de Período en Gestión de Caja */}
              <div className="card p-5 rounded-3xl border bg-[var(--bg-card)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Filtro de Caja por Período</h3>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">
                      {cajaPeriod === 'today' && 'Visualizando movimientos y arqueos del día de Hoy'}
                      {cajaPeriod === 'yesterday' && 'Visualizando histórico contable de Ayer'}
                      {cajaPeriod === 'week' && 'Visualizando movimientos de los últimos 7 días'}
                      {cajaPeriod === 'month' && 'Visualizando movimientos de los últimos 30 días'}
                      {cajaPeriod === 'custom' && 'Filtrando por rango de fechas'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  {[
                    { id: 'today', label: 'Hoy' },
                    { id: 'yesterday', label: 'Ayer' },
                    { id: 'week', label: '7 Días' },
                    { id: 'month', label: '30 Días' },
                    { id: 'custom', label: 'Personalizado' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setCajaPeriod(p.id as any); setCurrentPage(1); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        cajaPeriod === p.id
                          ? 'bg-[var(--orange)] text-white shadow-md'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rango personalizado en Caja si está activo */}
              {cajaPeriod === 'custom' && (
                <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-2xl bg-[var(--bg-input)]/60 border border-[var(--border)] animate-fade-in">
                  <span className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-[var(--orange)]" /> Rango de Fechas:
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Desde:</label>
                    <input 
                      type="date" 
                      value={cajaDateFrom}
                      onChange={(e) => { setCajaDateFrom(e.target.value); setCurrentPage(1); }}
                      className="bg-[var(--bg-card)] border rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Hasta:</label>
                    <input 
                      type="date" 
                      value={cajaDateTo}
                      onChange={(e) => { setCajaDateTo(e.target.value); setCurrentPage(1); }}
                      className="bg-[var(--bg-card)] border rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard title="Saldo Base Inicial" value={formatCurrency(cashSession.opening_balance)} change="Apertura" up emoji="💰" />
                <StatCard title="Ingresos Período" value={formatCompact(income)} change={`${periodTransactions.filter((t) => t.type === 'income').length} movimientos`} up emoji="📈" />
                <StatCard title="Egresos Período" value={formatCompact(expense)} change={`${periodTransactions.filter((t) => t.type === 'expense').length} movimientos`} up={false} emoji="📉" />
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
                          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            {cajaPeriod === 'today' ? 'Hoy' : cajaPeriod === 'yesterday' ? 'Ayer' : cajaPeriod === 'week' ? '7 Días' : cajaPeriod === 'month' ? '30 Días' : 'Personalizado'} ({filteredTx.length} movimientos)
                          </p>
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

              {/* HISTORIAL DE CIERRES ANTERIORES CON CRUD */}
              <div className="card p-6 rounded-3xl border bg-[var(--bg-card)] shadow-sm space-y-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[var(--text-primary)]">Historial de Cierres de Jornada</h3>
                      <p className="text-[10px] font-bold text-[var(--text-muted)]">Arqueos, edición y gestión de jornadas cerradas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-[var(--bg-input)] border text-[var(--text-muted)]" style={{ borderColor: 'var(--border)' }}>
                      {filteredPastSessions.length} cierres ({cajaPeriod === 'today' ? 'Hoy' : cajaPeriod === 'yesterday' ? 'Ayer' : cajaPeriod === 'week' ? '7 Días' : '30 Días'})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewOpeningBalance('150000');
                        setNewClosingBalance('');
                        setNewActualCash('');
                        setNewOpenedAt(new Date(Date.now() - 86400000).toISOString().slice(0, 16));
                        setNewClosedAt(new Date().toISOString().slice(0, 16));
                        setNewOpenedBy('ChefFlow');
                        setIsCreatingHistorical(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-[var(--orange)] text-white shadow-sm hover:opacity-90 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Registrar Cierre
                    </button>
                  </div>
                </div>

                {filteredPastSessions.length === 0 ? (
                  <p className="text-xs text-center py-6 font-bold" style={{ color: 'var(--text-muted)' }}>
                    No hay sesiones anteriores registradas en este período ({cajaPeriod === 'today' ? 'Hoy' : cajaPeriod === 'yesterday' ? 'Ayer' : cajaPeriod === 'week' ? '7 días' : '30 días'}).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPastSessions.map((session) => {
                      const sessionSales = session.transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
                      const isSelected = selectedPastSession?.id === session.id;

                      return (
                        <div
                          key={session.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isSelected ? 'border-[var(--orange)] shadow-md bg-[var(--orange)]/5' : 'border-[var(--border)] hover:border-orange-500/30 bg-[var(--bg-input)]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                Cerrada
                              </span>
                              <span className="text-[10px] font-bold text-[var(--text-muted)]">
                                {new Date(session.opened_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSession(session);
                                  setEditOpeningBalance(String(session.opening_balance));
                                  setEditClosingBalance(String(session.closing_balance ?? (session.opening_balance + sessionSales)));
                                  setEditActualCash(String(session.actual_cash ?? session.closing_balance ?? (session.opening_balance + sessionSales)));
                                  setEditOpenedAt(new Date(session.opened_at).toISOString().slice(0, 16));
                                  setEditClosedAt(session.closed_at ? new Date(session.closed_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
                                }}
                                className="p-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--orange)]/10 text-[var(--text-muted)] hover:text-[var(--orange)] border border-[var(--border)] transition-all cursor-pointer"
                                title="Editar cierre de jornada"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingSession(session);
                                }}
                                className="p-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border)] transition-all cursor-pointer"
                                title="Eliminar cierre de jornada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => setSelectedPastSession(isSelected ? null : session)}
                            className="cursor-pointer space-y-1.5 text-xs"
                          >
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

                          <div
                            onClick={() => setSelectedPastSession(isSelected ? null : session)}
                            className="mt-3 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-black text-[var(--text-muted)] cursor-pointer"
                          >
                            <span>{session.transactions.length} transacciones</span>
                            <span className="text-[var(--orange)]">{isSelected ? 'Ocultar detalle ▲' : 'Ver detalle ▼'}</span>
                          </div>

                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2 max-h-48 overflow-y-auto">
                              {session.transactions.length === 0 ? (
                                <p className="text-[10px] text-center text-[var(--text-muted)] py-2">Sin transacciones registradas</p>
                              ) : (
                                session.transactions.map((tx) => (
                                  <div key={tx.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-[var(--bg-card)]">
                                    <span className="truncate pr-2 font-medium" style={{ color: 'var(--text-primary)' }}>{tx.description}</span>
                                    <span className={`font-black shrink-0 ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </span>
                                  </div>
                                ))
                              )}
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

        {/* MODAL EDITAR CIERRE DE JORNADA */}
        {editingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                    <Edit className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--text-primary)]">Editar Cierre de Jornada</h3>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Modificar valores contables y fechas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="p-1.5 rounded-xl hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateSession} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Base de Apertura ($)</label>
                  <input
                    type="number"
                    value={editOpeningBalance}
                    onChange={(e) => setEditOpeningBalance(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Saldo de Cierre Esperado ($)</label>
                  <input
                    type="number"
                    value={editClosingBalance}
                    onChange={(e) => setEditClosingBalance(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Efectivo Real en Caja ($)</label>
                  <input
                    type="number"
                    value={editActualCash}
                    onChange={(e) => setEditActualCash(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Fecha Apertura</label>
                    <input
                      type="datetime-local"
                      value={editOpenedAt}
                      onChange={(e) => setEditOpenedAt(e.target.value)}
                      required
                      className="w-full px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Fecha Cierre</label>
                    <input
                      type="datetime-local"
                      value={editClosedAt}
                      onChange={(e) => setEditClosedAt(e.target.value)}
                      required
                      className="w-full px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setEditingSession(null)}
                    className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] font-black hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPastSession}
                    className="px-4 py-2 rounded-xl bg-[var(--orange)] text-white font-black shadow-md hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPastSession ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL ELIMINAR CIERRE DE JORNADA */}
        {deletingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-rose-500/30 bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)]">¿Eliminar Cierre de Jornada?</h3>
                  <p className="text-[11px] font-bold text-[var(--text-muted)]">
                    {new Date(deletingSession.opened_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-medium leading-relaxed">
                Esta acción eliminará de forma permanente el registro de cierre y sus {deletingSession.transactions.length} transacciones vinculadas de la base de datos.
              </div>

              <div className="space-y-1 text-xs font-bold border p-3 rounded-xl border-[var(--border)] bg-[var(--bg-input)]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Base Inicial:</span>
                  <span>{formatCurrency(deletingSession.opening_balance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Saldo de Cierre:</span>
                  <span className="text-[var(--orange)]">{formatCurrency(deletingSession.closing_balance ?? deletingSession.opening_balance)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingSession(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] font-black hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSession}
                  disabled={isSavingPastSession}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isSavingPastSession ? 'Eliminando...' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL REGISTRAR CIERRE MANUAL HISTÓRICO */}
        {isCreatingHistorical && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--text-primary)]">Registrar Cierre Manual</h3>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Añadir sesión histórica de arqueo de caja</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingHistorical(false)}
                  className="p-1.5 rounded-xl hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateHistorical} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Cajero / Responsable</label>
                  <input
                    type="text"
                    value={newOpenedBy}
                    onChange={(e) => setNewOpenedBy(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Base de Apertura ($)</label>
                  <input
                    type="number"
                    value={newOpeningBalance}
                    onChange={(e) => setNewOpeningBalance(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Saldo de Cierre Esperado ($)</label>
                  <input
                    type="number"
                    value={newClosingBalance}
                    onChange={(e) => setNewClosingBalance(e.target.value)}
                    required
                    placeholder="Ej: 450000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Efectivo Real en Caja ($)</label>
                  <input
                    type="number"
                    value={newActualCash}
                    onChange={(e) => setNewActualCash(e.target.value)}
                    placeholder="Dejar vacío si coincide con el saldo de cierre"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Fecha Apertura</label>
                    <input
                      type="datetime-local"
                      value={newOpenedAt}
                      onChange={(e) => setNewOpenedAt(e.target.value)}
                      required
                      className="w-full px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Fecha Cierre</label>
                    <input
                      type="datetime-local"
                      value={newClosedAt}
                      onChange={(e) => setNewClosedAt(e.target.value)}
                      required
                      className="w-full px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setIsCreatingHistorical(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] font-black hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPastSession}
                    className="px-4 py-2 rounded-xl bg-[var(--orange)] text-white font-black shadow-md hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPastSession ? 'Registrando...' : 'Registrar Cierre'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
