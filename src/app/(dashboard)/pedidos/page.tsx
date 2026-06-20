'use client';

import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Clock, MapPin, Phone, User, Utensils, Box, Bike } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import {
  ORDER_STATUS_COLUMNS, ORDER_STATUS_LABELS, type Order, type OrderStatus,
} from '@/types';

const COLUMN_COLORS: Record<OrderStatus, string> = {
  draft: '#94a3b8', pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#8b5cf6',
  ready: '#10b981', shipping: '#06b6d4', delivered: '#22c55e', cancelled: '#ef4444',
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

function OrderCard({ order }: { order: Order }) {
  // Convert UUID to a readable short Order Number (e.g. T-1234)
  const shortIdMatch = order.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i);
  const orderNumber = shortIdMatch ? shortIdMatch[1] : `#${order.id.slice(0, 6).toUpperCase()}`;

  return (
    <div className="card p-4 space-y-3 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[var(--orange-soft)] group">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <span className="text-sm font-black tracking-wider drop-shadow-sm" style={{ color: 'var(--orange)' }}>
          {orderNumber}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-sm transition-colors group-hover:border-[var(--orange)]"
              style={{ background: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--border)' }}>
          {getOrderTypeIcon(order.type)} {getOrderTypeLabel(order.type)}
        </span>
      </div>
      
      <div className="space-y-2.5 pt-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex gap-3 items-center">
            <div className="h-10 w-10 rounded-xl overflow-hidden shadow-sm shrink-0">
              <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-[var(--text-primary)]">{item.product.name}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>Cant: {item.quantity}</p>
            </div>
          </div>
        ))}
      </div>

      {order.customer && (
        <div className="bg-[var(--bg-input)] rounded-xl p-2.5 space-y-1.5 border border-[var(--border)] mt-2">
          <p className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-primary)]">
            <User className="h-3.5 w-3.5 text-[var(--orange)]" />
            <span className="truncate">{order.customer.name}</span>
          </p>
          {order.delivery_address && (
            <p className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-muted)] truncate">
              <MapPin className="h-3.5 w-3.5 text-[var(--orange)] shrink-0" />
              <span className="truncate">{order.delivery_address}</span>
            </p>
          )}
          <p className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-muted)]">
            <Phone className="h-3.5 w-3.5 text-[var(--orange)]" />
            {order.customer.phone}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] mt-1">
        <span className="text-sm font-black text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
        <span className="text-[10px] font-bold flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-input)] rounded-md" style={{ color: 'var(--text-muted)' }}>
          <Clock className="h-3.5 w-3.5" />
          {new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default function PedidosPage() {
  const { orders, updateOrderStatus } = useAppData();

  const columns = ORDER_STATUS_COLUMNS.reduce((acc, status) => {
    acc[status] = orders.filter((o) => o.status === status);
    return acc;
  }, {} as Record<OrderStatus, Order[]>);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as OrderStatus;
    updateOrderStatus(result.draggableId, newStatus);
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      {/* Background flare */}
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-[var(--orange)] opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />

      <Topbar title="Gestión de Pedidos" subtitle="Kanban en tiempo real · Arrastra para cambiar estado" />
      
      <div className="flex-1 overflow-x-auto p-5 lg:p-8 z-10 relative">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-6 min-w-max pb-4 h-full">
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
                         className="flex-1 space-y-4 min-h-[200px] p-3 rounded-3xl transition-all duration-300 border backdrop-blur-md"
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
                              <OrderCard order={order} />
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
    </div>
  );
}
