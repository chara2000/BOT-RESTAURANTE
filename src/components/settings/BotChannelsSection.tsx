'use client';

import { useState, useEffect } from 'react';
import { Bot, MessageCircle, Eye, EyeOff, Copy, Check, RefreshCw, Trash2, ExternalLink, CheckCircle2 } from 'lucide-react';

interface BotStatus {
  telegram_bot_token: string | null;
  telegram_admin_chat_id: string | null;
  telegram_webhook_url: string | null;
  ycloud_api_key: string | null;
  ycloud_phone_number: string | null;
  ycloud_webhook_url: string | null;
  ycloud_webhook_secret: string | null;
}

export function BotChannelsSection({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'telegram' | 'whatsapp' | null>(null);
  const [success, setSuccess] = useState<'telegram' | 'whatsapp' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Telegram form state
  const [tgToken, setTgToken] = useState('');
  const [tgAdmin, setTgAdmin] = useState('');
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgResult, setTgResult] = useState<{ webhook_url?: string; registered?: boolean; error?: string } | null>(null);

  // WhatsApp/YCloud form state
  const [waApiKey, setWaApiKey] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waSecret, setWaSecret] = useState('');
  const [showWaKey, setShowWaKey] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [tenantId]);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/bots${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''}`, {
        headers: tenantId ? { 'x-tenant-id': tenantId } : {},
      });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function saveTelegram() {
    setSaving('telegram');
    setError(null);
    setTgResult(null);
    try {
      const body: Record<string, string> = {};
      if (tgToken) body.telegram_bot_token = tgToken;
      if (tgAdmin) body.telegram_admin_chat_id = tgAdmin;
      if (tenantId) body.tenant_id = tenantId;

      const res = await fetch('/api/settings/bots', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error guardando');

      setTgResult({
        webhook_url: data.telegram_webhook_url,
        registered: data.telegram_webhook_registered,
        error: data.telegram_webhook_error,
      });
      setSuccess('telegram');
      setTgToken('');
      setTgAdmin('');
      await fetchStatus();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(null);
  }

  async function saveWhatsApp() {
    setSaving('whatsapp');
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (waApiKey) body.ycloud_api_key = waApiKey;
      if (waPhone) body.ycloud_phone_number = waPhone;
      if (waSecret) body.ycloud_webhook_secret = waSecret;
      if (tenantId) body.tenant_id = tenantId;

      const res = await fetch('/api/settings/bots', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando');

      setSuccess('whatsapp');
      setWaApiKey('');
      setWaPhone('');
      setWaSecret('');
      await fetchStatus();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(null);
  }

  async function disconnect(channel: 'telegram' | 'whatsapp') {
    if (!confirm(`¿Desconectar ${channel === 'telegram' ? 'Telegram' : 'WhatsApp'}? El bot dejará de funcionar.`)) return;
    await fetch(`/api/settings/bots?channel=${channel}`, { method: 'DELETE' });
    await fetchStatus();
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const hasTelegram = !!status?.telegram_bot_token;
  const hasWhatsApp = !!status?.ycloud_api_key;

  return (
    <div
      className="card p-6 rounded-3xl space-y-6 animate-fade-in-up delay-100 border shadow-md xl:col-span-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Bot className="h-5 w-5 text-sky-500" /> Canales de Comunicación
        </p>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}>
          Multi-tenant — independiente por restaurante
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--orange)] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Telegram ─────────────────────────────────────── */}
          <div className="space-y-4 p-4 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#229ED9' }}>
                  ✈️
                </div>
                <div>
                  <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>Bot de Telegram</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    {hasTelegram ? (
                      <span className="text-emerald-500">● Configurado — webhook activo</span>
                    ) : '○ Sin configurar'}
                  </p>
                </div>
              </div>
              {hasTelegram && (
                <button
                  onClick={() => disconnect('telegram')}
                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors cursor-pointer"
                  title="Desconectar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Webhook URL (read-only when set) */}
            {status?.telegram_webhook_url && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Webhook URL activa
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={status.telegram_webhook_url}
                    className="flex-1 text-[10px] font-mono px-3 py-2 rounded-xl border truncate"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  />
                  <button
                    onClick={() => copyText(status.telegram_webhook_url!, 'tg-webhook')}
                    className="px-2 py-2 rounded-xl border transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  >
                    {copied === 'tg-webhook' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
                  </button>
                </div>
              </div>
            )}

            {/* Token input */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                {hasTelegram ? 'Cambiar Token (@BotFather)' : 'Token del Bot (@BotFather)'}
              </label>
              <div className="relative">
                <input
                  type={showTgToken ? 'text' : 'password'}
                  value={tgToken}
                  onChange={e => setTgToken(e.target.value)}
                  placeholder="1234567890:ABCdef..."
                  className="w-full text-xs font-mono px-3 py-2.5 pr-10 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowTgToken(!showTgToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showTgToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Admin Chat ID */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                Chat ID del Admin (para mensajes de clientes)
              </label>
              <input
                type="text"
                value={tgAdmin}
                onChange={e => setTgAdmin(e.target.value)}
                placeholder={status?.telegram_admin_chat_id || 'ej. 123456789'}
                className="w-full text-xs font-mono px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <p className="text-[9px] font-bold mt-1" style={{ color: 'var(--text-muted)' }}>
                Escríbele a <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="underline">@userinfobot</a> para obtener tu ID
              </p>
            </div>

            {/* Result banner */}
            {tgResult && (
              <div className={`text-[10px] font-bold p-2.5 rounded-xl border ${tgResult.registered ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
                {tgResult.registered
                  ? '✅ Webhook registrado automáticamente en Telegram'
                  : `⚠️ ${tgResult.error || 'Verifica el token e inténtalo de nuevo'}`}
              </div>
            )}

            <button
              onClick={saveTelegram}
              disabled={saving === 'telegram' || (!tgToken && !tgAdmin)}
              className="w-full py-2.5 rounded-xl text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
              style={{ background: 'var(--orange)' }}
            >
              {saving === 'telegram' ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</>
              ) : success === 'telegram' ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> ¡Guardado!</>
              ) : (
                '💾 Guardar y Activar Telegram'
              )}
            </button>
          </div>

          {/* ── WhatsApp / YCloud ─────────────────────────────── */}
          <div className="space-y-4 p-4 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#25D366' }}>
                  📱
                </div>
                <div>
                  <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>WhatsApp via YCloud</p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    {hasWhatsApp ? (
                      <span className="text-emerald-500">● Configurado — {status?.ycloud_phone_number || 'número activo'}</span>
                    ) : '○ Sin configurar'}
                  </p>
                </div>
              </div>
              {hasWhatsApp && (
                <button
                  onClick={() => disconnect('whatsapp')}
                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors cursor-pointer"
                  title="Desconectar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Webhook URL para pegar en YCloud */}
            {status?.ycloud_webhook_url && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Webhook URL — pega esto en YCloud Dashboard
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={status.ycloud_webhook_url}
                    className="flex-1 text-[10px] font-mono px-3 py-2 rounded-xl border truncate"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  />
                  <button
                    onClick={() => copyText(status.ycloud_webhook_url!, 'wa-webhook')}
                    className="px-2 py-2 rounded-xl border transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  >
                    {copied === 'wa-webhook' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
                  </button>
                  <a
                    href="https://app.ycloud.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-2 rounded-xl border transition-colors cursor-pointer flex items-center"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* API Key */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                API Key de YCloud
              </label>
              <div className="relative">
                <input
                  type={showWaKey ? 'text' : 'password'}
                  value={waApiKey}
                  onChange={e => setWaApiKey(e.target.value)}
                  placeholder={hasWhatsApp ? 'yc_live_***...  (dejar vacío para no cambiar)' : 'yc_live_...'}
                  className="w-full text-xs font-mono px-3 py-2.5 pr-10 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowWaKey(!showWaKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showWaKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Número WhatsApp */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                Número de WhatsApp (formato E.164)
              </label>
              <input
                type="text"
                value={waPhone}
                onChange={e => setWaPhone(e.target.value)}
                placeholder="+573001234567"
                className="w-full text-xs font-mono px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Webhook Secret (opcional) */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                Webhook Secret de YCloud (opcional)
              </label>
              <input
                type="text"
                value={waSecret}
                onChange={e => setWaSecret(e.target.value)}
                placeholder="Token secreto para verificar firmas"
                className="w-full text-xs font-mono px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {error && (
              <p className="text-[10px] font-bold p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
                ❌ {error}
              </p>
            )}

            <button
              onClick={saveWhatsApp}
              disabled={saving === 'whatsapp' || (!waApiKey && !waPhone && !waSecret)}
              className="w-full py-2.5 rounded-xl text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
              style={{ background: '#25D366' }}
            >
              {saving === 'whatsapp' ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</>
              ) : success === 'whatsapp' ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> ¡Guardado!</>
              ) : (
                '💾 Guardar WhatsApp'
              )}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
