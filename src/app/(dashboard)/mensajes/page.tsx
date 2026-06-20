'use client';

import { MessageCircle, Send, CheckCheck, MoreVertical, Search } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';

const CONVERSATIONS = [
  { id: 1, name: 'Juan Carlos G.', channel: 'Telegram', last: 'Quiero 2 hamburguesas trufa', time: '15:22', unread: 2, avatar: '🧑', active: true },
  { id: 2, name: 'María Paula A.', channel: 'Telegram', last: '¿Tienen pizza disponible?', time: '14:55', unread: 0, avatar: '👩', active: false },
  { id: 3, name: 'Andrés F.', channel: 'WhatsApp', last: 'Confirmar pedido ORD-005', time: '14:30', unread: 1, avatar: '🧔', active: false },
  { id: 4, name: 'Diana H.', channel: 'Telegram', last: 'Gracias, llegó perfecto!', time: '13:10', unread: 0, avatar: '👩‍🦰', active: false },
];

const MESSAGES = [
  { from: 'customer', text: 'Hola, quiero hacer un pedido', time: '15:20' },
  { from: 'bot', text: '¡Hola Juan! 👋 Bienvenido a ChefFlow. ¿Qué te gustaría ordenar hoy? Puedo mostrarte nuestro menú.', time: '15:20' },
  { from: 'customer', text: 'Quiero 2 hamburguesas trufa y una limonada de coco', time: '15:21' },
  { from: 'bot', text: '🛒 Pedido:\n• 2x Hamburguesa Premium Trufa — $64.000\n• 1x Limonada de Coco — $9.500\n\nSubtotal: $73.500\nDomicilio: $5.000\nTotal: $78.500\n\n¿Confirmas? Indica tu dirección y método de pago.', time: '15:21' },
  { from: 'customer', text: 'Calle 10A #34-56, pago con Nequi', time: '15:22' },
];

export default function MensajesPage() {
  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Bandeja de Mensajes" subtitle="Soporte y ventas vía Telegram y WhatsApp" />
      
      <div className="flex-1 overflow-hidden p-5 lg:p-8 z-10 relative">
        <div className="card flex h-[calc(100vh-180px)] overflow-hidden shadow-2xl animate-fade-in-up border" style={{ borderColor: 'var(--border)' }}>
          
          {/* Sidebar */}
          <div className="w-80 shrink-0 border-r flex flex-col bg-[var(--bg-card)] relative z-10" style={{ borderColor: 'var(--border)' }}>
            <div className="p-5 border-b space-y-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-black flex items-center justify-between">
                Conversaciones
                <span className="bg-[var(--orange)] text-white px-2 py-0.5 rounded-full text-[10px]">3 activas</span>
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Buscar chat..." 
                  className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] bg-[var(--bg-input)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {CONVERSATIONS.map((c) => (
                <button key={c.id} className="w-full p-4 flex items-start gap-3 transition-all text-left border-b relative group"
                  style={{ 
                    borderColor: 'var(--border)',
                    background: c.active ? 'var(--orange-soft)' : 'transparent'
                  }}>
                  {c.active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--orange)] shadow-[0_0_8px_var(--orange)]" />}
                  
                  <span className="text-3xl drop-shadow-sm">{c.avatar}</span>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-black truncate text-[var(--text-primary)]">{c.name}</p>
                      <span className="text-[9px] font-bold" style={{ color: c.unread > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>{c.time}</span>
                    </div>
                    <p className={`text-[11px] truncate mb-1.5 ${c.unread > 0 ? 'font-bold text-[var(--text-primary)]' : 'font-medium'}`} style={{ color: c.unread > 0 ? 'inherit' : 'var(--text-muted)' }}>
                      {c.last}
                    </p>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-sm"
                          style={{ background: c.channel === 'Telegram' ? '#229ED9' : '#25D366', color: '#fff' }}>
                      {c.channel}
                    </span>
                  </div>
                  {c.unread > 0 && (
                    <span className="h-5 w-5 rounded-full text-[9px] font-black text-white flex items-center justify-center shadow-md animate-bounce"
                          style={{ background: 'var(--orange)' }}>{c.unread}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-[var(--bg-input)] relative">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
            
            <div className="px-6 py-4 border-b flex items-center justify-between bg-[var(--bg-card)] z-10" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-[var(--orange-soft)] flex items-center justify-center">
                  <MessageCircle className="h-5 w-5" style={{ color: 'var(--orange)' }} />
                </div>
                <div>
                  <p className="text-sm font-black">Juan Carlos G.</p>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Telegram · IA respondiendo
                  </p>
                </div>
              </div>
              <button className="p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors">
                <MoreVertical className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar z-10">
              {MESSAGES.map((m, i) => (
                <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[75%] px-5 py-3 text-[13px] font-medium leading-relaxed shadow-sm ${
                    m.from === 'customer' 
                      ? 'rounded-2xl rounded-bl-sm bg-[var(--bg-card)] border' 
                      : 'rounded-2xl rounded-br-sm text-white'
                  }`} style={{
                    background: m.from === 'customer' ? 'var(--bg-card)' : 'linear-gradient(135deg, var(--orange) 0%, #ff8a4c 100%)',
                    borderColor: m.from === 'customer' ? 'var(--border)' : 'transparent'
                  }}>
                    <span className="whitespace-pre-line">{m.text}</span>
                    <p className={`text-[9px] font-bold mt-2 flex items-center gap-1 justify-end ${m.from === 'customer' ? 'opacity-50' : 'text-white/80'}`}>
                      {m.time}
                      {m.from === 'bot' && <CheckCheck className="h-3 w-3" />}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t bg-[var(--bg-card)] z-10" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-3 max-w-4xl mx-auto">
                <input placeholder="Escribe un mensaje para responder manualmente..." 
                  className="flex-1 text-sm font-semibold px-5 py-3.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] shadow-sm"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} />
                <button className="px-5 py-3.5 rounded-2xl text-white shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center" 
                  style={{ background: 'var(--orange)' }}>
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
