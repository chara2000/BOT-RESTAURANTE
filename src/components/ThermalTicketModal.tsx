'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Order, TenantSettings } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface ThermalTicketModalProps {
  order: Order;
  settings?: Partial<TenantSettings>;
  onClose: () => void;
}

export function ThermalTicketModal({ order, settings, onClose }: ThermalTicketModalProps) {
  const handlePrint = () => {
    window.print();
  };

  const shortId = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${order.id.slice(0, 6).toUpperCase()}`;
  const dateStr = new Date(order.created_at).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      {/* Estilos para impresión aislada (solo imprime el ticket) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-ticket-print, #thermal-ticket-print * {
            visibility: visible !important;
          }
          #thermal-ticket-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            color: #000 !important;
            font-family: monospace !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-input)]">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[var(--orange)]" />
            <h3 className="text-sm font-black text-[var(--text-primary)]">Comanda / Ticket Térmico</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ticket Content Area (Imprimible) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-black bg-white" id="thermal-ticket-print">
          {/* Logo / Encabezado */}
          <div className="text-center border-b border-dashed border-gray-400 pb-3 space-y-1">
            <h2 className="font-black text-xl tracking-tight uppercase">{settings?.restaurant_name || 'CHEF FLOW'}</h2>
            <p className="text-xs text-gray-600 font-mono">=== COMANDA DE COCINA ===</p>
            <p className="text-[11px] text-gray-500 font-mono">{dateStr}</p>
          </div>

          {/* Info Pedido */}
          <div className="text-xs font-mono border-b border-dashed border-gray-400 pb-3 space-y-1">
            <p className="font-bold text-sm">PEDIDO: <span className="text-lg font-black">{shortId}</span></p>
            <p><strong>TIPO:</strong> {order.type === 'delivery' ? '🛵 DOMICILIO' : order.type === 'pickup' ? '🏪 PARA RECOGER' : '🍽️ EN MESA'}</p>
            <p><strong>CLIENTE:</strong> {order.customer?.name || 'Cliente'}</p>
            {order.customer?.phone && <p><strong>TEL:</strong> {order.customer.phone}</p>}
            {order.delivery_address && <p><strong>DIRECCIÓN:</strong> {order.delivery_address}</p>}
            <p><strong>PAGO:</strong> {order.payment_method?.toUpperCase() || 'EFECTIVO'}</p>
          </div>

          {/* Ítems del Pedido */}
          <div className="text-xs font-mono space-y-2 border-b border-dashed border-gray-400 pb-3">
            <div className="flex justify-between font-bold border-b border-gray-200 pb-1 text-[11px]">
              <span>CANT / PRODUCTO</span>
              <span>VALOR</span>
            </div>
            {order.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-bold text-sm">
                  <span>{item.quantity}x {item.product.name}</span>
                  <span>{formatCurrency(item.unit_price * item.quantity)}</span>
                </div>
                {item.notes && (
                  <p className="text-[11px] font-semibold text-gray-700 italic pl-3">
                    📝 Nota: {item.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="text-xs font-mono space-y-1 pt-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex justify-between">
                <span>Domicilio:</span>
                <span>{formatCurrency(order.delivery_fee)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base border-t border-black pt-1 mt-1">
              <span>TOTAL:</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Notas Generales */}
          {order.notes && (
            <div className="text-[11px] font-mono border-t border-dashed border-gray-400 pt-2 text-gray-800">
              <strong>NOTAS GENERALES:</strong>
              <p className="mt-0.5 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          <div className="text-center text-[10px] font-mono border-t border-dashed border-gray-400 pt-2 text-gray-500">
            ¡Gracias por tu compra! 🍔
          </div>
        </div>

        {/* Action Bar */}
        <div className="p-4 bg-[var(--bg-input)] border-t border-[var(--border)] flex gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 py-3 rounded-2xl bg-[var(--orange)] hover:bg-[var(--orange-dark)] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[var(--orange)]/30 transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" /> Imprimir Ticket
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl border border-[var(--border)] text-[var(--text-primary)] font-bold text-sm hover:bg-[var(--bg-card)] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
