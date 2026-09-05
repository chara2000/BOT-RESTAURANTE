'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Clock, MapPin, Phone, User, Utensils, Box, Bike, MessageSquare, Plus, Trash2, X, Check, Save, Minus, ChevronDown, Navigation, Printer, Search, AlertCircle } from 'lucide-react';
import { ridersService } from '@/services/api';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData, getLocalDayString } from '@/context/AppDataContext';
import { ThermalTicketModal } from '@/components/ThermalTicketModal';

import { createOrderViaN8n } from '@/services/n8n';
import { formatCurrency } from '@/lib/utils';
import {
  ORDER_STATUS_COLUMNS, ORDER_STATUS_LABELS, type Order, type OrderStatus, type OrderType, type PaymentMethod, type Product
} from '@/types';
import { deliveryService } from '@/services/api';

const ACTIVE_STATUS_COLUMNS: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready', 'shipping'
];

const COLUMN_COLORS: Record<OrderStatus, string> = {
  draft: '#94a3b8', pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#8b5cf6',
  ready: '#10b981', shipping: '#06b6d4', delivered: '#22c55e', cancelled: '#ef4444',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo', card: 'Tarjeta', nequi: 'Nequi',
  daviplata: 'Daviplata', wompi: 'Wompi', transfer: 'Transferencia',
};

function getOrderTypeIcon(type: string) {
  switch (type) {
    case 'delivery': return <Bike className="w-3 h-3" />;
    case 'pickup': return <Box className="w-3 h-3" />;
    default: return <Utensils className="w-3 h-3" />;
  }
}

function getOrderTypeLabel(type: string) {
  switch (type) {
    case 'delivery': return 'Domicilio';
    case 'pickup': return 'Para llevar';
    default: return 'Mesa';
  }
}

/** Extracts only real user notes (strips [ID:...] and [Cliente:...] tags) */
function extractUserNotes(notes?: string): string {
  if (!notes) return '';
  return notes
    .replace(/\[ID:\s*T-[A-Z0-9]+\]/gi, '')
    .replace(/\[Cliente:[^\]]+\]/gi, '')
    .replace(/\[COMPROBANTE:[^\]]+\]/gi, '')
    .replace(/\|\s*\[PAGO[^\]]+\]/gi, '')
    .trim();
}

