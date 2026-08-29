'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Minus, Plus, ShoppingCart, Trash2, Tag, Info, Search, User, UserPlus, Phone, MapPin, Check, X, ChevronDown, Sparkles } from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { createOrderViaN8n } from '@/services/n8n';
import { customersService } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import type { Customer, OrderType, PaymentMethod, Product } from '@/types';

interface CartLine {
  product: Product;
  quantity: number;
  notes?: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'nequi', 'daviplata', 'wompi'];
const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: 'dine_in', label: 'En mesa', icon: '🍽️' },
  { value: 'pickup', label: 'Para llevar', icon: '🛍️' },
  { value: 'delivery', label: 'Domicilio', icon: '🛵' },
];

export function PosSalePanel() {
  const { products, customers, addOrder, addCashTransaction, cashSession, activeTenantId } = useAppData();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  
  // Customer selection states
  const [customerId, setCustomerId] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('Consumidor Final (Sin asignar)');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [posSearch, setPosSearch] = useState('');

  // Close customer dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const available = products.filter((p) => p.is_available);
  const filteredAvailable = useMemo(
    () => posSearch.trim()
      ? available.filter(p =>
          p.name.toLowerCase().includes(posSearch.toLowerCase()) ||
          (p.category ?? '').toLowerCase().includes(posSearch.toLowerCase())
        )
      : available,
    [available, posSearch]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearchText.trim()) return customers.slice(0, 8);
    const q = customerSearchText.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [customers, customerSearchText]);

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
      return [...prev, { product, quantity: 1, notes: '' }];
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

  const updateItemNotes = (productId: string, itemNotes: string) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, notes: itemNotes } : l
      )
    );
  };

  const clearCart = () => setCart([]);

  const handleSelectExistingCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerDisplayName(c.name);
    if (c.address_default && (orderType === 'delivery' || !deliveryAddress)) {
      setDeliveryAddress(c.address_default);
    }
    setIsCustomerDropdownOpen(false);
    setCustomerSearchText('');
  };

  const handleSelectQuickName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomerId(trimmed);
    setCustomerDisplayName(trimmed);
    setIsCustomerDropdownOpen(false);
    setCustomerSearchText('');
  };

  const handleClearCustomer = () => {
    setCustomerId('');
    setCustomerDisplayName('Consumidor Final (Sin asignar)');
    setIsCustomerDropdownOpen(false);
    setCustomerSearchText('');
  };

  const handleOpenNewCustomerModal = () => {
    setNewCustName(customerSearchText.trim());
    setNewCustPhone('');
    setNewCustAddress('');
    setIsCustomerDropdownOpen(false);
    setIsNewCustomerModalOpen(true);
  };

  const handleSaveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    setIsSavingCustomer(true);
    try {
      const created = await customersService.create({
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        address_default: newCustAddress.trim() || undefined,
      }, activeTenantId);

      setCustomerId(created.id);
      setCustomerDisplayName(created.name);
      if (created.address_default) {
        setDeliveryAddress(created.address_default);
      }
      setIsNewCustomerModalOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      setCustomerSearchText('');
    } catch (err) {
      // Fallback to quick name if DB create fails
      handleSelectQuickName(newCustName.trim());
      if (newCustAddress.trim()) setDeliveryAddress(newCustAddress.trim());
      setIsNewCustomerModalOpen(false);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleCheckout = async () => {
    if (!cart.length || cashSession.status !== 'open') return;
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        order: {
          tenant_id: activeTenantId,
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
          notes: l.notes || undefined,
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
    <div className="card rounded-2xl border overflow-hidden shadow-lg" style={{ borderColor: 'var(--border)' }}>
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: 'var(--border)' }}>
        
        {/* Catálogo de Productos */}
        <div className="lg:col-span-7 p-5 space-y-4 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--orange)]" /> Catálogo Rápido
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {available.length} disponibles
            </span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Buscar platillo o categoría..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs font-semibold border outline-none focus:ring-2 focus:ring-[var(--orange)] transition-all"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="max-h-[520px] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredAvailable.length === 0 ? (
                <p className="col-span-3 text-center py-8 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Sin resultados para &quot;{posSearch}&quot;</p>
              ) : filteredAvailable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="group relative flex flex-col text-left p-4 rounded-2xl border transition-all duration-300 hover:shadow-[0_8px_20px_var(--orange-glow)] hover:-translate-y-1 bg-[var(--bg-input)] cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--orange)] to-transparent opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity" />
                  <div className="flex-1">
                    <p className="text-sm font-black text-[var(--text-primary)] leading-tight">{p.name}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Tag className="h-3 w-3 text-[var(--text-muted)]" />
                      <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>{p.category}</p>
                    </div>
                  </div>
                  {/* Fixed price tag styling with crisp white text on orange hover */}
                  <div className="mt-4 inline-block px-3 py-1 rounded-lg bg-[var(--bg-card)] border shadow-sm group-hover:!bg-[var(--orange)] group-hover:!border-[var(--orange)] transition-all" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-black text-[var(--orange)] group-hover:!text-white transition-colors">{formatCurrency(p.price)}</p>
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
                <button type="button" onClick={clearCart} className="text-[10px] font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer">
                  <Trash2 className="h-3 w-3" /> Vaciar
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2.5 min-h-[150px] max-h-[320px] overflow-y-auto">
              {cart.map((line) => (
                <div key={line.product.id} className="flex flex-col gap-1.5 p-3 rounded-xl border bg-[var(--bg-input)] hover:border-[var(--orange)] transition-colors group" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{line.product.name}</p>
                      <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--orange)' }}>{formatCurrency(line.product.price)} c/u</p>
                    </div>
                    
                    <div className="flex items-center gap-1 bg-[var(--bg-card)] rounded-lg p-1 border shadow-sm" style={{ borderColor: 'var(--border)' }}>
                      <button type="button" onClick={() => updateQty(line.product.id, -1)} className="p-1.5 rounded-md hover:bg-rose-500/10 hover:text-rose-500 text-[var(--text-muted)] transition-colors cursor-pointer">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-black">{line.quantity}</span>
                      <button type="button" onClick={() => updateQty(line.product.id, 1)} className="p-1.5 rounded-md hover:bg-emerald-500/10 hover:text-emerald-500 text-[var(--text-muted)] transition-colors cursor-pointer">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    
                    <div className="w-20 text-right">
                      <p className="text-xs font-black text-[var(--text-primary)]">{formatCurrency(line.product.price * line.quantity)}</p>
                    </div>
                  </div>

                  {/* Campo de adiciones / notas por platillo */}
                  <input
                    type="text"
                    placeholder="➕ Adición / Sin cebolla / Salsa aparte..."
                    value={line.notes || ''}
                    onChange={(e) => updateItemNotes(line.product.id, e.target.value)}
                    className="w-full text-[10px] font-semibold px-2 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-[var(--orange)]"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
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
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border appearance-none focus:ring-2 focus:ring-[var(--orange-soft)] outline-none cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      {ORDER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pago</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border uppercase appearance-none focus:ring-2 focus:ring-[var(--orange-soft)] outline-none cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selector de Cliente Avanzado con Buscador y Creación Rápida */}
              <div className="space-y-1.5 relative" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cliente</label>
                  {customerId && (
                    <button
                      type="button"
                      onClick={handleClearCustomer}
                      className="text-[10px] font-bold text-[var(--orange)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Limpiar
                    </button>
                  )}
                </div>

                {/* Dropdown trigger button */}
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border flex items-center justify-between transition-colors text-left cursor-pointer hover:border-[var(--orange)]"
                  style={{ background: 'var(--bg-input)', borderColor: isCustomerDropdownOpen ? 'var(--orange)' : 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <span className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 text-[var(--orange)] shrink-0" />
                    <span className="truncate">{customerDisplayName}</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform shrink-0 ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {isCustomerDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border shadow-2xl animate-fade-in-up p-3 space-y-2.5"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        autoFocus
                        value={customerSearchText}
                        onChange={(e) => setCustomerSearchText(e.target.value)}
                        placeholder="Buscar por nombre o teléfono..."
                        className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold border outline-none focus:ring-2 focus:ring-[var(--orange)]"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                      {customerSearchText && (
                        <button
                          type="button"
                          onClick={() => setCustomerSearchText('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Customer List */}
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {/* Option 1: Consumidor final */}
                      <button
                        type="button"
                        onClick={handleClearCustomer}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between hover:bg-[var(--bg-input)] cursor-pointer"
                        style={{ color: !customerId ? 'var(--orange)' : 'var(--text-primary)' }}
                      >
                        <span>👤 Consumidor Final (Sin asignar)</span>
                        {!customerId && <Check className="w-3.5 h-3.5 text-[var(--orange)]" />}
                      </button>

                      {/* Filtered existing customers */}
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectExistingCustomer(c)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-between hover:bg-[var(--bg-input)] group cursor-pointer"
                          style={{ color: customerId === c.id ? 'var(--orange)' : 'var(--text-primary)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-black truncate">{c.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                              {c.phone && <span><Phone className="w-2.5 h-2.5 inline" /> {c.phone}</span>}
                              {c.address_default && <span className="truncate">· {c.address_default}</span>}
                            </p>
                          </div>
                          {customerId === c.id && <Check className="w-3.5 h-3.5 text-[var(--orange)] shrink-0 ml-2" />}
                        </button>
                      ))}

                      {/* Quick use typed name if not matching */}
                      {customerSearchText.trim() && !filteredCustomers.some(c => c.name.toLowerCase() === customerSearchText.trim().toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => handleSelectQuickName(customerSearchText)}
                          className="w-full text-left p-2.5 rounded-xl border border-dashed text-xs font-bold text-[var(--orange)] hover:bg-[var(--orange-soft)] transition-colors flex items-center gap-2 cursor-pointer"
                          style={{ borderColor: 'var(--orange)' }}
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Usar como cliente rápido: <strong>&quot;{customerSearchText.trim()}&quot;</strong></span>
                        </button>
                      )}
                    </div>

                    {/* Action: Create new detailed customer in dedicated modal */}
                    <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                      <button
                        type="button"
                        onClick={handleOpenNewCustomerModal}
                        className="w-full py-2 px-3 rounded-xl bg-[var(--orange)] text-white text-xs font-black flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> + Registrar Nuevo Cliente
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {orderType === 'delivery' && (
                <div className="space-y-1 animate-fade-in-up">
                  <label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <MapPin className="w-3 h-3 text-[var(--orange)]" /> Dirección de Entrega
                  </label>
                  <input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Dirección completa para el domicilio"
                    required
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas o instrucciones generales del pedido..."
                className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
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
              className="group relative w-full flex items-center justify-center gap-2 text-sm font-black py-4 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_8px_20px_var(--orange-glow)] overflow-hidden cursor-pointer"
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

      {/* Modal Registrar Nuevo Cliente */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl animate-fade-in-up flex flex-col overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[var(--orange-soft)] text-[var(--orange)]">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)]">
                    Registrar Nuevo Cliente
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)]">
                    Guarda el cliente y vincúlalo a la venta en caja POS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="p-2 rounded-xl hover:bg-[var(--bg-input)] cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewCustomer} className="p-6 space-y-3.5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Ej: Carlos Gómez / Mesa 4..."
                  className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Teléfono / WhatsApp (Opcional)
                </label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Ej: 3123456789"
                  className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Dirección de Entrega (Opcional)
                </label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  placeholder="Ej: Calle 45 # 12-30 Apto 201"
                  className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border text-xs font-black hover:bg-[var(--bg-input)] cursor-pointer transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer || !newCustName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-black shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--orange)' }}
                >
                  {isSavingCustomer ? 'Guardando...' : 'Guardar y Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
