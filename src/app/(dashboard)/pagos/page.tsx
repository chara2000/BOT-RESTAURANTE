'use client';

import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@/types';
import { createClient } from '@/lib/supabase/client';

export default function PagosPage() {
  const { orders } = useAppData();
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const supabase = createClient();

  // Filtrar solo las órdenes por transferencia pendientes
  const pendingOrders = orders.filter(
    o => o.payment_method === 'transfer' && o.status !== 'delivered' && o.status !== 'cancelled'
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const extractReceiptUrl = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/\[COMPROBANTE:\s(https:\/\/[^\]]+)\]/);
    return match ? match[1] : null;
  };

  const handleUpdatePaymentStatus = async (orderId: string, action: 'approve' | 'reject') => {
    const newStatus = action === 'approve' ? 'paid' : 'failed';
    const newNotesAdd = action === 'approve' ? ' | [PAGO APROBADO]' : ' | [PAGO RECHAZADO]';
    
    // Obtener la orden actual para actualizar sus notas
    const order = orders.find(o => o.id === orderId);
    const updatedNotes = (order?.notes || '') + newNotesAdd;

    try {
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: newStatus, notes: updatedNotes }),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      
      // La actualización en tiempo real actualizará el contexto
    } catch (err) {
      console.error('Error actualizando pago:', err);
      alert('Error al actualizar el pago.');
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-emerald-500 opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />
      <Topbar title="Registro de Pagos" subtitle="Validación manual de transferencias y comprobantes" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative custom-scrollbar">
        <div className="card bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
               <CheckCircle className="w-5 h-5" />
            </div>
            <p className="text-lg font-black text-[var(--text-primary)]">Transferencias Recientes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-black">
                  <th className="pb-3 px-4">Pedido / Fecha</th>
                  <th className="pb-3 px-4">Cliente</th>
                  <th className="pb-3 px-4">Monto</th>
                  <th className="pb-3 px-4">Estado Pago</th>
                  <th className="pb-3 px-4 text-center">Comprobante</th>
                  <th className="pb-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm font-semibold divide-y divide-[var(--border)]">
                {pendingOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                      No hay transferencias pendientes de revisión.
                    </td>
                  </tr>
                ) : (
                  pendingOrders.map(order => {
                    const receiptUrl = extractReceiptUrl(order.notes);
                    const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0,6).toUpperCase()}`;
                    const isApproved = order.notes?.includes('[PAGO APROBADO]') || order.payment_status === 'paid';
                    const isRejected = order.notes?.includes('[PAGO RECHAZADO]') || order.payment_status === 'failed';

                    return (
                      <tr key={order.id} className="hover:bg-[var(--bg-input)] transition-colors">
                        <td className="py-4 px-4">
                          <p className="text-[var(--orange)] font-black uppercase tracking-wider">{shortId}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{new Date(order.created_at).toLocaleString('es-CO')}</p>
                        </td>
                        <td className="py-4 px-4">{order.customer?.name || 'Cliente'}</td>
                        <td className="py-4 px-4 font-black">{formatCurrency(order.total)}</td>
                        <td className="py-4 px-4">
                          {isApproved ? (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500">Aprobado</span>
                          ) : isRejected ? (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-red-500/10 text-red-500">Rechazado</span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500">Pendiente</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {receiptUrl ? (
                            <button onClick={() => setSelectedReceipt(receiptUrl)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:ring-2 ring-[var(--orange-soft)] transition-all text-xs font-bold text-[var(--orange)]">
                              <ImageIcon className="w-3.5 h-3.5" /> Ver Foto
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] italic">Sin imagen</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right space-x-2">
                          {!isApproved && !isRejected && (
                            <>
                              <button onClick={() => handleUpdatePaymentStatus(order.id, 'approve')} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors" title="Aprobar Pago">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleUpdatePaymentStatus(order.id, 'reject')} className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors" title="Rechazar Pago">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
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
      </div>

      {/* Modal Visor de Comprobante */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedReceipt(null)}>
          <div className="relative max-w-2xl w-full max-h-[90vh] bg-[var(--bg-card)] p-2 rounded-3xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedReceipt(null)} className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/80 rounded-full transition-all">
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
