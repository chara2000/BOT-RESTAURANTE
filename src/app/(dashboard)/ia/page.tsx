'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, Zap, BrainCircuit, Activity } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import type { Order } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
  orders?: Order[];
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: 'assistant',
    content: '¡Hola! Soy el asistente inteligente local de ChefFlow. Analizo los datos de tu restaurante en tiempo real. ¿En qué te puedo ayudar hoy?',
    time: '15:00',
  },
];

const SUGGESTIONS = [
  '¿Cuáles son los productos más vendidos hoy?',
  'Resumen de ventas del día',
  'Mostrar clientes VIP',
];

export default function IAPage() {
  const { stats, products, customers, settings, orders } = useAppData();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const generateLocalResponse = (query: string): { content: string; orders?: Order[] } => {
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Check tracking query
    const trackMatch = q.match(/rastrear pedido (t-[a-z0-9]+|#[a-z0-9]+|[a-z0-9]{6})/i);
    if (trackMatch) {
      const matchId = trackMatch[1].toUpperCase();
      const foundOrder = orders.find((o) => {
        const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
        return shortId.toUpperCase().includes(matchId) || o.id.toUpperCase().includes(matchId);
      });
      if (foundOrder) {
        const shortId = foundOrder.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${foundOrder.id.slice(0, 6).toUpperCase()}`;
        const itemNames = foundOrder.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
        const STATUS_LABELS: Record<string, string> = {
          pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En Preparación',
          ready: 'Listo', shipping: 'En Camino', delivered: 'Entregado', cancelled: 'Cancelado',
        };
        const statusText = STATUS_LABELS[foundOrder.status] || foundOrder.status;
        return {
          content: `📦 **Estado del Pedido ${shortId}**:\n\n• **Cliente:** ${foundOrder.customer?.name ?? 'Cliente Mostrador'}\n• **Detalle:** ${itemNames}\n• **Total:** $${foundOrder.total.toLocaleString('es-CO')} COP\n• **Estado Actual:** ${statusText}\n• **Tipo:** ${foundOrder.type === 'delivery' ? 'Domicilio' : 'Retiro / Mesa'}`
        };
      } else {
        return { content: `🔍 No se encontró ningún pedido que coincida con "${matchId}".` };
      }
    }

    if (q.includes('seguimiento') || q.includes('rastrear') || q.includes('estado') || q.includes('pedido')) {
      const recent = orders.slice(0, 5);
      if (recent.length === 0) {
        return { content: `🔍 No hay pedidos recientes registrados en el sistema para realizar seguimiento.` };
      }
      return {
        content: `Aquí tienes los pedidos más recientes para hacerles seguimiento. Haz clic en cualquiera para ver su estado actual en tiempo real:`,
        orders: recent,
      };
    }

    if (q.includes('vendido') || q.includes('top') || q.includes('producto')) {
      const top = stats.topProducts
        .slice(0, 3)
        .map((p) => `• ${p.name}: ${p.sold} unidades (${p.revenue.toLocaleString('es-CO')} COP)`)
        .join('\n');
      return { content: `✨ Aquí tienes el **Top 3 de productos más vendidos**:\n\n${top || 'Sin datos aún.'}` };
    }
    if (q.includes('menu') || q.includes('carta')) {
      const items = products
        .slice(0, 5)
        .map((p) => `• ${p.name}: $${p.price.toLocaleString('es-CO')}`)
        .join('\n');
      return { content: `🍔 **Muestra del Menú Disponible**:\n\n${items || 'No hay productos cargados.'}\n\nRevisa la pestaña "Menú" para ver todo.` };
    }
    if (q.includes('venta') || q.includes('ingreso') || q.includes('reporte')) {
      return { content: `📊 **Resumen Operativo de Hoy**:\n\n• **Ingresos Netos:** $${stats.salesToday.toLocaleString('es-CO')}\n• **Pedidos Activos:** ${stats.activeOrders}\n• **Ticket Promedio:** $${Math.round(stats.avgTicket).toLocaleString('es-CO')}\n• **Entregados:** ${stats.deliveredOrders}` };
    }
    if (q.includes('vip') || q.includes('cliente')) {
      const vips = customers
        .filter((c) => c.segment === 'vip')
        .map((c) => `• ${c.name}: $${c.total_spent.toLocaleString('es-CO')} (${c.order_count} pedidos)`)
        .join('\n');
      return { content: `👑 **Clientes VIP Activos**:\n\n${vips || 'No hay clientes VIP aún.'}` };
    }
    return { content: 'Soy tu asistente local. Puedo analizar datos de ventas, productos populares y segmentación de clientes basándome en tu sistema actual. ¡Pregúntame algo específico!' };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { role: 'user', content: text, time: now };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const reply = generateLocalResponse(text);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply.content, orders: reply.orders, time: now }]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[var(--orange)] opacity-[0.03] rounded-full blur-[150px] pointer-events-none" />
      <Topbar title="Inteligencia Artificial" subtitle="Asistente local especializado en la operativa del restaurante" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
          {/* Status & Capabilities */}
          <div className="space-y-6 animate-fade-in-up">
            <div className="card p-6 space-y-5 flex flex-col relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                <BrainCircuit className="w-32 h-32" style={{ color: 'var(--orange)' }} />
              </div>
              <p className="text-sm font-black flex items-center gap-2 relative z-10"><Zap className="h-5 w-5 text-amber-500" /> Diagnóstico del Sistema</p>
              
              <div className="space-y-4 text-xs font-semibold relative z-10">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Bot className="w-4 h-4" /> Motor Cognitivo</span>
                  <span className={`px-2.5 py-1 rounded-lg border shadow-[0_0_12px_rgba(0,0,0,0.1)] ${settings.ai_enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                    {settings.ai_enabled ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Activity className="w-4 h-4" /> Proveedor</span>
                  <span className="text-[var(--text-primary)]">ChefFlow Local v2</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-input)] border" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>Telegram Bridge</span>
                  <span className={`px-2.5 py-1 rounded-lg border shadow-[0_0_12px_rgba(0,0,0,0.1)] ${settings.telegram_enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                    {settings.telegram_enabled ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <p className="text-sm font-black flex items-center gap-2"><Sparkles className="h-5 w-5" style={{ color: 'var(--orange)' }} /> Capacidades Activas</p>
              <ul className="space-y-3 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                {[
                  'Análisis de ventas y ticket promedio',
                  'Procesamiento NLP para pedidos Telegram',
                  'Detección de patrones de compra',
                  'Reportes dinámicos de inventario'
                ].map((c) => (
                  <li key={c} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors">
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--orange)' }} />{c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI Chat Window */}
          <div className="xl:col-span-2 card flex flex-col overflow-hidden animate-fade-in-up delay-100 shadow-xl border" style={{ minHeight: '600px', borderColor: 'var(--border)' }}>
            <div className="px-6 py-5 border-b flex items-center gap-4 bg-[var(--bg-card)] z-10" style={{ borderColor: 'var(--border)' }}>
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-md relative" style={{ background: 'linear-gradient(135deg, var(--orange) 0%, #ff8a4c 100%)' }}>
                <Bot className="h-6 w-6 text-white" />
                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-gray-900 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-base font-black">ChefFlow Assistant</p>
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-0.5">Sistema local en línea</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar bg-[var(--bg-input)]">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`} style={{ animationDelay: '0ms' }}>
                  <div className={`max-w-[80%] px-5 py-3.5 text-sm font-medium leading-relaxed shadow-sm ${
                    m.role === 'user' ? 'rounded-3xl rounded-br-sm text-white' : 'rounded-3xl rounded-bl-sm border bg-[var(--bg-card)]'
                  }`} style={{ 
                    background: m.role === 'user' ? 'var(--orange)' : 'var(--bg-card)',
                    borderColor: m.role === 'user' ? 'transparent' : 'var(--border)'
                  }}>
                    <span className="whitespace-pre-line">{m.content}</span>
                    {m.orders && m.orders.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2 min-w-[200px]">
                        {m.orders.map((o) => {
                          const shortId = o.notes?.match(/\[ID:\s*(T-[A-Z0-9]+)\]/i)?.[1] || `#${o.id.slice(0, 6).toUpperCase()}`;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => sendMessage(`Rastrear pedido ${shortId}`)}
                              className="text-xs font-black text-left px-3 py-2 rounded-xl border bg-[var(--bg-input)] hover:border-[var(--orange)] hover:text-[var(--orange)] transition-all flex justify-between items-center cursor-pointer"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              <span>{shortId} · {o.customer?.name ?? 'Cliente Mostrador'}</span>
                              <span className="opacity-70 font-semibold text-[10px]">{o.items[0]?.product.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className={`text-[9px] font-bold mt-2 text-right ${m.role === 'user' ? 'text-white/80' : 'opacity-50'}`}>{m.time}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-5 py-3.5 rounded-3xl rounded-bl-sm border bg-[var(--bg-card)] flex gap-1.5 items-center" style={{ borderColor: 'var(--border)' }}>
                    <span className="w-2 h-2 rounded-full bg-[var(--orange)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--orange)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--orange)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex flex-wrap gap-2.5 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-[10px] font-black px-4 py-2 rounded-xl border transition-all hover:border-[var(--orange)] hover:text-[var(--orange)] hover:shadow-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {s}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="p-5 border-t flex gap-3 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={loading ? 'La IA está pensando...' : 'Hazle una pregunta a la IA sobre tu negocio...'}
                disabled={loading}
                className="flex-1 text-sm font-semibold px-5 py-3.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] shadow-sm"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <button type="submit" disabled={loading} className="px-6 py-3.5 rounded-2xl text-white flex items-center justify-center transition-all shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100" style={{ background: 'var(--orange)' }}>
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
