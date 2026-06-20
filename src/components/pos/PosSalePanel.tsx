'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingCart, Trash2, Utensils, Tag, Info } from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { createOrderViaN8n } from '@/services/n8n';
import { formatCurrency } from '@/lib/utils';
import type { OrderType, PaymentMethod, Product } from '@/types';

interface CartLine {
  product: Product;
  quantity: number;
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'nequi', 'daviplata', 'wompi'];
const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: 'dine_in', label: 'En mesa', icon: '🍽️' },
  { value: 'pickup', label: 'Para llevar', icon: '🛍️' },
  { value: 'delivery', label: 'Domicilio', icon: '🛵' },
];

export function PosSalePanel() {
  const { products, customers, addOrder, addCashTransaction, cashSession } = useAppData();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerId, setCustomerId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const available = products.filter((p) => p.is_available);
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );
  const deliveryFee = orderType === 'delivery' ? 5000 : 0;
  const total = subtotal + deliveryFee;

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  };

  const clearCart = () => setCart([]);

  const handleCheckout = async () => {
    if (!cart.length || cashSession.status !== 'open') return;
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        order: {
          type: orderType,
          payment_method: paymentMethod,
          customer_id: customerId || undefined,
          subtotal,
          delivery_fee: deliveryFee,
          tips: 0,
          total,
          delivery_address: orderType === 'delivery' ? deliveryAddress : undefined,
          notes: notes || undefined,
        },
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.product.price,
        })),
      };

      const result = await createOrderViaN8n(payload);
      if (result.order) addOrder(result.order);
      await addCashTransaction('income', total, `Venta POS - ${cart.length} item(s)`);
      clearCart();
      setNotes('');
      setMessage(`Pedido creado vía ${result.source ?? 'n8n'} · ${formatCurrency(total)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear pedido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card flex flex-col bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-app)] border-0 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--orange)] to-orange-400 shadow-[0_0_15px_var(--orange-glow)] text-white">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-base text-[var(--text-primary)]">Terminal POS</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Módulo de Ventas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cashSession.status === 'open' ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Caja Lista
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Caja Cerrada
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: 'var(--border)' }}>
        {/* Catálogo de Productos */}
        <div className="lg:col-span-7 p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Utensils className="h-4 w-4 text-[var(--orange)]" />
            <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Menú Disponible</h4>
          </div>
          <div className="flex-1 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {available.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="group relative flex flex-col text-left p-4 rounded-2xl border transition-all duration-300 hover:shadow-[0_8px_20px_var(--orange-glow)] hover:-translate-y-1 bg-[var(--bg-input)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--orange)] to-transparent opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity" />
                  <div className="flex-1">
                    <p className="text-sm font-black text-[var(--text-primary)] leading-tight">{p.name}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Tag className="h-3 w-3 text-[var(--text-muted)]" />
                      <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>{p.category}</p>
                    </div>
                  </div>
                  <div className="mt-4 inline-block px-3 py-1 rounded-lg bg-[var(--bg-card)] border shadow-sm group-hover:bg-[var(--orange)] group-hover:border-[var(--orange)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-black group-hover:text-white transition-colors" style={{ color: 'var(--orange)' }}>{formatCurrency(p.price)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Panel de Carrito */}
        <div className="lg:col-span-5 flex flex-col bg-[var(--bg-card)]">
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[var(--orange)]" />
                Pedido Actual
                <span className="bg-[var(--orange)] text-white text-[10px] px-2 py-0.5 rounded-full shadow-[0_0_8px_var(--orange-glow)]">{cart.length}</span>
              </h4>
              {cart.length > 0 && (
                <button type="button" onClick={clearCart} className="text-[10px] font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors">
                  <Trash2 className="h-3 w-3" /> Vaciar
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2.5 min-h-[150px]">
              {cart.map((line) => (
                <div key={line.product.id} className="flex items-center gap-3 p-3 rounded-xl border bg-[var(--bg-input)] hover:border-[var(--orange)] transition-colors group" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{line.product.name}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--orange)' }}>{formatCurrency(line.product.price)} c/u</p>
                  </div>
                  
                  <div className="flex items-center gap-1 bg-[var(--bg-card)] rounded-lg p-1 border shadow-sm" style={{ borderColor: 'var(--border)' }}>
                    <button type="button" onClick={() => updateQty(line.product.id, -1)} className="p-1.5 rounded-md hover:bg-rose-500/10 hover:text-rose-500 text-[var(--text-muted)] transition-colors">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black">{line.quantity}</span>
                    <button type="button" onClick={() => updateQty(line.product.id, 1)} className="p-1.5 rounded-md hover:bg-emerald-500/10 hover:text-emerald-500 text-[var(--text-muted)] transition-colors">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  
                  <div className="w-20 text-right">
                    <p className="text-xs font-black text-[var(--text-primary)]">{formatCurrency(line.product.price * line.quantity)}</p>
                  </div>
                </div>
              ))}
              {!cart.length && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-50">
                  <div className="w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'var(--text-muted)' }}>
                    <ShoppingCart className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>El carrito está vacío<br/>Selecciona productos del menú</p>
                </div>
              )}
            </div>

            {/* Opciones del Pedido */}
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tipo de Pedido</label>
                  <div className="relative">
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border appearance-none focus:ring-2 focus:ring-[var(--orange-soft)] outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                      {ORDER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pago</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border uppercase appearance-none focus:ring-2 focus:ring-[var(--orange-soft)] outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cliente</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border appearance-none focus:ring-2 focus:ring-[var(--orange-soft)] outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <option value="">Consumidor Final (Sin asignar)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {orderType === 'delivery' && (
                <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Dirección de entrega (requerida para domicilios)"
                  className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
              )}

              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas o instrucciones especiales"
                className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
            </div>
          </div>

          {/* Totales y Botón de Pago */}
          <div className="p-5 border-t bg-[var(--bg-card)] rounded-br-2xl" style={{ borderColor: 'var(--border)' }}>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-xs font-bold text-[var(--orange)]">
                  <span>Costo Domicilio</span>
                  <span>+{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span>Total a Cobrar</span>
                <span className="text-[var(--text-primary)]">{formatCurrency(total)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!cart.length || loading || cashSession.status !== 'open'}
              onClick={handleCheckout}
              className="group relative w-full flex items-center justify-center gap-2 text-sm font-black py-4 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_8px_20px_var(--orange-glow)] overflow-hidden"
              style={{ background: 'var(--orange)' }}
            >
              <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              {loading ? (
                'Procesando Pedido...'
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  Confirmar e Imprimir
                </>
              )}
            </button>

            {cashSession.status !== 'open' && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold">La caja está cerrada. Debes iniciar la jornada para registrar nuevas ventas en el sistema.</p>
              </div>
            )}
            {message && (
              <p className={`mt-3 text-[10px] text-center font-black p-2 rounded-lg border ${message.startsWith('Pedido') ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
