'use client';

import { useState } from 'react';
import {
  Search, Calendar, FileText, ChevronLeft, ChevronRight, LayoutGrid, Table as TableIcon,
  Filter, Download, Eye, CheckCircle2, XCircle, Clock, User, Phone, MapPin, DollarSign, X
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useOrders } from '@/hooks/useOrders';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import { ORDER_STATUS_LABELS, type Order } from '@/types';

export default function HistorialPage() {
  const { orders } = useOrders();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter delivered and cancelled orders
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  // Search & Filters
  const filteredOrders = historyOrders.filter(o => {
    if (search) {
      const q = search.toLowerCase();
      const idMatch = o.id.toLowerCase().includes(q);
      const nameMatch = o.customer?.name.toLowerCase().includes(q);
      const phoneMatch = o.customer?.phone.includes(q);
      const notesMatch = o.notes?.toLowerCase().includes(q);
      if (!idMatch && !nameMatch && !phoneMatch && !notesMatch) return false;
    }

    if (dateFilter !== 'all') {
      const orderDate = new Date(o.created_at);
      const now = new Date();
      if (dateFilter === 'today' && orderDate.toDateString() !== now.toDateString()) return false;
      if (dateFilter === 'month' && (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear())) return false;
    }

    if (statusFilter !== 'all' && o.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + pageSize);

  const exportCSV = () => {
    const header = 'ID,Cliente,Telefono,Direccion,Total,Estado,Fecha\n';
    const rows = filteredOrders.map((o) => {
      const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
      return `"${shortId}","${o.customer?.name ?? 'Anónimo'}","${o.customer?.phone ?? ''}","${o.delivery_address ?? ''}",${o.total},"${ORDER_STATUS_LABELS[o.status]}","${new Date(o.created_at).toLocaleString('es-CO')}"`;
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
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Historial General" subtitle="Registro inmutable de pedidos entregados y cancelados" />

      <div className="flex-1 flex flex-col min-h-0 p-5 lg:p-8 space-y-5 z-10 relative overflow-y-auto">

        {/* Banner de Advertencia y Política de Retención 3 Meses */}
        <div className="p-4 rounded-3xl border bg-amber-500/10 border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-[var(--text-primary)]">
                Registro Histórico y Auditoría: Conservación por 3 Meses (90 Días)
              </p>
              <p className="text-[11px] font-bold text-[var(--text-muted)] mt-0.5">
                Los pedidos finalizados se preservan 90 días para auditoría contable y reportes. Transcurrido este plazo, los registros antiguos son depurados automáticamente.
              </p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="text-xs font-black px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-all cursor-pointer shrink-0"
          >
            📥 Respaldar / Exportar CSV
          </button>
        </div>

        {/* Filters & Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between animate-fade-in-up">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por ID, Cliente, Teléfono o nota..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full text-xs font-semibold pl-11 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                className="pl-9 pr-8 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todas las fechas</option>
                <option value="today">Hoy</option>
                <option value="month">Este mes</option>
              </select>
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="pl-9 pr-8 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todos los estados</option>
                <option value="delivered">🎉 Entregados</option>
                <option value="cancelled">❌ Cancelados</option>
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${viewMode === 'table' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                title="Vista Tabla"
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--orange)] text-white' : 'text-[var(--text-muted)]'}`}
                title="Vista Cuadrícula Tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={exportCSV}
              className="px-4 py-3 rounded-2xl border text-xs font-black hover:bg-[var(--bg-input)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <Download className="w-4 h-4 text-[var(--orange)]" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value={5}>5 / pág</option>
              <option value={10}>10 / pág</option>
              <option value={25}>25 / pág</option>
              <option value={50}>50 / pág</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        {paginatedOrders.length === 0 ? (
          <div className="card p-14 text-center space-y-3">
            <FileText className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No hay registros en el historial</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Prueba ajustando los filtros de búsqueda o fecha</p>
          </div>
        ) : viewMode === 'table' ? (
          /* ─── TABLE VIEW ─── */
          <div className="bg-[var(--bg-card)] rounded-3xl border shadow-sm flex flex-col overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[var(--bg-input)] border-b sticky top-0 z-20 backdrop-blur-md" style={{ borderColor: 'var(--border)' }}>
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">ID Pedido</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Cliente</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Estado</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Fecha & Hora</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {paginatedOrders.map((order) => {
                    const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
                    const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;

                    return (
                      <tr key={order.id} className="hover:bg-[var(--bg-input)] transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-xs font-black text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30 shadow-sm">
                            {orderNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[var(--text-primary)]">{order.customer?.name || 'Anónimo'}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">{order.customer?.phone}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                            order.status === 'delivered' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-[var(--text-primary)]">{formatCurrency(order.total)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[var(--text-primary)]">{new Date(order.created_at).toLocaleString('es-CO')}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">Hace {formatTimeAgo(order.created_at)}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-2 rounded-xl border hover:bg-[var(--bg-card)] transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            <Eye className="w-3.5 h-3.5 text-[var(--orange)]" />
                            <span>Ver</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ─── GRID CARDS VIEW (SIMETRÍA SaaS 3D) ─── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in-up">
            {paginatedOrders.map((order) => {
              const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
              const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;
              const isDelivered = order.status === 'delivered';

              return (
                <div
                  key={order.id}
                  className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 ${
                    isDelivered
                      ? 'border-[var(--border)] hover:border-emerald-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                      : 'border-rose-500/30 hover:border-rose-500/50'
                  }`}
                  style={{ background: 'var(--bg-card)' }}
                >
                  {/* Header Gradient */}
                  <div
                    className="relative h-20 overflow-hidden flex items-end px-5 pb-3"
                    style={{
                      background: isDelivered
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.03) 100%)'
                        : 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.03) 100%)',
                    }}
                  >
                    <div className="relative z-10 flex items-center justify-between w-full">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30">
                        {orderNumber}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        isDelivered
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex flex-col flex-1 p-5 pt-3 space-y-4">
                    <div>
                      <h3 className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>
                        {order.customer?.name || 'Cliente Anónimo'}
                      </h3>
                      <p className="text-xs font-semibold flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        <Phone className="w-3 h-3 text-[var(--orange)] shrink-0" />
                        {order.customer?.phone || 'Sin teléfono'}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl border flex items-center justify-between" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Pedido</p>
                        <p className="text-base font-black mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatCurrency(order.total)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Fecha</p>
                        <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {new Date(order.created_at).toLocaleDateString('es-CO')}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--orange)]" />
                      <span>Ver Detalle del Pedido</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
            Mostrando {filteredOrders.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filteredOrders.length)} de {filteredOrders.length} registros
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={safePage <= 1}
              className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black px-3" style={{ color: 'var(--text-primary)' }}>
              Página {safePage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={safePage >= totalPages}
              className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* Modal Detalle de Pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-lg rounded-2xl sm:rounded-3xl border shadow-2xl animate-fade-in-up flex flex-col max-h-[88dvh] sm:max-h-[92vh] overflow-hidden my-auto bg-[var(--bg-card)] border-[var(--border)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 sm:py-5 shrink-0 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-xs font-black uppercase text-[var(--orange)] bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/30">
                  {selectedOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${selectedOrder.id.slice(0, 6).toUpperCase()}`}
                </span>
                <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>
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
                <p className="text-xs font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <User className="w-4 h-4 text-[var(--orange)]" /> {selectedOrder.customer?.name || 'Anónimo'}
                </p>
                {selectedOrder.customer?.phone && (
                  <p className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <Phone className="w-3.5 h-3.5 text-[var(--orange)]" /> {selectedOrder.customer.phone}
                  </p>
                )}
                {selectedOrder.delivery_address && (
                  <p className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <MapPin className="w-3.5 h-3.5 text-[var(--orange)] shrink-0" /> {selectedOrder.delivery_address}
                  </p>
                )}
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Items del Pedido</p>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {item.quantity}x {item.product?.name || (item as any).name || 'Producto'}
                      </span>
                      <span className="text-xs font-black text-[var(--orange)]">{formatCurrency(item.unit_price * item.quantity)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Sin desglose detallado de items.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--bg-card)] flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>Método de Pago</span>
                <span className="text-xs font-black uppercase text-[var(--text-primary)]">{selectedOrder.payment_method}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>Total Pagado</span>
                <span className="text-base font-black text-[var(--orange)]">{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
