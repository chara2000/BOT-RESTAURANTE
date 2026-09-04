'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import {
  CheckCircle, XCircle, Image as ImageIcon, Clock, AlertCircle, RefreshCw,
  Layers, CreditCard, ChevronLeft, ChevronRight, Search, Calendar, Filter,
  Download, DollarSign, ArrowUpRight, TrendingUp, CheckCircle2
} from 'lucide-react';
import { formatCurrency, formatCompact } from '@/lib/utils';
import type { Order, PaymentMethod } from '@/types';

export default function PagosPage() {
  const { orders, updateOrderStatus, cashSession, activeTenantId } = useAppData();
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pos' | 'caja'>('pos');
  
  // Filters state
  const [search, setSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cash Tab filters
  const [cashSearch, setCashSearch] = useState('');
  const [cashTypeFilter, setCashTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    wompi: 'Wompi',
    transfer: 'Transferencia',
  };

  // Filter orders according to all active criteria - NO hardcoded 7-day cutoff!
  const filteredPosOrders = orders.filter((o) => {
    // Payment method filter
    if (selectedMethod !== 'all' && o.payment_method !== selectedMethod) {
      return false;
    }

    // Status filter
    const isApproved = ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(o.status);
    const isRejected = o.status === 'cancelled';
    const isPending = !isApproved && !isRejected;

    if (statusFilter === 'approved' && !isApproved) return false;
    if (statusFilter === 'rejected' && !isRejected) return false;
    if (statusFilter === 'pending' && !isPending) return false;

    // Date filter
    if (dateFilter !== 'all') {
      const orderDate = new Date(o.created_at);
      const now = new Date();
      if (dateFilter === 'today') {
        if (orderDate.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === 'week') {
        const weekAgo = Date.now() - 7 * 86400000;
        if (orderDate.getTime() < weekAgo) return false;
      } else if (dateFilter === 'month') {
        const monthAgo = Date.now() - 30 * 86400000;
        if (orderDate.getTime() < monthAgo) return false;
      } else if (dateFilter === 'custom') {
        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`);
          if (orderDate < from) return false;
        }
        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59`);
          if (orderDate > to) return false;
        }
      }
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1]?.toLowerCase() || `#${o.id.slice(0, 6).toLowerCase()}`;
      const name = (o.customer?.name || '').toLowerCase();
      const phone = (o.customer?.phone || '').toLowerCase();
      const totalStr = String(o.total || '');
      const notes = (o.notes || '').toLowerCase();
      if (!shortId.includes(q) && !name.includes(q) && !phone.includes(q) && !totalStr.includes(q) && !notes.includes(q)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalPages = Math.ceil(filteredPosOrders.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedOrders = filteredPosOrders.slice(startIndex, startIndex + pageSize);

  // Global pending transfers count for notification badge
  const pendingTransfers = orders.filter(
    (o) => o.payment_method === 'transfer' && o.status === 'pending'
  );

  // Summary KPI stats based on filtered orders
  const totalRecaudado = filteredPosOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const aprobadosCount = filteredPosOrders.filter((o) =>
    ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(o.status)
  ).length;
  const totalAprobado = filteredPosOrders
    .filter((o) => ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(o.status))
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const avgTicket = filteredPosOrders.length > 0 ? Math.round(totalRecaudado / filteredPosOrders.length) : 0;

  // Filtered cash transactions
  const filteredCashTx = cashSession.transactions.filter((tx) => {
    if (cashTypeFilter !== 'all' && tx.type !== cashTypeFilter) return false;
    if (cashSearch.trim()) {
      const q = cashSearch.toLowerCase();
      if (!tx.description.toLowerCase().includes(q) && !String(tx.amount).includes(q)) {
        return false;
      }
    }
    return true;
  });

  const extractReceiptUrl = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/\[COMPROBANTE:\s*([^\]]+)\]/i);
    if (!match) return null;
    const raw = match[1].trim();
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return raw;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fqclycbmwawphkghrvue.supabase.co';
    return `${supabaseUrl}/storage/v1/object/public/receipts/${raw}`;
  };

  const handleUpdatePaymentStatus = async (order: Order, action: 'approve' | 'reject') => {
    setProcessing(order.id);
    const newStatus = action === 'approve' ? 'confirmed' : 'cancelled';
    const noteTag = action === 'approve' ? ' | [PAGO APROBADO]' : ' | [PAGO RECHAZADO]';
    const updatedNotes = (order.notes ?? '') + noteTag;

    try {
      const res = await fetch(`/api/orders/${order.id}/payment`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(activeTenantId ? { 'x-tenant-id': activeTenantId } : {}),
        },
        body: JSON.stringify({ payment_status: action === 'approve' ? 'paid' : 'failed', notes: updatedNotes }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Error al actualizar');
      }

      await updateOrderStatus(order.id, newStatus as any);

      setActionMsg({
        id: order.id,
        type: 'ok',
        text: action === 'approve' ? '✓ Pago aprobado y orden enviada a preparación' : '✗ Pago rechazado',
      });
    } catch (err) {
      setActionMsg({ id: order.id, type: 'err', text: err instanceof Error ? err.message : 'Error al procesar' });
    } finally {
      setProcessing(null);
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const exportCSV = () => {
    const header = 'ID Pedido,Fecha,Cliente,Telefono,Metodo de Pago,Monto,Estado\n';
    const rows = filteredPosOrders.map((o) => {
      const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
      const isApproved = ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(o.status);
      const isRejected = o.status === 'cancelled';
      const statusText = isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente';
      return `"${shortId}","${new Date(o.created_at).toLocaleString('es-CO')}","${o.customer?.name ?? 'Cliente Mostrador'}","${o.customer?.phone ?? ''}","${PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method}",${o.total},"${statusText}"`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registro-pagos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-emerald-500 opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />
      <Topbar title="Registro de Pagos" subtitle="Historial de transacciones, conciliación digital y caja" />

      {/* Pill Tabs Switcher */}
      <div className="px-5 lg:px-8 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-input)] border shadow-inner w-fit" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-300 cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <CreditCard className="w-4 h-4" /> Transacciones & Pagos
          </button>
          <button
            onClick={() => setActiveTab('caja')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-300 cursor-pointer ${
              activeTab === 'caja'
                ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <Layers className="w-4 h-4" /> Gestión de Caja
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative custom-scrollbar space-y-6">
        {actionMsg && (
          <div className={`flex items-center gap-3 p-4 rounded-2xl border font-bold text-sm animate-fade-in-up ${actionMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {actionMsg.text}
          </div>
        )}

        {activeTab === 'pos' && (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in-up">
              <div className="card p-5 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total Transacciones</span>
                  <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-black mt-2 text-[var(--text-primary)]">{formatCurrency(totalRecaudado)}</p>
                <p className="text-[11px] font-bold text-[var(--text-muted)] mt-1">{filteredPosOrders.length} registros según filtros</p>
              </div>

              <div className="card p-5 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Pagos Aprobados</span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-black mt-2 text-emerald-400">{formatCurrency(totalAprobado)}</p>
                <p className="text-[11px] font-bold text-[var(--text-muted)] mt-1">{aprobadosCount} órdenes confirmadas</p>
              </div>

              <div className="card p-5 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Transf. Pendientes</span>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-black mt-2 text-amber-500">{pendingTransfers.length}</p>
                <p className="text-[11px] font-bold text-[var(--text-muted)] mt-1">Requieren verificación manual</p>
              </div>

              <div className="card p-5 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Ticket Promedio</span>
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-black mt-2 text-[var(--text-primary)]">{formatCurrency(avgTicket)}</p>
                <p className="text-[11px] font-bold text-[var(--text-muted)] mt-1">Por pago registrado</p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="card p-5 rounded-3xl border bg-[var(--bg-card)] space-y-4 shadow-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar por ID, Cliente, Teléfono, Monto..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                    className="w-full text-xs font-semibold pl-11 pr-4 py-2.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                {/* Dropdowns */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date Filter */}
                  <div className="relative">
                    <select
                      value={dateFilter}
                      onChange={(e) => { setDateFilter(e.target.value as any); setCurrentPage(1); }}
                      className="pl-9 pr-8 py-2.5 rounded-2xl text-xs font-bold bg-[var(--bg-input)] border outline-none cursor-pointer text-[var(--text-primary)]"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <option value="all">📅 Todo el histórico</option>
                      <option value="today">Hoy</option>
                      <option value="week">Últimos 7 días</option>
                      <option value="month">Últimos 30 días</option>
                      <option value="custom">Rango Personalizado...</option>
                    </select>
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                  </div>

                  {/* Status Filter */}
                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
                      className="pl-9 pr-8 py-2.5 rounded-2xl text-xs font-bold bg-[var(--bg-input)] border outline-none cursor-pointer text-[var(--text-primary)]"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <option value="all">Todos los estados</option>
                      <option value="approved">✓ Aprobados</option>
                      <option value="pending">⏳ Pendientes</option>
                      <option value="rejected">✕ Rechazados</option>
                    </select>
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                  </div>

                  {/* CSV Export */}
                  <button
                    onClick={exportCSV}
                    className="px-4 py-2.5 rounded-2xl border text-xs font-black hover:bg-[var(--bg-input)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--orange)]" />
                    <span className="hidden sm:inline">Exportar CSV</span>
                  </button>
                </div>
              </div>

              {/* Custom Date Range Pickers (shown only when 'custom' selected) */}
              {dateFilter === 'custom' && (
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t animate-fade-in" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-bold text-[var(--text-muted)]">Rango de fechas:</span>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Desde:</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-[var(--text-muted)]">Hasta:</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl border bg-[var(--bg-input)] text-[var(--text-primary)] outline-none"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                      className="text-[11px] font-bold text-rose-400 hover:underline cursor-pointer ml-2"
                    >
                      Limpiar fechas
                    </button>
                  )}
                </div>
              )}

              {/* Payment Method Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-black uppercase tracking-wider mr-2 text-[var(--text-muted)]">Método de Pago:</span>
                <button 
                  onClick={() => { setSelectedMethod('all'); setCurrentPage(1); }}
                  className="text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer"
                  style={{ 
                    background: selectedMethod === 'all' ? 'var(--orange)' : 'var(--bg-input)', 
                    color: selectedMethod === 'all' ? '#fff' : 'var(--text-muted)',
                    borderColor: selectedMethod === 'all' ? 'var(--orange)' : 'var(--border)'
                  }}
                >
                  Todos ({orders.length})
                </button>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => {
                  const count = orders.filter((o) => o.payment_method === method).length;
                  return (
                    <button 
                      key={method}
                      onClick={() => { setSelectedMethod(method); setCurrentPage(1); }}
                      className="text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5"
                      style={{ 
                        background: selectedMethod === method ? 'var(--orange)' : 'var(--bg-input)', 
                        color: selectedMethod === method ? '#fff' : 'var(--text-muted)',
                        borderColor: selectedMethod === method ? 'var(--orange)' : 'var(--border)'
                      }}
                    >
                      <span>{PAYMENT_METHOD_LABELS[method]}</span>
                      <span className="opacity-70 text-[9px]">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Desktop View Table */}
            <div className="card bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden hidden md:block">
              <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-[var(--text-primary)]">Historial Completo de Transacciones</p>
                  <p className="text-[10px] font-bold text-[var(--text-muted)]">
                    Mostrando registros históricos ordenados cronológicamente ({filteredPosOrders.length} encontrados)
                  </p>
                </div>
                {pendingTransfers.length > 0 && (
                  <span className="ml-auto text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                    {pendingTransfers.length} Transf. Pendientes
                  </span>
                )}
              </div>

              <div className="overflow-x-auto max-h-[560px]">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 backdrop-blur-md">
                    <tr className="border-b text-[11px] uppercase tracking-wider font-black" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-input)' }}>
                      <th className="pb-3 pt-3 px-6">Pedido / Fecha</th>
                      <th className="pb-3 pt-3 px-6">Cliente</th>
                      <th className="pb-3 pt-3 px-6">Monto</th>
                      <th className="pb-3 pt-3 px-6">Método de Pago</th>
                      <th className="pb-3 pt-3 px-6">Estado</th>
                      <th className="pb-3 pt-3 px-6 text-center">Comprobante</th>
                      <th className="pb-3 pt-3 px-6 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold divide-y" style={{ borderColor: 'var(--border)' }}>
                    {paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                          Sin registros de pago para los filtros seleccionados. Prueba ampliando las fechas o el método de pago.
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((order) => {
                        const receiptUrl = extractReceiptUrl(order.notes);
                        const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
                        const isApproved = ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(order.status);
                        const isRejected = order.status === 'cancelled';
                        const isProc = processing === order.id;

                        return (
                          <tr key={order.id} className="hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-4 px-6">
                              <p className="font-black uppercase tracking-wider text-xs text-[var(--orange)]">{shortId}</p>
                              <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">{new Date(order.created_at).toLocaleString('es-CO')}</p>
                            </td>
                            <td className="py-4 px-6 text-xs">
                              <p className="font-bold text-[var(--text-primary)]">{order.customer?.name ?? 'Cliente Mostrador'}</p>
                              {order.customer?.phone && <p className="text-[10px] text-[var(--text-muted)]">{order.customer.phone}</p>}
                            </td>
                            <td className="py-4 px-6 font-black text-xs text-[var(--text-primary)]">{formatCurrency(order.total)}</td>
                            <td className="py-4 px-6 uppercase text-[10px] text-[var(--text-muted)] font-black">
                              <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                                {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              {isApproved ? (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Aprobado</span>
                              ) : isRejected ? (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30">Rechazado</span>
                              ) : (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">Pendiente</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-center">
                              {receiptUrl ? (
                                <button onClick={() => setSelectedReceipt(receiptUrl)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:ring-2 ring-[var(--orange-soft)] transition-all text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--orange)' }}>
                                  <ImageIcon className="w-3.5 h-3.5" /> Ver Foto
                                </button>
                              ) : (
                                <span className="text-xs italic text-[var(--text-muted)]">Sin comprobante</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              {(['nequi', 'daviplata', 'wompi', 'card', 'transfer'] as const).includes(order.payment_method as any) && order.status === 'pending' ? (
                                <div className="flex gap-2 justify-end">
                                  <button
                                    disabled={isProc}
                                    onClick={() => handleUpdatePaymentStatus(order, 'approve')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-black text-xs cursor-pointer hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {isProc ? '...' : 'Aprobar'}
                                  </button>
                                  <button
                                    disabled={isProc}
                                    onClick={() => handleUpdatePaymentStatus(order, 'reject')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 font-black text-xs cursor-pointer hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    {isProc ? '...' : 'Rechazar'}
                                  </button>
                                </div>
                              ) : isApproved ? (
                                <span className="flex items-center gap-1.5 justify-end text-xs font-bold text-emerald-400">
                                  <CheckCircle className="w-3.5 h-3.5" /> Completado
                                </span>
                              ) : isRejected ? (
                                <span className="flex items-center gap-1.5 justify-end text-xs font-bold text-rose-400">
                                  <XCircle className="w-3.5 h-3.5" /> Rechazado
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">Efectivo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-[var(--bg-input)]/50" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold text-[var(--text-muted)]">
                  Mostrando {filteredPosOrders.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredPosOrders.length)} de {filteredPosOrders.length} registros
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
                  <span className="text-xs font-black px-3 text-[var(--text-primary)]">
                    Página {safePage} de {totalPages}
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

            {/* Mobile View Cards */}
            <div className="md:hidden space-y-4">
              {paginatedOrders.length === 0 ? (
                <div className="card p-8 text-center text-xs font-bold text-[var(--text-muted)]">
                  Sin registros de pago para los filtros seleccionados.
                </div>
              ) : (
                paginatedOrders.map((order) => {
                  const receiptUrl = extractReceiptUrl(order.notes);
                  const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
                  const isApproved = ['delivered', 'confirmed', 'ready', 'shipping', 'preparing'].includes(order.status);
                  const isRejected = order.status === 'cancelled';
                  const isProc = processing === order.id;

                  return (
                    <div key={order.id} className="card p-4 space-y-3 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-sm uppercase text-[var(--orange)]">{shortId}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{new Date(order.created_at).toLocaleString()}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                          isApproved ? 'bg-emerald-500/10 text-emerald-500' : isRejected ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                        }`}>{isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div>
                          <p className="text-[var(--text-muted)] font-semibold">{order.customer?.name ?? 'Cliente Mostrador'}</p>
                          <p className="font-black text-sm text-[var(--text-primary)]">{formatCurrency(order.total)}</p>
                        </div>
                        <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{PAYMENT_METHOD_LABELS[order.payment_method]}</p>
                      </div>
                      {receiptUrl && (
                        <button onClick={() => setSelectedReceipt(receiptUrl)} className="w-full flex justify-center items-center gap-1.5 py-2 rounded-xl text-xs font-bold border cursor-pointer" style={{ color: 'var(--orange)', borderColor: 'var(--border)' }}>
                          <ImageIcon className="w-4 h-4" /> Ver Comprobante
                        </button>
                      )}
                      {(['nequi', 'daviplata', 'wompi', 'card', 'transfer'] as const).includes(order.payment_method as any) && order.status === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleUpdatePaymentStatus(order, 'approve')} disabled={isProc} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-black rounded-xl bg-emerald-500 text-white cursor-pointer shadow-sm disabled:opacity-50">
                            <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                          </button>
                          <button onClick={() => handleUpdatePaymentStatus(order, 'reject')} disabled={isProc} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-black rounded-xl bg-rose-500 text-white cursor-pointer shadow-sm disabled:opacity-50">
                            <XCircle className="w-3.5 h-3.5" /> Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'caja' && (
          <div className="space-y-6">
            {/* Cash Session Status Card */}
            <div className="card p-6 grid grid-cols-1 md:grid-cols-4 gap-6 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Sesión de Caja</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${cashSession.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <p className="text-lg font-black capitalize text-[var(--text-primary)]">{cashSession.status === 'open' ? 'Abierta' : 'Cerrada'}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Cajero Responsable</p>
                <p className="text-base font-bold mt-1 text-[var(--text-primary)]">{cashSession.opened_by || 'Sin cajero'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Balance de Apertura</p>
                <p className="text-base font-bold mt-1 text-[var(--text-primary)]">{formatCurrency(cashSession.opening_balance)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Apertura Registrada</p>
                <p className="text-xs font-bold mt-1 text-[var(--text-muted)]">{new Date(cashSession.opened_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Cash Transactions List with Search and Filter */}
            <div className="card bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-[var(--text-primary)]">Movimientos de Caja</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Ingresos y egresos realizados dentro de la caja registradora</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Buscar movimiento..."
                      value={cashSearch}
                      onChange={(e) => setCashSearch(e.target.value)}
                      className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border outline-none"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <select
                    value={cashTypeFilter}
                    onChange={(e) => setCashTypeFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--bg-input)] border outline-none text-[var(--text-primary)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="all">Todos los tipos</option>
                    <option value="income">Ingresos (+)</option>
                    <option value="expense">Egresos (-)</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wider font-black" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-input)' }}>
                      <th className="pb-3 pt-3 px-6">ID Transacción</th>
                      <th className="pb-3 pt-3 px-6">Detalle / Concepto</th>
                      <th className="pb-3 pt-3 px-6">Tipo</th>
                      <th className="pb-3 pt-3 px-6">Monto</th>
                      <th className="pb-3 pt-3 px-6 text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold divide-y" style={{ borderColor: 'var(--border)' }}>
                    {filteredCashTx.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">
                          Sin transacciones de caja registradas para el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredCashTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-4 px-6 font-black uppercase text-xs text-[var(--text-muted)]">#{tx.id.slice(-6)}</td>
                          <td className="py-4 px-6 text-xs text-[var(--text-primary)] font-bold">{tx.description}</td>
                          <td className="py-4 px-6">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                              tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                            }`}>{tx.type === 'income' ? 'Ingreso' : 'Egreso'}</span>
                          </td>
                          <td className={`py-4 px-6 font-black ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </td>
                          <td className="py-4 px-6 text-right text-xs text-[var(--text-muted)]">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Receipt Viewer */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in" onClick={() => setSelectedReceipt(null)}>
          <div className="relative max-w-2xl w-full max-h-[88dvh] sm:max-h-[92vh] overflow-hidden my-auto bg-[var(--bg-card)] rounded-2xl sm:rounded-3xl shadow-2xl border border-[var(--border-color)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-card)]">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                📸 Comprobante de Pago
              </h3>
              <button onClick={() => setSelectedReceipt(null)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-all cursor-pointer">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-black/5 flex items-center justify-center min-h-[300px]">
              <img 
                src={selectedReceipt} 
                alt="Comprobante de Pago" 
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                  const parent = (e.target as HTMLElement).parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'text-center p-6 text-sm text-[var(--text-secondary)]';
                    fallback.innerHTML = '⚠️ No se pudo previsualizar la imagen directamente.<br><a href="' + selectedReceipt + '" target="_blank" rel="noopener noreferrer" class="text-[var(--color-primary)] underline mt-2 inline-block font-semibold">Abrir enlace directo del comprobante</a>';
                    parent.appendChild(fallback);
                  }
                }} 
              />
            </div>
            <div className="px-6 py-3 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex justify-end shrink-0">
              <button onClick={() => setSelectedReceipt(null)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors cursor-pointer">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
