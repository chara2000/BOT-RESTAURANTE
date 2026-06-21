'use client';

import { useState } from 'react';
import { Bot, CreditCard, Save, Shield, Clock, Store, Smartphone } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useAppData } from '@/context/AppDataContext';
import { PAYMENT_LABELS, type PaymentMethod } from '@/types';

const ROLES = [
  { role: 'Super Admin', desc: 'Acceso total al sistema', users: 1 },
  { role: 'Admin', desc: 'Gestión completa del restaurante', users: 2 },
  { role: 'Operador', desc: 'Pedidos, menú y caja', users: 3 },
  { role: 'Cocina', desc: 'Solo vista de pedidos', users: 4 },
  { role: 'Repartidor', desc: 'Domicilios y entregas', users: 2 },
];

export default function ConfiguracionPage() {
  const { settings, updateSettings } = useAppData();
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleHourChange = (index: number, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    const updated = settings.business_hours.map((h, idx) => {
      if (idx === index) {
        return { ...h, [field]: value };
      }
      return h;
    });
    updateSettings({ business_hours: updated });
  };

  const togglePayment = (method: PaymentMethod) => {
    const methods = settings.payment_methods.includes(method)
      ? settings.payment_methods.filter((m) => m !== method)
      : [...settings.payment_methods, method];
    updateSettings({ payment_methods: methods });
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500 opacity-[0.02] rounded-full blur-[100px] pointer-events-none" />
      <Topbar title="Ajustes del Sistema" subtitle="Personalización, integraciones, pagos y seguridad" />
      
      <div className="flex-1 overflow-y-auto p-5 lg:p-8 z-10 relative">
        <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 max-w-7xl mx-auto">
          
          {/* General */}
          <div className="card p-6 space-y-5 animate-fade-in-up">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <Store className="h-5 w-5 text-[var(--orange)]" /> Datos del Restaurante
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Nombre Comercial</label>
                <input defaultValue={settings.restaurant_name}
                  onChange={(e) => updateSettings({ restaurant_name: e.target.value })}
                  className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" 
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Tarifa Base Domicilio (COP)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[var(--text-muted)]">$</span>
                  <input type="number" defaultValue={settings.delivery_fee}
                    onChange={(e) => updateSettings({ delivery_fee: Number(e.target.value) })}
                    className="w-full text-sm font-semibold pl-8 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" 
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="card p-6 space-y-5 animate-fade-in-up delay-75">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <CreditCard className="h-5 w-5 text-emerald-500" /> Pasarelas y Métodos de Pago
            </p>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <button key={m} type="button" onClick={() => togglePayment(m)}
                  className="text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-sm border hover:shadow-md"
                  style={{
                    background: settings.payment_methods.includes(m) ? 'var(--orange)' : 'var(--bg-input)',
                    color: settings.payment_methods.includes(m) ? '#fff' : 'var(--text-muted)',
                    borderColor: settings.payment_methods.includes(m) ? 'var(--orange-glow)' : 'var(--border)',
                  }}>
                  {settings.payment_methods.includes(m) ? '✓ ' : ''}{PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Bots */}
          <div className="card p-6 space-y-5 animate-fade-in-up delay-150">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <Smartphone className="h-5 w-5 text-sky-500" /> Canales de Automatización
            </p>
            
            <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
              <input type="checkbox" checked={settings.telegram_enabled} onChange={(e) => updateSettings({ telegram_enabled: e.target.checked })} 
                className="w-5 h-5 accent-[var(--orange)]" />
              <div>
                <span className="text-sm font-black block">Activar Bot Telegram</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Recibe y gestiona pedidos automáticamente.</span>
              </div>
            </label>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Token de Acceso Telegram</label>
              <input placeholder="ej. 123456789:ABCdefGHIjkl..." defaultValue={settings.telegram_bot_token}
                onChange={(e) => updateSettings({ telegram_bot_token: e.target.value })}
                className="w-full text-sm font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]" 
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>

            <label className="flex items-center gap-3 p-4 rounded-xl border opacity-60 bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
              <input type="checkbox" disabled checked={settings.whatsapp_enabled} className="w-5 h-5" />
              <div>
                <span className="text-sm font-black block">WhatsApp Business Cloud API</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Próximamente disponible.</span>
              </div>
            </label>
          </div>

          {/* AI */}
          <div className="card p-6 space-y-5 animate-fade-in-up delay-200">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <Bot className="h-5 w-5 text-amber-500" /> Inteligencia Artificial
            </p>
            
            <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer hover:bg-[var(--bg-input)] transition-colors" style={{ borderColor: 'var(--border)' }}>
              <input type="checkbox" checked={settings.ai_enabled} onChange={(e) => updateSettings({ ai_enabled: e.target.checked })} 
                className="w-5 h-5 accent-[var(--orange)]" />
              <div>
                <span className="text-sm font-black block">Habilitar Asistente NLP</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Motor conversacional para análisis de datos.</span>
              </div>
            </label>

            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
               <p className="text-[11px] font-bold leading-relaxed text-amber-700 dark:text-amber-400">
                 El asistente opera de manera autónoma con las reglas locales de ChefFlow y procesa la información en tiempo real sin requerir APIs de LLM externos.
               </p>
            </div>
          </div>

          {/* Hours */}
          <div className="card p-6 space-y-5 xl:col-span-2 animate-fade-in-up delay-300">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <Clock className="h-5 w-5 text-[var(--orange)]" /> Horarios de Servicio
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {settings.business_hours.map((h, i) => (
                <div 
                  key={h.day} 
                  className="flex flex-col gap-3 p-5 rounded-3xl border transition-all duration-300 hover:shadow-lg relative overflow-hidden" 
                  style={{ 
                    borderColor: h.closed ? 'rgba(239, 68, 68, 0.2)' : 'var(--border)', 
                    background: h.closed ? 'rgba(239, 68, 68, 0.02)' : 'var(--bg-card)',
                  }}
                >
                  <div className={`absolute left-0 inset-y-0 w-1 ${h.closed ? 'bg-red-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                  
                  <div className="flex items-center justify-between pl-1">
                    <span className="text-sm font-black text-[var(--text-primary)]">{h.day}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!h.closed} 
                        onChange={(e) => handleHourChange(i, 'closed', !e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-8 h-4.5 bg-red-500/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                      <span className={`text-[9px] font-black uppercase tracking-wider ml-2 px-1.5 py-0.5 rounded-md ${
                        h.closed ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                      }`}>
                        {h.closed ? 'Cerrado' : 'Abierto'}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 pl-1">
                    <div className="flex-1">
                      <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Apertura</p>
                      <input 
                        type="time" 
                        value={h.open} 
                        disabled={h.closed}
                        onChange={(e) => handleHourChange(i, 'open', e.target.value)}
                        className="text-xs font-bold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none w-full text-center disabled:opacity-40" 
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} 
                      />
                    </div>
                    <span className="text-[10px] font-black pt-4" style={{ color: 'var(--text-muted)' }}>A</span>
                    <div className="flex-1">
                      <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Cierre</p>
                      <input 
                        type="time" 
                        value={h.close} 
                        disabled={h.closed}
                        onChange={(e) => handleHourChange(i, 'close', e.target.value)}
                        className="text-xs font-bold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-[var(--orange-soft)] outline-none w-full text-center disabled:opacity-40" 
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Roles */}
          <div className="card p-6 space-y-5 xl:col-span-2 animate-fade-in-up delay-500">
            <p className="text-sm font-black flex items-center gap-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border)' }}>
              <Shield className="h-5 w-5 text-violet-500" /> Permisos y Seguridad
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {ROLES.map((r) => (
                <div key={r.role} className="p-5 rounded-2xl border flex flex-col h-full" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <p className="text-sm font-black mb-1">{r.role}</p>
                  <p className="text-[10px] font-bold leading-snug flex-1" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-wider bg-[var(--orange-soft)] text-[var(--orange)] px-2 py-1 rounded-lg w-max shadow-sm">
                      {r.users} usuarios
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Action */}
          <div className="xl:col-span-2 flex justify-end animate-fade-in-up delay-700">
            <button type="submit" className="flex items-center gap-3 text-sm font-black px-8 py-4 rounded-xl text-white shadow-[0_4px_12px_var(--orange-glow)] hover:scale-105 active:scale-95 transition-all w-full md:w-auto justify-center"
              style={{ background: 'var(--orange)' }}>
              <Save className="h-5 w-5" />
              {saved ? '✓ Cambios Guardados' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
