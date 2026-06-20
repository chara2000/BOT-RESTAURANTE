'use client';

import { Crown, MessageCircle, Phone, Star, User, Search, Filter } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';
import { SEGMENT_LABELS } from '@/types';

const CLIENT_TIERS: Record<string, string> = {
  regular: 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border)]',
  vip: 'bg-amber-500/10 text-amber-500 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  frequent: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
};

const SEGMENT_STYLES = {
  new: 'bg-sky-500/10 text-sky-500 border border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.25)]',
  frequent: 'bg-violet-500/10 text-violet-500 border border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.25)]',
  vip: 'bg-amber-500/10 text-amber-500 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  inactive: 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border)]',
};

export default function ClientesPage() {
  const { customers } = useAppData();

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-sky-500 opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Directorio de Clientes" subtitle="CRM, segmentación y métricas de lealtad" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 lg:space-y-8 z-10 relative">
        {/* Filters & Actions Bar */}
        <div className="flex flex-col md:flex-row gap-4 animate-fade-in-up">
          <div className="card flex-1 flex items-center px-4 py-2 gap-3">
             <Search className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
             <input type="text" placeholder="Buscar por nombre, teléfono o ID..." 
               className="flex-1 bg-transparent border-none focus:outline-none text-sm font-semibold" 
               style={{ color: 'var(--text-primary)' }} />
          </div>
          <button className="card px-5 py-3 flex items-center justify-center gap-2 text-sm font-black shadow-sm hover:shadow-md transition-shadow">
             <Filter className="w-4 h-4" /> Filtrar Segmentos
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in-up delay-100">
          {customers.map((c) => (
            <div key={c.id} className={`card p-6 flex flex-col space-y-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${c.segment === 'vip' ? 'ring-1 ring-amber-500/30' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-md shrink-0 relative overflow-hidden"
                       style={{ background: c.segment === 'vip' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    {c.segment === 'vip' ? <Crown className="h-7 w-7 text-white drop-shadow-sm" /> : <User className="h-6 w-6" style={{ color: 'var(--text-muted)' }} />}
                  </div>
                  <div>
                    <p className="text-base font-black truncate max-w-[150px] lg:max-w-[180px]">{c.name}</p>
                    <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${SEGMENT_STYLES[c.segment]}`}>
                      {SEGMENT_LABELS[c.segment]}
                    </span>
                  </div>
                </div>
                {c.segment === 'vip' && <Star className="h-5 w-5 text-amber-400 fill-amber-400 drop-shadow-md shrink-0 animate-pulse" />}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ticket Acumulado</p>
                  <p className="text-base font-black" style={{ color: 'var(--orange)' }}>{formatCompact(c.total_spent)}</p>
                </div>
                <div className="p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Frecuencia</p>
                  <p className="text-base font-black text-[var(--text-primary)]">{c.order_count} <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>pedidos</span></p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs font-medium pt-2 border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                <p className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors">
                  <span className="p-1.5 rounded-lg bg-[var(--bg-card)] border shadow-sm" style={{ borderColor: 'var(--border)' }}><Phone className="h-3.5 w-3.5" style={{ color: 'var(--orange)' }} /></span>
                  {c.phone}
                </p>
                {c.telegram_chat_id && (
                  <p className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors">
                    <span className="p-1.5 rounded-lg bg-[var(--bg-card)] border shadow-sm" style={{ borderColor: 'var(--border)' }}><MessageCircle className="h-3.5 w-3.5 text-sky-500" /></span>
                    Telegram ID: {c.telegram_chat_id}
                  </p>
                )}
                {c.address_default && (
                  <p className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg-input)] transition-colors truncate">
                    <span className="p-1.5 rounded-lg bg-[var(--bg-card)] border shadow-sm shrink-0" style={{ borderColor: 'var(--border)' }}>📍</span>
                    <span className="truncate">{c.address_default}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