const DELIVERY_SUB_LABELS: Record<string, { label: string; color: string }> = {
  searching:           { label: 'Buscando Repartidor', color: 'bg-slate-500/10 text-slate-500 border-slate-500/30' },
  assigned:            { label: '🛵 Hacia el Negocio', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  arrived_at_store:    { label: '🏪 En el Local', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
  picked_up:           { label: '📦 Ruta al Cliente', color: 'bg-violet-500/10 text-violet-500 border-violet-500/30' },
  arrived_at_customer: { label: '🔔 En la Puerta', color: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
};

function OrderCard({ 
  order, 
  deliveryStatus, 
  riderName, 
  onOpenModal, 
  onPrint,
  isSelected,
  onToggleSelect,
}: {
  order: Order;
  deliveryStatus?: string;
  riderName?: string;
  onOpenModal: () => void;
  onPrint?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
  const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;
  const userNotes = extractUserNotes(order.notes);
  const hasUserNotes = userNotes.length > 0;
  const subLabel = deliveryStatus ? DELIVERY_SUB_LABELS[deliveryStatus] : null;

  // Distintivos de métodos de pago electrónico
  const isTransfer = order.payment_method === 'transfer' || /transferencia|nequi|daviplata|bancolombia/i.test(order.notes || '');
  const isNequi = order.payment_method === 'nequi' || /nequi/i.test(order.notes || '');
  const isDaviplata = order.payment_method === 'daviplata' || /daviplata/i.test(order.notes || '');
  const isPendingVerification = (order as any).payment_status === 'pending_verification' || /pendiente de validaci[oó]n/i.test(order.notes || '');

  let paymentAccentClass = 'border-l-4 border-l-transparent';
  let paymentBadge = null;

  if (isNequi) {
    paymentAccentClass = 'border-l-4 border-l-fuchsia-500';
    paymentBadge = (
      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/30 flex items-center gap-1">
        📱 Nequi
      </span>
    );
  } else if (isDaviplata) {
    paymentAccentClass = 'border-l-4 border-l-red-500';
    paymentBadge = (
      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1">
        📱 Daviplata
      </span>
    );
  } else if (isTransfer) {
    paymentAccentClass = 'border-l-4 border-l-sky-500';
    paymentBadge = (
      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1">
        💳 Transferencia
      </span>
    );
  } else if (order.payment_method === 'cash') {
    paymentAccentClass = 'border-l-4 border-l-emerald-500';
    paymentBadge = (
      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
        💵 Efectivo
      </span>
    );
  }

  return (
    <div
      onClick={onOpenModal}
      className={`card p-4 space-y-3 cursor-pointer active:cursor-grabbing hover:ring-2 hover:ring-[var(--orange-soft)] group relative transition-all duration-300 ${paymentAccentClass} ${isSelected ? 'ring-2 ring-[var(--orange)] bg-[var(--orange-soft)]/20' : ''}`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)] gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-black tracking-wider drop-shadow-sm truncate" style={{ color: 'var(--orange)' }}>
            {orderNumber}
          </span>
          {onPrint && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrint();
              }}
              title="Imprimir comanda térmica"
              className="p-1 rounded-lg hover:bg-[var(--orange-soft)] text-[var(--text-muted)] hover:text-[var(--orange)] transition-colors shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          )}
          {hasUserNotes && (
            <div className="relative flex items-center justify-center p-1 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors shrink-0">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shadow-sm transition-colors group-hover:border-[var(--orange)]"
                style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--border)' }}>
            {getOrderTypeIcon(order.type)} {getOrderTypeLabel(order.type)}
          </span>
        </div>
      </div>

      {/* Alerta de pago pendiente de verificación */}
      {isPendingVerification && (
        <div className="flex items-center gap-1.5 text-[9px] font-black px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
          <AlertCircle className="w-3 h-3 shrink-0" />
          Comprobante digital por verificar
        </div>
      )}

      {/* Sub-estado de entrega en tiempo real (solo en columna shipping) */}
      {order.status === 'shipping' && subLabel && (
        <div className={`flex items-center gap-1.5 text-[9px] font-black px-2.5 py-1.5 rounded-lg border ${subLabel.color}`}>
          <Navigation className="w-3 h-3" />
          {subLabel.label}
          {riderName && <span className="ml-1 opacity-70">· {riderName}</span>}
        </div>
      )}

      <div className="space-y-2.5 pt-1">
        {(!order.items || order.items.length === 0) ? (
          <p className="text-[11px] font-medium text-[var(--text-muted)] italic">
            Sin platillos detallados
          </p>
        ) : (
          order.items.map((item, idx) => (
            <div key={item.id || idx} className="flex gap-3 items-center">
              <div className="h-10 w-10 rounded-xl overflow-hidden shadow-sm shrink-0 bg-[var(--bg-input)] flex items-center justify-center border border-[var(--border)]">
                {item.product?.image_url ? (
                  <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Utensils className="w-4 h-4 text-[var(--orange)] opacity-80" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-[var(--text-primary)]">
                  {item.product?.name || 'Platillo'}
                </p>
                <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Cant: {item.quantity} · {formatCurrency(item.unit_price || item.product?.price || 0)}
                  {item.notes && <span className="ml-1.5 text-red-500 font-extrabold bg-red-500/10 px-1.5 py-0.5 rounded">({item.notes})</span>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-[var(--bg-input)] rounded-xl p-2.5 space-y-1.5 border border-[var(--border)] mt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-primary)] min-w-0">
            <User className="h-3.5 w-3.5 text-[var(--orange)] shrink-0" />
            <span className="truncate">{order.customer?.name || 'Cliente'}</span>
          </p>
          {paymentBadge && <div className="shrink-0">{paymentBadge}</div>}
        </div>
        {order.delivery_address && (
          <p className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-muted)] truncate">
            <MapPin className="h-3.5 w-3.5 text-[var(--orange)] shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </p>
        )}
        {order.customer?.phone && order.customer.phone !== '0000000000' && (
          <p className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-muted)]">
            <Phone className="h-3.5 w-3.5 text-[var(--orange)] shrink-0" />
            <span>{order.customer.phone}</span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] mt-1">
        <span className="text-sm font-black text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-input)] rounded-md" style={{ color: 'var(--text-muted)' }}>
            <Clock className="h-3.5 w-3.5" />
            {new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {onToggleSelect && (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className="p-1 rounded-md hover:bg-[var(--bg-input)] cursor-pointer shrink-0"
              title="Seleccionar pedido"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[var(--orange)] border-[var(--orange)] text-white' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useUIModal } from '@/components/ui/UIModal';

export default function PedidosPage() {
  const { showConfirm } = useUIModal();
  const { orders, deliveries, updateOrderStatus, deleteOrder, updateOrderDetails, products, customers, addOrder, settings, categories, activeTenantId, cashSession } = useAppData();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [dbRiders, setDbRiders] = useState<any[]>([]);

  // Cargar repartidores propios del negocio desde Supabase
  useEffect(() => {
    ridersService.getAll(activeTenantId)
      .then(setDbRiders)
      .catch((err) => console.error('[Kanban] Error fetching riders:', err));
  }, [activeTenantId]);

  // Construir un mapa rápido: orderId -> { deliveryStatus, riderName } para badges en Kanban
  const deliveryMap = new Map<string, { status: string; riderName: string | undefined }>(
    deliveries.map((d) => [d.order_id, { status: d.status, riderName: d.rider_name }])
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  // View state: 'kanban' o 'list'
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Edit Order states
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<OrderStatus>('pending');
  const [editType, setEditType] = useState<OrderType>('dine_in');
  const [editPayment, setEditPayment] = useState<PaymentMethod>('cash');
  const [editAddress, setEditAddress] = useState('');
  const [editItems, setEditItems] = useState<Order['items']>([]);


  // Create Order states
  const [newCustomer, setNewCustomer] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newType, setNewType] = useState<OrderType>('dine_in');
  const [newPayment, setNewPayment] = useState<PaymentMethod>('cash');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newItems, setNewItems] = useState<{ product: Product; quantity: number }[]>([]);
  const [newProductSearch, setNewProductSearch] = useState('');
  const [editProductSearch, setEditProductSearch] = useState('');

  // Multi-selección para actualización masiva en Kanban
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const handleBatchStatusUpdate = async (newStatus: OrderStatus) => {
    if (selectedOrderIds.size === 0) return;
    const ids = Array.from(selectedOrderIds);
    try {
      await Promise.all(ids.map(id => updateOrderStatus(id, newStatus)));
      clearSelection();
    } catch (err) {
      console.error('Error en cambio masivo de estado:', err);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedOrderIds.size === 0) return;
    const ok = await showConfirm({
      title: `¿Eliminar ${selectedOrderIds.size} pedidos seleccionados?`,
      message: 'Esta acción no se puede deshacer y retirará estos pedidos de la jornada.',
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    if (ok) {
      const ids = Array.from(selectedOrderIds);
      try {
        await Promise.all(ids.map(id => deleteOrder(id)));
        clearSelection();
      } catch (err) {
        console.error('Error en eliminación masiva:', err);
      }
    }
  };

  const todayStr = getLocalDayString(new Date());

  const todayOrdersCount = orders.filter(o => getLocalDayString(o.created_at) === todayStr).length;

  // Órdenes filtradas por día actual, tipo, categoría y búsqueda (muestra todos los pedidos del día de hoy)
  const baseFilteredOrders = orders.filter(o => {
    const orderDateStr = getLocalDayString(o.created_at);

    // Muestra todos los pedidos del día actual para que ningún pedido quede por fuera
    if (orderDateStr !== todayStr) return false;

    if (filterType !== 'all' && o.type !== filterType) return false;
    
    if (filterCategory !== 'all') {
      const hasCategory = o.items.some(item => 
        item.product.category_id === filterCategory || 
        item.product.category === filterCategory
      );
      if (!hasCategory) return false;
    }

    if (filterSearch) {
      const searchLower = filterSearch.toLowerCase();
      const customerName = o.customer?.name.toLowerCase() || '';
      const orderId = o.id.toLowerCase();
      const notes = o.notes?.toLowerCase() || '';
      return customerName.includes(searchLower) || orderId.includes(searchLower) || notes.includes(searchLower);
    }
    return true;
  });

  const columns = ORDER_STATUS_COLUMNS.reduce((acc, status) => {
    acc[status] = baseFilteredOrders.filter((o) => o.status === status);
    return acc;
  }, {} as Record<OrderStatus, Order[]>);

  // Lista adicionalmente filtra por estado
  const filteredOrders = baseFilteredOrders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    return true;
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as OrderStatus;
    updateOrderStatus(result.draggableId, newStatus);
  };

  const handleOpenEdit = (order: Order) => {
    setSelectedOrder(order);
    setEditNotes(extractUserNotes(order.notes));
    setEditStatus(order.status);
    setEditType(order.type);
    setEditAddress(order.delivery_address || '');
    setEditPayment(order.payment_method);
    setEditItems([...order.items]);
  };

  const handleEditItemQty = (itemId: string, delta: number) => {
    setEditItems(prev =>
      prev
        .map(item => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item)
        .filter(item => item.quantity > 0)
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;
    try {
      // Rebuild notes: keep all [...] tags and append the new user notes
      const tags = selectedOrder.notes?.match(/\[.*?\]/g) || [];
      const newNotesFull = [...tags, editNotes].filter(Boolean).join(' ').trim();

      const newSubtotal = editItems.reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
      const newDeliveryFee = editType === 'delivery' ? (settings.delivery_fee !== undefined ? settings.delivery_fee : 5000) : 0;
      const newTotal = newSubtotal + newDeliveryFee;

      await updateOrderDetails(
        selectedOrder.id,
        {
          notes: newNotesFull,
          status: editStatus,
          total: newTotal,
          type: editType,
          delivery_address: editType === 'delivery' ? editAddress : undefined,
        },
        editItems
      );
      await updateOrderStatus(selectedOrder.id, editStatus);

      setSelectedOrder(null);
      setEditProductSearch('');
    } catch (e) {
      console.error(e);
    }
  };


  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    const ok = await showConfirm({
      title: '¿Eliminar Pedido?',
      message: '¿Estás seguro de que deseas eliminar este pedido? Se descontará del flujo de caja si ya estaba confirmado.',
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    if (ok) {
      try {
        await deleteOrder(selectedOrder.id);
        setSelectedOrder(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleAddItemToNew = (p: Product) => {
    setNewItems(prev => {
      const exists = prev.find(item => item.product.id === p.id);
      if (exists) {
        return prev.map(item => item.product.id === p.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };

  const handleRemoveItemFromNew = (pId: string) => {
    setNewItems(prev => prev.map(item => item.product.id === pId ? { ...item, quantity: item.quantity - 1 } : item).filter(item => item.quantity > 0));
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newItems.length === 0) {
      alert('Debes agregar al menos un producto');
      return;
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const shortId = `T-${code}`;

    const subtotal = newItems.reduce((acc, curr) => acc + (curr.product.price * curr.quantity), 0);
    const delivery_fee = newType === 'delivery' ? (settings.delivery_fee !== undefined ? settings.delivery_fee : 5000) : 0;
    const total = subtotal + delivery_fee;

    const payload = {
      order: {
        tenant_id: activeTenantId,
        type: newType,
        payment_method: newPayment,
        customer_id: newCustomer || undefined,
        customer_name: newCustomer,
        customer_phone: newCustomerPhone || undefined,
        subtotal,
        delivery_fee,
        tips: 0,
        total,
        delivery_address: newType === 'delivery' ? newAddress : undefined,
        notes: newNotes ? `[ID: ${shortId}] ${newNotes}` : `[ID: ${shortId}]`,
      },
      items: newItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
      })),
    };

    try {
      const result = await createOrderViaN8n(payload);
      if (result.order) {
        addOrder(result.order);
      }
    } catch (err) {
      console.error(err);
      alert('Error creando el pedido en BD');
      return;
    }

    setShowCreateModal(false);
    setNewCustomer('');
    setNewCustomerPhone('');
    setNewType('dine_in');
    setNewPayment('cash');
    setNewAddress('');
    setNewNotes('');
    setNewItems([]);
  };

  // Compute if user notes exist for the selected order
  const selectedUserNotes = selectedOrder ? extractUserNotes(selectedOrder.notes) : '';

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-[var(--orange)] opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />

      {/* Topbar full-width */}
      <Topbar title="Gestión de Pedidos" subtitle={viewMode === 'kanban' ? "Kanban en tiempo real · Arrastra para cambiar estado" : "Vista de lista · Filtra y busca pedidos"} />

      {/* Controls */}
      <div className="px-5 lg:px-8 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 relative">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[var(--bg-input)] rounded-xl p-1 border shadow-inner" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all cursor-pointer ${viewMode === 'kanban' ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              Kanban
            </button>
            <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all cursor-pointer ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--orange)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              Lista
            </button>
          </div>

          {/* Indicador de pedidos de hoy */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border text-xs font-black shadow-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Pedidos de Hoy:</span>
            <span className="px-2 py-0.5 rounded-lg bg-[var(--orange)] text-white text-[11px] font-black">
              {todayOrdersCount}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="text" 
            placeholder="Buscar..." 
            value={filterSearch} 
            onChange={(e) => setFilterSearch(e.target.value)} 
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--bg-input)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)] outline-none transition-all w-full md:w-auto"
            style={{ borderColor: 'var(--border)' }}
          />
          {viewMode === 'list' && (
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--bg-input)] border text-[var(--text-primary)] focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)] outline-none transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value="all">Todos los estados</option>
              {ORDER_STATUS_COLUMNS.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
            </select>
          )}
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--bg-input)] border text-[var(--text-primary)] focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)] outline-none transition-all cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="all">Todos los tipos</option>
            <option value="dine_in">Mesa</option>
            <option value="pickup">Para llevar</option>
            <option value="delivery">Domicilio</option>
          </select>
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--bg-input)] border text-[var(--text-primary)] focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)] outline-none transition-all cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="all">Todas las categorías</option>
            {categories.filter(c => c.is_active).sort((a,b) => a.sort_order - b.sort_order).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Floating Action Button — bottom right, above mobile nav bar */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed right-5 md:right-8 z-40 flex items-center gap-2 text-sm font-black px-5 py-3 rounded-2xl text-white shadow-[0_8px_24px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer fab-order-btn"
        style={{ background: 'var(--orange)' }}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Crear Pedido</span>
        <span className="sm:hidden">Nuevo</span>
      </button>

      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-x-auto p-5 lg:p-8 z-10 relative">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-2 px-1 min-h-[600px] snap-x snap-mandatory">
              {ORDER_STATUS_COLUMNS.map((status, idx) => (
                <div key={status} className={`w-[300px] shrink-0 flex flex-col animate-fade-in-up`} style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="flex items-center gap-2.5 mb-4 px-2">
                    <span className="h-3 w-3 rounded-full shadow-sm" style={{ background: COLUMN_COLORS[status], boxShadow: `0 0 8px ${COLUMN_COLORS[status]}80` }} />
                    <h3 className="text-sm font-black tracking-wide text-[var(--text-primary)] uppercase">{ORDER_STATUS_LABELS[status]}</h3>
                    <span className="ml-auto text-[11px] font-black px-2.5 py-0.5 rounded-lg border shadow-sm"
                          style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                      {columns[status].length}
                    </span>
                  </div>

                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}
                           className="flex-1 space-y-3 min-h-[200px] max-h-[calc(100dvh-260px)] overflow-y-auto pr-1.5 scrollbar-thin p-3 rounded-3xl transition-all duration-300 border backdrop-blur-md"
                           style={{
                             background: snapshot.isDraggingOver ? 'var(--orange-soft)' : 'var(--bg-input)',
                             borderColor: snapshot.isDraggingOver ? 'var(--orange)' : 'var(--border)',
                             boxShadow: snapshot.isDraggingOver ? '0 0 20px var(--orange-glow) inset' : 'inset 0 2px 10px rgba(0,0,0,0.02)'
                           }}>
                        {columns[status].map((order, index) => (
                          <Draggable key={order.id} draggableId={order.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div ref={dragProvided.innerRef}
                                   {...dragProvided.draggableProps}
                                   {...dragProvided.dragHandleProps}
                                   style={{
                                     ...dragProvided.draggableProps.style,
                                     transform: dragSnapshot.isDragging
                                       ? `${dragProvided.draggableProps.style?.transform} scale(1.05)`
                                       : dragProvided.draggableProps.style?.transform,
                                     transition: dragSnapshot.isDragging
                                       ? 'transform 0.1s cubic-bezier(0.2, 0, 0, 1)'
                                       : 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                     zIndex: dragSnapshot.isDragging ? 50 : 1,
                                   }}>
                                <OrderCard
                                  order={order}
                                  deliveryStatus={deliveryMap.get(order.id)?.status}
                                  riderName={deliveryMap.get(order.id)?.riderName}
                                  isSelected={selectedOrderIds.has(order.id)}
                                  onToggleSelect={() => toggleSelectOrder(order.id)}
                                  onOpenModal={() => handleOpenEdit(order)}
                                  onPrint={() => setPrintingOrder(order)}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-5 lg:p-8 z-10 relative">
          <div className="bg-[var(--bg-card)] rounded-3xl border shadow-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-[var(--bg-input)] border-b" style={{ borderColor: 'var(--border)' }}>
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">ID / Cliente</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Tipo</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Estado</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Total</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map(order => {
                    const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
                    const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;
                    return (
                      <tr 
                        key={order.id} 
                        onClick={() => handleOpenEdit(order)}
                        className="hover:bg-[var(--bg-input)] transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-black group-hover:text-[var(--orange)] transition-colors text-[var(--text-primary)]">{orderNumber}</p>
                          <p className="text-xs font-bold text-[var(--text-muted)] mt-0.5">{order.customer?.name || 'Cliente general'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 w-fit text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-sm"
                                style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                            {getOrderTypeIcon(order.type)} {getOrderTypeLabel(order.type)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: COLUMN_COLORS[order.status] }} />
                            <span className="text-xs font-black uppercase text-[var(--text-primary)]">{ORDER_STATUS_LABELS[order.status]}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-[var(--text-primary)]">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-[var(--text-muted)]">
                          {new Date(order.created_at).toLocaleString('es-CO')}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-[var(--text-muted)] text-sm font-bold">
                      No se encontraron pedidos que coincidan con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Batch Action Bar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-[var(--bg-card)]/95 backdrop-blur-md border border-[var(--orange)] shadow-2xl rounded-2xl px-5 py-3.5 flex items-center gap-3 animate-fade-in-up max-w-[95vw] overflow-x-auto">
          <div className="flex items-center gap-2 pr-3 border-r border-[var(--border)] shrink-0">
            <span className="w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center shadow-sm" style={{ background: 'var(--orange)' }}>
              {selectedOrderIds.size}
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">
              {selectedOrderIds.size === 1 ? 'Pedido seleccionado' : 'Pedidos seleccionados'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            <button
              onClick={() => handleBatchStatusUpdate('confirmed')}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              ✓ Confirmar
            </button>
            <button
              onClick={() => handleBatchStatusUpdate('preparing')}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              🍳 A Cocina
            </button>
            <button
              onClick={() => handleBatchStatusUpdate('ready')}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              🔔 Listo
            </button>
            <button
              onClick={() => handleBatchStatusUpdate('shipping')}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              🛵 En Reparto
            </button>
            <button
              onClick={() => handleBatchStatusUpdate('delivered')}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              🎉 Entregado
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
          </div>

          <button
            onClick={clearSelection}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer ml-1 shrink-0"
            title="Deseleccionar todos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Order Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl border shadow-2xl animate-fade-in-up flex flex-col max-h-[88dvh] sm:max-h-[92vh] overflow-hidden my-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {/* Modal header */}
            <div className="flex justify-between items-center border-b px-6 py-4 sm:py-5 shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-lg font-black text-[var(--text-primary)]">
                  Pedido {selectedOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${selectedOrder.id.slice(0,6).toUpperCase()}`}
                </h3>
                <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {new Date(selectedOrder.created_at).toLocaleString('es-CO')}
                </p>
              </div>
              <button onClick={() => { setSelectedOrder(null); setEditProductSearch(''); }} className="p-2 rounded-xl hover:bg-[var(--bg-input)] cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Editable Items */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Productos del Pedido</p>
                <div className="space-y-2">
                  {editItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                      <img src={item.product.image_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.product.name}</p>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatCurrency(item.unit_price)} c/u</p>
                        {item.notes && (
                          <p className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-lg mt-1.5 inline-block border border-rose-500/20">
                            Nota: {item.notes}
                          </p>
                        )}
                      </div>
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 bg-[var(--bg-card)] rounded-xl p-1 border shadow-sm" style={{ borderColor: 'var(--border)' }}>
                        <button type="button" onClick={() => handleEditItemQty(item.id, -1)}
                          className="p-1 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-[var(--text-muted)] transition-colors">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-black text-[var(--text-primary)]">{item.quantity}</span>
                        <button type="button" onClick={() => handleEditItemQty(item.id, 1)}
                          className="p-1 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-500 text-[var(--text-muted)] transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-xs font-black w-20 text-right text-[var(--text-primary)]">{formatCurrency(item.unit_price * item.quantity)}</span>
                    </div>
                  ))}
                  {editItems.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Sin productos — el pedido será eliminado si guardas vacío.</p>
                  )}
                </div>
              </div>

              {/* Add products to existing order */}
              <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Agregar productos</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    value={editProductSearch}
                    onChange={(e) => setEditProductSearch(e.target.value)}
                    placeholder="Buscar platillo..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-xs font-semibold border outline-none focus:ring-2 focus:ring-[var(--orange)] transition-all"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {products.filter(p => p.is_available && (
                    !editProductSearch.trim() ||
                    p.name.toLowerCase().includes(editProductSearch.toLowerCase()) ||
                    (p.category ?? '').toLowerCase().includes(editProductSearch.toLowerCase())
                  )).map(p => {
                    const existingIdx = editItems.findIndex(i => i.product.id === p.id);
                    const qty = existingIdx >= 0 ? editItems[existingIdx].quantity : 0;
                    return (
                      <div key={p.id}
                        className="flex justify-between items-center p-2 rounded-xl border bg-[var(--bg-input)] transition-colors"
                        style={{ borderColor: qty > 0 ? 'var(--orange)' : 'var(--border)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black truncate text-[var(--text-primary)]">{p.name}</p>
                          <p className="text-[9px] font-bold" style={{ color: 'var(--orange)' }}>{formatCurrency(p.price)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                          {qty > 0 && (
                            <button type="button"
                              onClick={() => setEditItems(prev => prev.map(i => i.product.id === p.id ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0))}
                              className="w-5 h-5 rounded-md flex items-center justify-center bg-rose-500/10 text-rose-500 font-bold hover:bg-rose-500/20 text-[10px] transition-colors">-
                            </button>
                          )}
                          {qty > 0 && <span className="text-xs font-black w-4 text-center text-[var(--text-primary)]">{qty}</span>}
                          <button type="button"
                            onClick={() => {
                              if (existingIdx >= 0) {
                                setEditItems(prev => prev.map(i => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
                              } else {
                                setEditItems(prev => [...prev, { id: p.id, product: p, quantity: 1, unit_price: p.price }]);
                              }
                            }}
                            className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-500/10 text-emerald-500 font-bold hover:bg-emerald-500/20 text-[10px] transition-colors">+
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status + Type/Payment */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Estado</label>
                  <div className="relative">
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as OrderStatus)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none appearance-none pr-7"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      {ORDER_STATUS_COLUMNS.map(s => (
                        <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tipo</label>
                  <div className="relative">
                    <select value={editType} onChange={(e) => setEditType(e.target.value as OrderType)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none appearance-none pr-7"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      <option value="dine_in">Mesa</option>
                      <option value="pickup">Para llevar</option>
                      <option value="delivery">Domicilio</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pago</label>
                  <div className="relative">
                    <select value={editPayment} onChange={(e) => setEditPayment(e.target.value as PaymentMethod)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none appearance-none pr-7"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => (
                        <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>

              {/* Delivery Address if delivery */}
              {editType === 'delivery' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <MapPin className="h-3 w-3" /> Dirección de Entrega
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Ej. Calle 123 #45-67"
                    className="w-full text-xs font-bold px-4 py-2.5 rounded-xl border focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)] outline-none transition-all"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <MessageSquare className="w-3 h-3 text-[var(--orange)]" />
                  Nota del Cliente
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full text-sm font-bold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] transition-all resize-none min-h-[80px]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="Sin notas adicionales..."
                />
              </div>

              {/* Customer Info */}
              {selectedOrder.customer && (
                <div className="p-3.5 rounded-2xl border bg-[var(--bg-input)] space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-black text-[var(--text-primary)]"><User className="w-3 h-3 inline mr-1 text-[var(--orange)]" />{selectedOrder.customer.name}</p>
                  <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}><Phone className="w-3 h-3 inline mr-1" />{selectedOrder.customer.phone}</p>
                  {selectedOrder.delivery_address && (
                    <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}><MapPin className="w-3 h-3 inline mr-1" />{selectedOrder.delivery_address}</p>
                  )}
                </div>
              )}

              {/* Total Preview */}
              {editItems.length > 0 && (
                <div className="flex justify-between items-center p-3 rounded-2xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-black text-[var(--text-primary)]">Total actualizado:</span>
                  <span className="text-sm font-black" style={{ color: 'var(--orange)' }}>
                    {formatCurrency(editItems.reduce((a, i) => a + i.unit_price * i.quantity, 0) + (editType === 'delivery' ? (settings.delivery_fee !== undefined ? settings.delivery_fee : 5000) : 0))}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center border-t px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={handleDeleteOrder}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 text-xs font-black transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
              <div className="flex gap-2">
                <button onClick={() => setSelectedOrder(null)} className="px-4 py-2.5 rounded-xl border text-xs font-black hover:bg-[var(--bg-input)] cursor-pointer transition-colors" style={{ borderColor: 'var(--border)' }}>Cancelar</button>
                <button onClick={handleSaveEdit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-black shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all cursor-pointer" style={{ background: 'var(--orange)' }}>
                  <Save className="w-4 h-4" /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <form onSubmit={handleCreateOrderSubmit} className="w-full max-w-xl rounded-3xl border shadow-2xl animate-fade-in-up flex flex-col max-h-[88dvh] sm:max-h-[92vh] overflow-hidden my-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex justify-between items-center border-b px-6 py-4 sm:py-5 shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-lg font-black text-[var(--text-primary)]">Nuevo Pedido</h3>
                <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>Agrega un pedido manualmente al sistema</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-input)] cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cliente / Mesa</label>
                  <input
                    type="text" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)}
                    placeholder="Mesa 5 / Juan Gómez" required
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Teléfono / Celular (Opcional)</label>
                  <input
                    type="tel" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Ej. 300 123 4567"
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tipo de Entrega</label>
                  <div className="relative">
                    <select value={newType} onChange={(e) => setNewType(e.target.value as OrderType)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none appearance-none pr-7"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      <option value="dine_in">🍽️ Mesa (Local)</option>
                      <option value="pickup">🛍️ Para Llevar</option>
                      <option value="delivery">🛵 Domicilio</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Método de Pago</label>
                  <div className="relative">
                    <select value={newPayment} onChange={(e) => setNewPayment(e.target.value as PaymentMethod)}
                      className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none appearance-none pr-7"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="nequi">Nequi</option>
                      <option value="daviplata">Daviplata</option>
                      <option value="wompi">Wompi</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>

              {newType === 'delivery' && (
                <div className="space-y-1 animate-fade-in-up">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Dirección de Envío</label>
                  <input
                    type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Dirección completa del cliente" required
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Notas Especiales (Opcional)</label>
                <input
                  type="text" value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Sin cebolla, salsas aparte, piso 3..."
                  className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Product Selector */}
              <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Seleccionar Productos</p>
                {/* Product search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    value={newProductSearch}
                    onChange={(e) => setNewProductSearch(e.target.value)}
                    placeholder="Buscar platillo o categoría..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs font-semibold border outline-none focus:ring-2 focus:ring-[var(--orange)] transition-all"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                  {products.filter(p => p.is_available && (
                    !newProductSearch.trim() ||
                    p.name.toLowerCase().includes(newProductSearch.toLowerCase()) ||
                    (p.category ?? '').toLowerCase().includes(newProductSearch.toLowerCase())
                  )).map(p => {
                    const count = newItems.find(item => item.product.id === p.id)?.quantity ?? 0;
                    return (
                      <div key={p.id} className="flex justify-between items-center p-2.5 rounded-xl border bg-[var(--bg-input)] transition-colors hover:border-[var(--orange)]" style={{ borderColor: count > 0 ? 'var(--orange)' : 'var(--border)' }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black truncate text-[var(--text-primary)]">{p.name}</p>
                          <p className="text-[9px] font-bold" style={{ color: 'var(--orange)' }}>{formatCurrency(p.price)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {count > 0 && (
                            <button type="button" onClick={() => handleRemoveItemFromNew(p.id)}
                              className="w-5 h-5 rounded-lg flex items-center justify-center bg-rose-500/10 text-rose-500 font-bold hover:bg-rose-500/20 text-[10px] transition-colors">-</button>
                          )}
                          {count > 0 && <span className="text-xs font-black w-4 text-center text-[var(--text-primary)]">{count}</span>}
                          <button type="button" onClick={() => handleAddItemToNew(p)}
                            className="w-5 h-5 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 font-bold hover:bg-emerald-500/20 text-[10px] transition-colors">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Preview */}
              {newItems.length > 0 && (
                <div className="p-3 rounded-2xl bg-[var(--bg-input)] border flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-black text-[var(--text-primary)]">Total:</span>
                  <span className="text-sm font-black" style={{ color: 'var(--orange)' }}>
                    {formatCurrency(newItems.reduce((acc, curr) => acc + (curr.product.price * curr.quantity), 0) + (newType === 'delivery' ? (settings.delivery_fee !== undefined ? settings.delivery_fee : 5000) : 0))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-3.5 sm:py-4 shrink-0 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 rounded-xl border text-xs font-black hover:bg-[var(--bg-input)] cursor-pointer transition-colors" style={{ borderColor: 'var(--border)' }}>
                Cancelar
              </button>
              <button type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-black shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all cursor-pointer" style={{ background: 'var(--orange)' }}>
                <Check className="w-4 h-4" /> Crear Pedido
              </button>
            </div>
          </form>
        </div>
      )}
      {printingOrder && (
        <ThermalTicketModal
          order={printingOrder}
          settings={settings}
          onClose={() => setPrintingOrder(null)}
        />
      )}
    </div>
  );
}

