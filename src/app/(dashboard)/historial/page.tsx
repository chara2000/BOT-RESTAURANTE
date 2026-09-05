'use client';

import { useState } from 'react';
import {
  Search, Calendar, FileText, ChevronLeft, ChevronRight, LayoutGrid, Table as TableIcon,
  Filter, Download, Eye, CheckCircle2, XCircle, Clock, User, Phone, MapPin, DollarSign, X,
  ShoppingBag, TrendingUp, CreditCard, Layers, RotateCcw
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useOrders } from '@/hooks/useOrders';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import { ORDER_STATUS_LABELS, type Order } from '@/types';
import { getLocalDayString } from '@/context/AppDataContext';

export default function HistorialPage() {
  const { orders } = useOrders();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    wompi: 'Wompi',
    transfer: 'Transferencia',
  };

  const ORDER_TYPE_LABELS: Record<string, string> = {
    dine_in: 'En Mesa',
    delivery: 'A Domicilio',
    takeaway: 'Para Llevar',
  };

  // Base history includes ALL orders so nothing from past or present is hidden
  const historyOrders = orders;

  // Search & Filters logic
  const filteredOrders = historyOrders.filter((o) => {
    // Text search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const idMatch = o.id.toLowerCase().includes(q);
      const nameMatch = (o.customer?.name || '').toLowerCase().includes(q);
      const phoneMatch = (o.customer?.phone || '').includes(q);
      const notesMatch = (o.notes || '').toLowerCase().includes(q);
      const addressMatch = (o.delivery_address || '').toLowerCase().includes(q);
      const totalMatch = String(o.total || '').includes(q);
      if (!idMatch && !nameMatch && !phoneMatch && !notesMatch && !addressMatch && !totalMatch) return false;
    }

    // Date range filter
    const orderDateStr = getLocalDayString(o.created_at);
    const todayStr = getLocalDayString(new Date());
    const yesterdayStr = getLocalDayString(new Date(Date.now() - 86400000));

    if (dateFilter === 'today') {
      if (orderDateStr !== todayStr) return false;
    } else if (dateFilter === 'yesterday') {
      if (orderDateStr !== yesterdayStr) return false;
    } else if (dateFilter === 'week') {
      const weekAgo = Date.now() - 7 * 86400000;
      if (new Date(o.created_at).getTime() < weekAgo) return false;
    } else if (dateFilter === 'month') {
      const monthAgo = Date.now() - 30 * 86400000;
      if (new Date(o.created_at).getTime() < monthAgo) return false;
    } else if (dateFilter === 'custom') {
      if (dateFrom && orderDateStr < dateFrom) return false;
      if (dateTo && orderDateStr > dateTo) return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        if (['delivered', 'cancelled'].includes(o.status)) return false;
      } else if (o.status !== statusFilter) {
        return false;
      }
    }

    // Payment method filter
    if (paymentMethodFilter !== 'all' && o.payment_method !== paymentMethodFilter) {
      return false;
    }

    // Order type filter
    if (orderTypeFilter !== 'all' && o.type !== orderTypeFilter) {
      return false;
    }

    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + pageSize);

  // Statistics
  const validHistoryOrders = filteredOrders.filter(o => !['cancelled', 'draft'].includes(o.status));
  const totalFacturado = validHistoryOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const deliveredCount = filteredOrders.filter(o => o.status === 'delivered').length;
  const cancelledCount = filteredOrders.filter(o => o.status === 'cancelled').length;
  const activeCount = filteredOrders.filter(o => !['delivered', 'cancelled', 'draft'].includes(o.status)).length;
  const avgTicket = validHistoryOrders.length > 0 ? Math.round(totalFacturado / validHistoryOrders.length) : 0;

  const resetFilters = () => {
    setSearch('');
    setDateFilter('today');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setOrderTypeFilter('all');
    setCurrentPage(1);
  };

  const exportCSV = () => {
    const header = 'ID,Fecha,Cliente,Telefono,Direccion,Tipo,Metodo Pago,Total,Estado\n';
    const rows = filteredOrders.map((o) => {
      const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
      return `"${shortId}","${new Date(o.created_at).toLocaleString('es-CO')}","${o.customer?.name ?? 'Anónimo'}","${o.customer?.phone ?? ''}","${o.delivery_address ?? ''}","${ORDER_TYPE_LABELS[o.type] || o.type}","${PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method}",${o.total},"${ORDER_STATUS_LABELS[o.status] || o.status}"`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-app)]">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Historial General" subtitle="Auditoría completa de pedidos anteriores y transacciones" />

      {/* Main Content Scrollable Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8 space-y-6 z-10 relative">

        {/* Top Info Banner & Actions */}
        <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-black text-[var(--text-primary)]">
                Registro Histórico y Auditoría Completa
              </p>
              <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                Mostrando {historyOrders.length} pedidos registrados en la base de datos sin límite de corte.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={exportCSV}
              className="text-xs font-black px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Dashboard Symmetry Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="card p-4 sm:p-5 rounded-2xl border bg-[var(--bg-card)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total Pedidos</span>
              <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-2 text-[var(--text-primary)]">{filteredOrders.length}</p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">En el filtro actual</p>
          </div>

          <div className="card p-4 sm:p-5 rounded-2xl border bg-[var(--bg-card)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Facturado Entregados</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-2 text-emerald-400">{formatCurrency(totalFacturado)}</p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">{deliveredCount} órdenes entregadas</p>
          </div>

          <div className="card p-4 sm:p-5 rounded-2xl border bg-[var(--bg-card)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Ticket Promedio</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-2 text-[var(--text-primary)]">{formatCurrency(avgTicket)}</p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">Por entrega exitosa</p>
          </div>

          <div className="card p-4 sm:p-5 rounded-2xl border bg-[var(--bg-card)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Cancelados / Activos</span>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-2 text-rose-400">{cancelledCount} <span className="text-xs text-[var(--text-muted)] font-normal">/ {activeCount} act.</span></p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">Anulados o en proceso</p>
          </div>
        </div>

        {/* Filters Card */}
        <div className="card p-5 rounded-3xl border bg-[var(--bg-card)] shadow-sm space-y-4" style={{ borderColor: 'var(--border)' }}>
          {/* Fila 1: Selector de Período Rápido */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--orange)]" />
              <span className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Período:</span>
              <span className="text-[11px] font-bold text-[var(--text-muted)]">
                {dateFilter === 'today' && 'Hoy (24 pedidos)'}
                {dateFilter === 'yesterday' && 'Ayer'}
                {dateFilter === 'week' && 'Últimos 7 días'}
                {dateFilter === 'month' && 'Últimos 30 días'}
                {dateFilter === 'custom' && 'Rango personalizado'}
              </span>
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
                  onClick={() => { setDateFilter(p.id as any); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    dateFilter === p.id
                      ? 'bg-[var(--orange)] text-white shadow-md'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fila 2: Búsqueda, Filtros secundarios y Modos de vista */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por ID, Cliente, Teléfono, Dirección o monto..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full text-xs font-semibold pl-10 pr-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-7 py-2 rounded-xl text-xs font-bold bg-[var(--bg-input)] border outline-none cursor-pointer text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="all">📋 Todos los estados</option>
                  <option value="delivered">✅ Entregados</option>
                  <option value="cancelled">❌ Cancelados</option>
                  <option value="active">⏳ En Preparación / Activos</option>
                </select>
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
              </div>

              {/* Payment Method Filter */}
              <div className="relative">
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => { setPaymentMethodFilter(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-7 py-2 rounded-xl text-xs font-bold bg-[var(--bg-input)] border outline-none cursor-pointer text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="all">💳 Todos los pagos</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
              </div>

              {/* Order Type Filter */}
              <div className="relative">
                <select
                  value={orderTypeFilter}
                  onChange={(e) => { setOrderTypeFilter(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-7 py-2 rounded-xl text-xs font-bold bg-[var(--bg-input)] border outline-none cursor-pointer text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="all">🍽️ Todos los tipos</option>
                  {Object.entries(ORDER_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-[var(--bg-input)] p-1 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                  title="Vista Tabla"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                  title="Vista Tarjetas"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Reset Filters */}
              {(search || dateFilter !== 'today' || statusFilter !== 'all' || paymentMethodFilter !== 'all' || orderTypeFilter !== 'all') && (
                <button
                  onClick={resetFilters}
                  className="p-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Restablecer filtros a Hoy"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restablecer</span>
                </button>
              )}
            </div>
          </div>

          {/* Custom Date Range Pickers (shown only when 'custom' selected) */}
          {dateFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t animate-fade-in" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs font-bold text-[var(--text-muted)]">Rango específico:</span>
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
            </div>
          )}
        </div>

        {/* Content Area: Table or Cards */}
        {paginatedOrders.length === 0 ? (
          <div className="card p-12 text-center space-y-4 rounded-3xl border bg-[var(--bg-card)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <FileText className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-40" />
            <div>
              <p className="text-base font-black text-[var(--text-primary)]">No hay registros con los filtros seleccionados</p>
              <p className="text-xs font-semibold text-[var(--text-muted)] mt-1">Prueba ampliando el rango de fechas o limpiando los filtros</p>
            </div>
            <button
              onClick={resetFilters}
              className="px-5 py-2.5 rounded-xl bg-[var(--orange)] text-white text-xs font-black shadow-md hover:scale-105 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restablecer a Hoy
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* ─── TABLE VIEW ─── */
          <div className="bg-[var(--bg-card)] rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="border-b text-[11px] uppercase tracking-wider font-black bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <th className="px-5 py-3.5">ID Pedido</th>
                    <th className="px-5 py-3.5">Fecha & Hora</th>
                    <th className="px-5 py-3.5">Cliente</th>
                    <th className="px-5 py-3.5">Tipo & Pago</th>
                    <th className="px-5 py-3.5">Estado</th>
                    <th className="px-5 py-3.5 text-right">Total</th>
                    <th className="px-5 py-3.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs" style={{ borderColor: 'var(--border)' }}>
                  {paginatedOrders.map((order) => {
                    const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
                    const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;
                    const isDelivered = order.status === 'delivered';
                    const isCancelled = order.status === 'cancelled';

                    return (
                      <tr key={order.id} className="hover:bg-[var(--bg-input)]/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-black text-xs text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30">
                            {orderNumber}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-[var(--text-primary)]">
                            {new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium">
                            {new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} ({formatTimeAgo(order.created_at)})
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-black text-[var(--text-primary)]">{order.customer?.name || 'Cliente Mostrador'}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-semibold">{order.customer?.phone || 'Sin teléfono'}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-[var(--text-primary)] block">
                            {ORDER_TYPE_LABELS[order.type] || order.type}
                          </span>
                          <span className="text-[10px] uppercase font-black text-[var(--text-muted)]">
                            {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                            isDelivered
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isCancelled
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {ORDER_STATUS_LABELS[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="font-black text-sm text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 px-3 rounded-xl border hover:bg-[var(--bg-input)] transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            <Eye className="w-3.5 h-3.5 text-[var(--orange)]" />
                            <span>Detalle</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Pagination Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t bg-[var(--bg-input)]/40" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold text-[var(--text-muted)]">
                Mostrando {filteredOrders.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredOrders.length)} de {filteredOrders.length} registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 px-2.5 rounded-lg border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-card)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-black px-2 text-[var(--text-primary)]">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 px-2.5 rounded-lg border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-card)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ─── GRID CARDS VIEW ─── */
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedOrders.map((order) => {
                const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
                const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;
                const isDelivered = order.status === 'delivered';
                const isCancelled = order.status === 'cancelled';

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border p-4 space-y-3 bg-[var(--bg-card)] shadow-sm hover:shadow-md transition-all"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-[var(--orange)] bg-orange-500/10 px-2 py-0.5 rounded-lg border border-orange-500/30">
                        {orderNumber}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isDelivered
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isCancelled
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-[var(--text-primary)] truncate">{order.customer?.name || 'Cliente Mostrador'}</h4>
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">{order.customer?.phone || 'Sin teléfono'}</p>
                    </div>

                    <div className="p-2.5 rounded-xl border flex items-center justify-between text-xs bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">Fecha</p>
                        <p className="font-bold text-[var(--text-primary)] mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">Total</p>
                        <p className="font-black text-sm text-[var(--text-primary)] mt-0.5">{formatCurrency(order.total)}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="w-full py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--orange)]" />
                      <span>Ver Detalle del Pedido</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Grid Pagination Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold text-[var(--text-muted)]">
                Mostrando {filteredOrders.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredOrders.length)} de {filteredOrders.length} registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 px-2.5 rounded-lg border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-black px-2 text-[var(--text-primary)]">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 px-2.5 rounded-lg border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modal Detalle de Pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-lg rounded-2xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[88dvh] sm:max-h-[92vh] overflow-hidden my-auto bg-[var(--bg-card)] border-[var(--border)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-xs font-black uppercase text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30">
                  {selectedOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${selectedOrder.id.slice(0, 6).toUpperCase()}`}
                </span>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-[var(--text-muted)]">
                  Registrado: {new Date(selectedOrder.created_at).toLocaleString('es-CO')}
                </p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-xl hover:bg-[var(--bg-input)] cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Customer & Address */}
              <div className="p-4 rounded-2xl border space-y-2 bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-black flex items-center gap-2 text-[var(--text-primary)]">
                  <User className="w-4 h-4 text-[var(--orange)]" /> {selectedOrder.customer?.name || 'Cliente Mostrador'}
                </p>
                {selectedOrder.customer?.phone && (
                  <p className="text-xs font-medium flex items-center gap-2 text-[var(--text-muted)]">
                    <Phone className="w-3.5 h-3.5 text-[var(--orange)]" /> {selectedOrder.customer.phone}
                  </p>
                )}
                {selectedOrder.delivery_address && (
                  <p className="text-xs font-medium flex items-center gap-2 text-[var(--text-muted)]">
                    <MapPin className="w-3.5 h-3.5 text-[var(--orange)] shrink-0" /> {selectedOrder.delivery_address}
                  </p>
                )}
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Items del Pedido</p>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {item.quantity}x {item.product?.name || (item as any).name || 'Producto'}
                      </span>
                      <span className="text-xs font-black text-[var(--orange)]">{formatCurrency(item.unit_price * item.quantity)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs italic text-[var(--text-muted)]">Sin desglose detallado de items.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 shrink-0 bg-[var(--bg-card)] flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider block text-[var(--text-muted)]">Método de Pago</span>
                <span className="text-xs font-black uppercase text-[var(--text-primary)]">
                  {PAYMENT_METHOD_LABELS[selectedOrder.payment_method] || selectedOrder.payment_method}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider block text-[var(--text-muted)]">Total Pagado</span>
                <span className="text-base font-black text-[var(--orange)]">{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
