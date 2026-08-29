'use client';

import { useState } from 'react';
import { MessageCircle, Send, CheckCheck, MoreVertical, Search, Bot, User, Phone, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';

const CONVERSATIONS = [
  { id: 1, name: 'Juan Carlos G.', channel: 'Telegram', last: 'Quiero 2 hamburguesas trufa', time: '15:22', unread: 2, avatar: '🧑', active: true },
  { id: 2, name: 'María Paula A.', channel: 'Telegram', last: '¿Tienen pizza disponible?', time: '14:55', unread: 0, avatar: '👩', active: false },
  { id: 3, name: 'Andrés F.', channel: 'WhatsApp', last: 'Confirmar pedido ORD-005', time: '14:30', unread: 1, avatar: '🧔', active: false },
  { id: 4, name: 'Diana H.', channel: 'Telegram', last: 'Gracias, llegó perfecto!', time: '13:10', unread: 0, avatar: '👩‍🦰', active: false },
];

const INITIAL_MESSAGES = [
  { from: 'customer', text: 'Hola, quiero hacer un pedido', time: '15:20' },
  { from: 'bot', text: '¡Hola Juan! 👋 Bienvenido a ChefFlow. ¿Qué te gustaría ordenar hoy? Puedo mostrarte nuestro menú.', time: '15:20' },
  { from: 'customer', text: 'Quiero 2 hamburguesas trufa y una limonada de coco', time: '15:21' },
  { from: 'bot', text: '🛒 Pedido:\n• 2x Hamburguesa Premium Trufa — $64.000\n• 1x Limonada de Coco — $9.500\n\nSubtotal: $73.500\nDomicilio: $5.000\nTotal: $78.500\n\n¿Confirmas? Indica tu dirección y método de pago.', time: '15:21' },
  { from: 'customer', text: 'Calle 10A #34-56, pago con Nequi', time: '15:22' },
];

export default function MensajesPage() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [selectedConv, setSelectedConv] = useState(1);
  const [search, setSearch] = useState('');

  const activeConv = CONVERSATIONS.find((c) => c.id === selectedConv) || CONVERSATIONS[0];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { from: 'bot', text: inputText.trim(), time: now }]);
    setInputText('');
  };

  const filteredConvs = CONVERSATIONS.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.last.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Bandeja de Mensajes" subtitle="Soporte automatizado con IA y ventas vía Telegram y WhatsApp" />

      <div className="flex-1 overflow-hidden p-5 lg:p-8 z-10 relative">
        <div className="card flex h-[calc(100vh-180px)] rounded-3xl overflow-hidden shadow-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>

          {/* Conversations Sidebar */}
          <div className="w-80 shrink-0 border-r flex flex-col bg-[var(--bg-card)] relative z-10" style={{ borderColor: 'var(--border)' }}>
            <div className="p-5 border-b space-y-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <MessageCircle className="w-4 h-4 text-[var(--orange)]" /> Conversaciones
                </p>
                <span className="bg-[var(--orange)] text-white px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                  {CONVERSATIONS.length} activas
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Buscar chat por cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-xs font-semibold pl-10 pr-3 py-2.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredConvs.map((c) => {
                const isSelected = selectedConv === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConv(c.id)}
                    className={`w-full p-4 flex items-start gap-3 transition-all text-left border-b relative cursor-pointer ${
                      isSelected ? 'bg-orange-500/10' : 'hover:bg-[var(--bg-input)]'
                    }`}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--orange)] shadow-[0_0_8px_var(--orange)]" />}

                    <span className="text-3xl shrink-0">{c.avatar}</span>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                        <span className="text-[9px] font-bold" style={{ color: c.unread > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>{c.time}</span>
                      </div>
                      <p className={`text-[11px] truncate mb-1.5 ${c.unread > 0 ? 'font-black' : 'font-medium'}`} style={{ color: c.unread > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {c.last}
                      </p>
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-sm text-white"
                            style={{ background: c.channel === 'Telegram' ? '#229ED9' : '#25D366' }}>
                        {c.channel}
                      </span>
                    </div>
                    {c.unread > 0 && (
                      <span className="h-5 w-5 rounded-full text-[9px] font-black text-white flex items-center justify-center shadow-md animate-bounce shrink-0"
                            style={{ background: 'var(--orange)' }}>
                        {c.unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Chat Container */}
          <div className="flex-1 flex flex-col relative" style={{ background: 'var(--bg-input)' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-[var(--bg-card)] z-10" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-orange-500/10 flex items-center justify-center font-black text-xl">
                  {activeConv.avatar}
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{activeConv.name}</p>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    {activeConv.channel} · Bot ChefFlow Respondiendo
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> IA Activa
                </span>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar z-10">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[75%] px-5 py-3.5 text-xs font-semibold leading-relaxed shadow-md ${
                      m.from === 'customer'
                        ? 'rounded-3xl rounded-bl-sm border'
                        : 'rounded-3xl rounded-br-sm text-white'
                    }`}
                    style={{
                      background: m.from === 'customer' ? 'var(--bg-card)' : 'linear-gradient(135deg, var(--orange) 0%, #ff8a4c 100%)',
                      borderColor: m.from === 'customer' ? 'var(--border)' : 'transparent',
                      color: m.from === 'customer' ? 'var(--text-primary)' : '#fff',
                    }}
                  >
                    <span className="whitespace-pre-line">{m.text}</span>
                    <p className={`text-[9px] font-bold mt-2 flex items-center gap-1 justify-end ${m.from === 'customer' ? 'opacity-50' : 'text-white/80'}`}>
                      {m.time}
                      {m.from === 'bot' && <CheckCheck className="h-3 w-3" />}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Manual Reply Form */}
            <form onSubmit={handleSend} className="p-4 border-t bg-[var(--bg-card)] z-10" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-3 max-w-4xl mx-auto">
                <input
                  type="text"
                  placeholder="Escribe un mensaje para intervenir o responder manualmente..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 text-xs font-semibold px-5 py-3.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)] shadow-sm"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-6 py-3.5 rounded-2xl text-white font-black text-xs shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  style={{ background: 'var(--orange)' }}
                >
                  <Send className="h-4 w-4" />
                  <span>Enviar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
