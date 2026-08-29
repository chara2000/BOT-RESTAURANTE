'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/context/ThemeContext';
import { ChefHat, Eye, EyeOff, Loader2, Lock, Mail, AlertCircle, Sun, Moon } from 'lucide-react';

import { DEMO_TENANT_ID } from '@/lib/supabase/constants';

export default function LoginPage() {
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) throw new Error('Base de datos no configurada');

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(
          authError.message.includes('Invalid login')
            ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
            : authError.message
        );
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError('No se pudo autenticar el usuario.');
        setLoading(false);
        return;
      }

      if (data.session?.access_token) {
        const { setSecureCookie } = await import('@/lib/utils/safeStorage');
        setSecureCookie('sb-access-token', data.session.access_token, data.session.expires_in ?? 2592000);
      }

      // Get profile to check role
      let userRole = data.user.user_metadata?.role || 'admin';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.role) {
          userRole = profile.role;
        }
      } catch (profileErr) {
        console.warn('[Login] Non-blocking profile check:', profileErr);
      }

      // Instant 1-click redirect
      const targetUrl = userRole === 'delivery' ? '/inicio' : '/';
      window.location.href = targetUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div 
      className="h-screen w-screen flex transition-colors duration-500 overflow-hidden"
      style={{ 
        background: dark ? '#0b0914' : '#f8f7fa' 
      }}
    >
      {/* Left panel (SaaS Showcase) - Hidden on Mobile */}
      <div 
        className="hidden md:flex md:w-1/2 lg:w-3/5 h-full flex-col justify-between p-12 text-white relative overflow-hidden border-r"
        style={{
          borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          background: dark 
            ? 'radial-gradient(circle at 0% 0%, #151125 0%, #08060f 100%)' 
            : 'radial-gradient(circle at 0% 0%, #ffffff 0%, #f1edf7 100%)'
        }}
      >
        {/* Soft glowing ambient backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[var(--orange)] opacity-[0.06] dark:opacity-[0.09] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-500 opacity-[0.06] dark:opacity-[0.1] blur-[120px] pointer-events-none" />

        {/* Top Header */}
        <div className="z-10 flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ 
              background: 'linear-gradient(135deg, #ff6b35 0%, #ff8a4c 100%)',
              boxShadow: '0 4px 15px rgba(255,107,53,0.3)'
            }}
          >
            <ChefHat className="w-5.5 h-5.5 text-white" />
          </div>
          <span 
            className="text-lg font-black tracking-wider transition-colors"
            style={{ color: dark ? '#ffffff' : '#1e1b4b' }}
          >
            ChefFlow SaaS
          </span>
        </div>

        {/* Center Presentation */}
        <div className="z-10 my-auto max-w-md lg:max-w-lg space-y-8 text-left">
          <div className="space-y-4">
            <span 
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border"
              style={{
                background: dark ? 'rgba(255,107,53,0.1)' : 'rgba(255,107,53,0.08)',
                borderColor: 'rgba(255,107,53,0.2)',
                color: 'var(--orange)'
              }}
            >
              ✨ Monitoreo en tiempo real
            </span>
            <h2 
              className="text-4xl lg:text-5xl font-black leading-tight tracking-tight"
              style={{ color: dark ? '#ffffff' : '#1e1b4b' }}
            >
              Controla tu negocio <br />
              <span className="bg-gradient-to-r from-[var(--orange)] to-amber-500 bg-clip-text text-transparent">desde un solo lugar</span>.
            </h2>
            <p 
              className="text-xs lg:text-sm font-semibold leading-relaxed"
              style={{ color: dark ? '#9ca3af' : '#4b5563' }}
            >
              Sincroniza pedidos de Telegram, WhatsApp y Caja POS al instante. Administra inventario con alertas de stock bajo y rastrea repartidores por GPS en tiempo real.
            </p>
          </div>

          {/* Interactive Mock SaaS Dashboard Card */}
          <div 
            className="p-5 rounded-3xl border shadow-2xl space-y-4 backdrop-blur-md"
            style={{
              background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
            }}
          >
            <div 
              className="flex items-center justify-between border-b pb-3"
              style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span 
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: dark ? '#d1d5db' : '#4b5563' }}
                >
                  Estadísticas Hoy
                </span>
              </div>
              <span 
                className="text-[9px] font-black px-2 py-0.5 rounded-md"
                style={{ 
                  background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  color: dark ? '#9ca3af' : '#4b5563'
                }}
              >
                Activo
              </span>
            </div>

            {/* Live numbers block */}
            <div className="grid grid-cols-3 gap-4 text-left">
              <div className="space-y-1">
                <p 
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: dark ? '#9ca3af' : '#6b7280' }}
                >
                  Ventas
                </p>
                <p 
                  className="text-base lg:text-lg font-black"
                  style={{ color: dark ? '#ffffff' : '#1e1b4b' }}
                >
                  $1.248.500
                </p>
              </div>
              <div className="space-y-1">
                <p 
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: dark ? '#9ca3af' : '#6b7280' }}
                >
                  Pedidos
                </p>
                <p 
                  className="text-base lg:text-lg font-black flex items-center gap-1"
                  style={{ color: dark ? '#ffffff' : '#1e1b4b' }}
                >
                  92 
                  <span className="text-[9px] text-emerald-500 font-black">+18%</span>
                </p>
              </div>
              <div className="space-y-1">
                <p 
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: dark ? '#9ca3af' : '#6b7280' }}
                >
                  Repartidores
                </p>
                <p 
                  className="text-base lg:text-lg font-black"
                  style={{ color: dark ? '#ffffff' : '#1e1b4b' }}
                >
                  6 / 8
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-[9px] font-black">
                <span style={{ color: dark ? '#9ca3af' : '#6b7280' }}>Meta Ventas Diaria</span>
                <span style={{ color: 'var(--orange)' }}>84% completado</span>
              </div>
              <div 
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
              >
                <div 
                  className="h-full bg-gradient-to-r from-[var(--orange)] to-amber-500 rounded-full" 
                  style={{ width: '84%' }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div 
          className="z-10 flex justify-between items-center text-[10px] font-bold"
          style={{ color: dark ? '#4b5563' : '#9ca3af' }}
        >
          <span>© 2026 ChefFlow Inc. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <span>Términos</span>
            <span>Soporte</span>
          </div>
        </div>
      </div>

      {/* Right panel (Login Form Container) */}
      <div className="w-full md:w-1/2 lg:w-2/5 h-full flex flex-col justify-center items-center p-6 md:p-12 relative overflow-hidden z-10">
        
        {/* Floating Theme Button */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={toggleTheme}
            type="button"
            className="p-2.5 rounded-2xl border shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            style={{ 
              background: dark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: dark ? '#2a2a2a' : '#e5e7eb',
              color: dark ? '#fbbf24' : '#6366f1'
            }}
          >
            {dark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>
        </div>

        {/* Form area */}
        <div className="w-full max-w-sm flex flex-col justify-center h-full max-h-[640px] overflow-hidden">
          {/* Logo (Visible on mobile / redundant on desktop but clean) */}
          <div className="text-center mb-6 shrink-0">
            <div 
              className="inline-flex items-center justify-center w-16 h-16 rounded-[22px] mb-3 shadow-[0_8px_30px_rgba(255,107,53,0.3)] transition-transform duration-500 hover:rotate-6"
              style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #ff8a4c 100%)' }}
            >
              <ChefHat className="w-8 h-8 text-white" />
            </div>
            <h1 
              className="text-3xl font-black tracking-tight transition-colors duration-500"
              style={{ color: dark ? '#ffffff' : '#111827' }}
            >
              ChefFlow
            </h1>
            <p 
              className="text-[10px] font-black uppercase tracking-widest mt-1 transition-colors duration-500" 
              style={{ color: dark ? '#9ca3af' : '#6b7280' }}
            >
              Plataforma SaaS · Gestión de Restaurantes
            </p>
          </div>

          {/* Login Card */}
          <div 
            className="rounded-[28px] border p-6 md:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.1)] backdrop-blur-[20px] transition-all duration-500 flex flex-col overflow-hidden"
            style={{ 
              background: dark ? 'rgba(23, 23, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)', 
              borderColor: dark ? '#2a2a2a' : '#e5e7eb'
            }}
          >
            <div className="mb-4 shrink-0 text-left">
              <h2 
                className="text-lg font-black transition-colors duration-500"
                style={{ color: dark ? '#ffffff' : '#111827' }}
              >
                Iniciar Sesión
              </h2>
              <p 
                className="text-[10px] font-bold mt-0.5" 
                style={{ color: dark ? '#9ca3af' : '#6b7280' }}
              >
                Ingresa al panel administrativo
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 shrink-0 text-left">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-red-400 leading-snug">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 overflow-y-auto pr-1">
              {/* Email */}
              <div className="text-left">
                <label 
                  className="text-[9px] font-black uppercase tracking-widest mb-1.5 block" 
                  style={{ color: dark ? '#9ca3af' : '#6b7280' }}
                >
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail 
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" 
                    style={{ color: dark ? '#9ca3af' : '#6b7280' }} 
                  />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@chefflow.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border text-xs font-semibold focus:outline-none transition-all focus:ring-4"
                    style={{
                      background: dark ? '#0f0f0f' : '#f9fafb',
                      borderColor: dark ? '#2a2a2a' : '#d1d5db',
                      color: dark ? '#fff' : '#111827',
                      boxShadow: 'none',
                      // @ts-ignore
                      '--tw-ring-color': 'rgba(255,107,53,0.15)',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="text-left">
                <label 
                  className="text-[9px] font-black uppercase tracking-widest mb-1.5 block" 
                  style={{ color: dark ? '#9ca3af' : '#6b7280' }}
                >
                  Contraseña
                </label>
                <div className="relative">
                  <Lock 
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" 
                    style={{ color: dark ? '#9ca3af' : '#6b7280' }} 
                  />
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-11 py-3 rounded-xl border text-xs font-semibold focus:outline-none transition-all focus:ring-4"
                    style={{
                      background: dark ? '#0f0f0f' : '#f9fafb',
                      borderColor: dark ? '#2a2a2a' : '#d1d5db',
                      color: dark ? '#fff' : '#111827',
                      // @ts-ignore
                      '--tw-ring-color': 'rgba(255,107,53,0.15)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:opacity-100 cursor-pointer"
                    style={{ color: dark ? '#9ca3af' : '#6b7280', opacity: 0.7 }}
                  >
                    {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-white font-black text-xs transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(255,107,53,0.25)] flex items-center justify-center gap-2 cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #ff8a4c 100%)' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  'Entrar al Sistema'
                )}
              </button>
            </form>
          </div>

          <p 
            className="text-center text-[9px] font-bold mt-4 transition-colors duration-500 shrink-0" 
            style={{ color: dark ? '#4b5563' : '#9ca3af' }}
          >
            ChefFlow v2.0 · Plataforma Segura · Acceso Autorizado
          </p>
        </div>
      </div>
    </div>
  );
}
