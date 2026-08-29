'use client';

import { useState } from 'react';
import { Crown, MessageCircle, Phone, Star, User, Search, Filter, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { formatCurrency, formatCompact } from '@/lib/utils';
import { SEGMENT_LABELS } from '@/types';

const SEGMENT_STYLES: Record<string, { label: string; bg: string; color: string; border: string }> = {
  new:       { label: 'Nuevo', bg: 'bg-sky-500/10', color: 'text-sky-400', border: 'border-sky-500/30' },
  frequent:  { label: 'Frecuente', bg: 'bg-emerald-500/10', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  vip:       { label: 'VIP', bg: 'bg-amber-500/10', color: 'text-amber-400', border: 'border-amber-500/30' },
  inactive:  { label: 'Inactivo', bg: 'bg-slate-500/10', color: 'text-slate-400', border: 'border-slate-500/30' },
};

export default function ClientesPage() {
  const { customers } = useAppData();
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Filter customers
  const filtered = customers.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = c.name.toLowerCase().includes(q);
      const phoneMatch = c.phone.includes(q);
      const addrMatch = c.address_default?.toLowerCase().includes(q);
      if (!nameMatch && !phoneMatch && !addrMatch) return false;
    }
    if (segmentFilter !== 'all' && c.segment !== segmentFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.03] rounded-full blur-[140px] pointer-events-none" />
      <Topbar title="Directorio de Clientes" subtitle="CRM, segmentación y métricas de lealtad" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 z-10 relative">
        {/* Filters & Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between animate-fade-in-up">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre, teléfono o dirección..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full text-xs font-semibold pl-11 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="relative">
              <select
                value={segmentFilter}
                onChange={(e) => { setSegmentFilter(e.target.value); setCurrentPage(1); }}
                className="pl-9 pr-8 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">Todos los segmentos</option>
                <option value="vip">VIP</option>
                <option value="frequent">Frecuentes</option>
                <option value="new">Nuevos</option>
                <option value="inactive">Inactivos</option>
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
            </div>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-3 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border outline-none cursor-pointer text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value={6}>6 / pág</option>
              <option value={9}>9 / pág</option>
              <option value={18}>18 / pág</option>
            </select>
          </div>
        </div>

        {/* Customer Cards Grid */}
        {paginated.length === 0 ? (
          <div className="card p-14 text-center space-y-3">
            <User className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>No se encontraron clientes</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Prueba ajustando los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in-up">
            {paginated.map((c) => {
              const seg = SEGMENT_STYLES[c.segment] || SEGMENT_STYLES.new;
              const isVip = c.segment === 'vip';
              const initials = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

              return (
                <div
                  key={c.id}
                  className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 ${
                    isVip
                      ? 'border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.12)] ring-1 ring-amber-500/30'
                      : 'border-[var(--border)] hover:border-orange-500/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                  }`}
                  style={{ background: 'var(--bg-card)' }}
                >
                  {/* Header Gradient */}
                  <div
                    className="relative h-24 overflow-hidden flex items-end px-5 pb-3"
                    style={{
                      background: isVip
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(251,191,36,0.08) 100%)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                    }}
                  >
                    <div className="relative z-10 flex items-center justify-between w-full">
                      {/* Avatar */}
                      <div className="relative">
                        <div
                          className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg border-2 ${
                            isVip
                              ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white border-amber-300'
                              : 'bg-orange-500/15 text-[var(--orange)] border-orange-500/30'
                          }`}
                        >
                          {isVip ? <Crown className="w-8 h-8 text-white drop-shadow-md" /> : initials || <User className="w-7 h-7" />}
                        </div>
                      </div>

                      {/* Segment badge */}
                      <span className={`text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full border flex items-center gap-1.5 ${seg.bg} ${seg.color} ${seg.border}`}>
                        {isVip && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                        {SEGMENT_LABELS[c.segment]}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex flex-col flex-1 p-5 pt-3 space-y-4">
                    <div>
                      <h3 className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</h3>
                      <p className="text-xs font-semibold flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        <Phone className="w-3 h-3 text-[var(--orange)] shrink-0" />
                        {c.phone}
                      </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ticket Acumulado</p>
                        <p className="text-base font-black mt-0.5" style={{ color: 'var(--orange)' }}>{formatCompact(c.total_spent)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Frecuencia</p>
                        <p className="text-base font-black mt-0.5" style={{ color: 'var(--text-primary)' }}>
                          {c.order_count} <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>pedidos</span>
                        </p>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="space-y-2 text-xs font-medium pt-1 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      {c.telegram_chat_id && (
                        <p className="flex items-center gap-2 truncate">
                          <MessageCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="truncate">Telegram: {c.telegram_chat_id}</span>
                        </p>
                      )}
                      {c.address_default && (
                        <p className="flex items-center gap-2 truncate">
                          <MapPin className="w-3.5 h-3.5 text-[var(--orange)] shrink-0" />
                          <span className="truncate">{c.address_default}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 rounded-3xl border bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
            Mostrando {filtered.length === 0 ? 0 : startIndex + 1} a {Math.min(startIndex + pageSize, filtered.length)} de {filtered.length} clientes
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={safePage <= 1}
              className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black px-3" style={{ color: 'var(--text-primary)' }}>
              Página {safePage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={safePage >= totalPages}
              className="p-2 rounded-xl border text-xs font-bold disabled:opacity-40 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
