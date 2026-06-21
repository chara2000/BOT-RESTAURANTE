'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { CheckCircle, XCircle, Image as ImageIcon, Clock, AlertCircle, RefreshCw, Layers, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Order, PaymentMethod } from '@/types';

export default function PagosPage() {
  const { orders, updateOrderStatus, cashSession } = useAppData();
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pos' | 'caja'>('pos');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');

  // Filter orders to only the last 7 days (one week)
  const oneWeekAgo = Date.now() - 7 * 86400000;
  const recentOrders = orders.filter((o) => new Date(o.created_at).getTime() >= oneWeekAgo);

  // Group orders for "Terminal POS" tab
  const posOrders = recentOrders.filter(
    (o) => selectedMethod === 'all' || o.payment_method === selectedMethod
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Filter pending transfers for validation
  const pendingTransfers = recentOrders.filter(
    (o) => o.payment_method === 'transfer' && o.status === 'pending'
  );

  const extractReceiptUrl = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/\[COMPROBANTE:\s(https:\/\/[^\]]+)\]/);
    return match ? match[1] : null;
  };

  const handleUpdatePaymentStatus = async (order: Order, action: 'approve' | 'reject') => {
    setProcessing(order.id);
    const newStatus = action === 'approve' ? 'confirmed' : 'cancelled';
    const noteTag = action === 'approve' ? ' | [PAGO APROBADO]' : ' | [PAGO RECHAZADO]';
    const updatedNotes = (order.notes ?? '') + noteTag;

    try {
      const res = await fetch(`/api/orders/${order.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: action === 'approve' ? 'paid' : 'failed', notes: updatedNotes }),
      });
      if (!res.ok) throw new Error('Error al actualizar');

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


  const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    wompi: 'Wompi',
    transfer: 'Transferencia',
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-emerald-500 opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />
      <Topbar title="Registro de Pagos" subtitle="Historial de transacciones y conciliación de caja" />

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
            <CreditCard className="w-4 h-4" /> Terminal POS
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

      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative custom-scrollbar">
        {actionMsg && (
          <div className={`mb-4 flex items-center gap-3 p-4 rounded-2xl border font-bold text-sm animate-fade-in-up ${actionMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {actionMsg.text}
          </div>
        )}

        {activeTab === 'pos' && (
          <div className="space-y-6">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider mr-2" style={{ color: 'var(--text-muted)' }}>Filtrar Pago:</span>
              <button 
                onClick={() => setSelectedMethod('all')}
                className="text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer"
                style={{ 
                  background: selectedMethod === 'all' ? 'var(--orange)' : 'var(--bg-input)', 
                  color: selectedMethod === 'all' ? '#fff' : 'var(--text-muted)',
                  borderColor: selectedMethod === 'all' ? 'var(--orange)' : 'var(--border)'
                }}
              >
                Todos
              </button>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                <button 
                  key={method}
                  onClick={() => setSelectedMethod(method)}
                  className="text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer"
                  style={{ 
                    background: selectedMethod === method ? 'var(--orange)' : 'var(--bg-input)', 
                    color: selectedMethod === method ? '#fff' : 'var(--text-muted)',
                    borderColor: selectedMethod === method ? 'var(--orange)' : 'var(--border)'
                  }}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>

            {/* Desktop View */}
            <div className="card bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden hidden md:block">
              <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-[var(--text-primary)]">Historial de Pagos (Última Semana)</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Se muestran registros ordenados por fecha</p>
                </div>
                {pendingTransfers.length > 0 && (
                  <span className="ml-auto text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                    {pendingTransfers.length} Transf. Pendientes
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
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
                    {posOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                          Sin registros de pago de esta semana para el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      posOrders.map((order) => {
                        const receiptUrl = extractReceiptUrl(order.notes);
                        const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
                        const isApproved = order.status === 'delivered' || order.status === 'confirmed' || order.status === 'ready' || order.status === 'shipping' || order.status === 'preparing';
                        const isRejected = order.status === 'cancelled';
                        const isProc = processing === order.id;

                        return (
                          <tr key={order.id} className="hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-4 px-6">
                              <p className="font-black uppercase tracking-wider" style={{ color: 'var(--orange)' }}>{shortId}</p>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleString('es-CO')}</p>
                            </td>
                            <td className="py-4 px-6">{order.customer?.name ?? 'Cliente Mostrador'}</td>
                            <td className="py-4 px-6 font-black">{formatCurrency(order.total)}</td>
                            <td className="py-4 px-6 uppercase text-xs text-[var(--text-muted)] font-black">{PAYMENT_METHOD_LABELS[order.payment_method]}</td>
                            <td className="py-4 px-6">
                              {isApproved ? (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Aprobado</span>
                              ) : isRejected ? (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">Rechazado</span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">Pendiente</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-center">
                              {receiptUrl ? (
                                <button onClick={() => setSelectedReceipt(receiptUrl)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:ring-2 ring-[var(--orange-soft)] transition-all text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--orange)' }}>
                                  <ImageIcon className="w-3.5 h-3.5" /> Ver Foto
                                </button>
                              ) : (
                                <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Sin comprobante</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              {(['nequi', 'daviplata', 'wompi', 'card', 'transfer'] as const).includes(order.payment_method as any) && order.status === 'pending' ? (
                                <div className="flex gap-2 justify-end">
                                  <button
                                    disabled={isProc}
                                    onClick={() => handleUpdatePaymentStatus(order, 'approve')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-black text-xs cursor-pointer hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {isProc ? '...' : 'Aprobar'}
                                  </button>
                                  <button
                                    disabled={isProc}
                                    onClick={() => handleUpdatePaymentStatus(order, 'reject')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/30 font-black text-xs cursor-pointer hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    {isProc ? '...' : 'Rechazar'}
                                  </button>
                                </div>
                              ) : isApproved ? (
                                <span className="flex items-center gap-1.5 justify-end text-xs font-bold text-emerald-500">
                                  <CheckCircle className="w-3.5 h-3.5" /> Completado
                                </span>
                              ) : isRejected ? (
                                <span className="flex items-center gap-1.5 justify-end text-xs font-bold text-red-500">
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
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
              {posOrders.map((order) => {
                const receiptUrl = extractReceiptUrl(order.notes);
                const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
                const isApproved = order.status === 'delivered' || order.status === 'confirmed' || order.status === 'ready' || order.status === 'shipping' || order.status === 'preparing';
                const isRejected = order.status === 'cancelled';
                const isProc = processing === order.id;

                return (
                  <div key={order.id} className="card p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-sm uppercase text-[var(--orange)]">{shortId}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                        isApproved ? 'bg-emerald-500/10 text-emerald-500' : isRejected ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>{isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p style={{ color: 'var(--text-muted)' }}>{order.customer?.name ?? 'Cliente Mostrador'}</p>
                        <p className="font-black text-sm">{formatCurrency(order.total)}</p>
                      </div>
                      <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{PAYMENT_METHOD_LABELS[order.payment_method]}</p>
                    </div>
                    {receiptUrl && (
                      <button onClick={() => setSelectedReceipt(receiptUrl)} className="w-full flex justify-center items-center gap-1.5 py-2 rounded-xl text-xs font-bold border cursor-pointer" style={{ color: 'var(--orange)', borderColor: 'var(--border)' }}>
                        <ImageIcon className="w-4 h-4" /> Comprobante
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
              })}
            </div>
          </div>
        )}

        {activeTab === 'caja' && (
          <div className="space-y-6">
            {/* Cash Session Status Card */}
            <div className="card p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sesión de Caja</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${cashSession.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <p className="text-lg font-black capitalize">{cashSession.status === 'open' ? 'Abierta' : 'Cerrada'}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cajero Responsable</p>
                <p className="text-base font-bold mt-1 text-[var(--text-primary)]">{cashSession.opened_by || 'Sin cajero'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Balance de Apertura</p>
                <p className="text-base font-bold mt-1 text-[var(--text-primary)]">{formatCurrency(cashSession.opening_balance)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Apertura Registrada</p>
                <p className="text-xs font-bold mt-1 text-[var(--text-muted)]">{new Date(cashSession.opened_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Cash Transactions List */}
            <div className="card bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--orange)]">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-[var(--text-primary)]">Movimientos de Caja (Última Semana)</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Ingresos y egresos realizados dentro de la caja registradora</p>
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
                    {cashSession.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                          Sin transacciones de caja registradas esta semana.
                        </td>
                      </tr>
                    ) : (
                      cashSession.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-4 px-6 font-black uppercase text-xs" style={{ color: 'var(--text-muted)' }}>#{tx.id.slice(-6)}</td>
                          <td className="py-4 px-6">{tx.description}</td>
                          <td className="py-4 px-6">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                              tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                            }`}>{tx.type === 'income' ? 'Ingreso' : 'Egreso'}</span>
                          </td>
                          <td className={`py-4 px-6 font-black ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </td>
                          <td className="py-4 px-6 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedReceipt(null)}>
          <div className="relative max-w-2xl w-full max-h-[90vh] mx-4 bg-[var(--bg-card)] p-2 rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedReceipt(null)} className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/80 rounded-full transition-all cursor-pointer">
              <XCircle className="w-8 h-8" />
            </button>
            <div className="flex-1 overflow-hidden rounded-2xl bg-black/10 flex items-center justify-center">
              <img src={selectedReceipt} alt="Comprobante de Pago" className="max-w-full max-h-[85vh] object-contain rounded-2xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
