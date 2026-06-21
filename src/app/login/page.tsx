'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/context/ThemeContext';
import { ChefHat, Eye, EyeOff, Loader2, Lock, Mail, AlertCircle, Sun, Moon } from 'lucide-react';

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
        return;
      }

      if (!data.user) {
        setError('No se pudo autenticar el usuario.');
        return;
      }

      // Get profile to check role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .single();

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        setError('Tu cuenta está desactivada. Contacta al administrador.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="h-screen w-screen flex items-center justify-center relative overflow-hidden transition-colors duration-500 p-4"
      style={{ 
        background: dark 
          ? 'radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)' 
          : 'radial-gradient(circle at center, #fcfcfc 0%, #f3f4f6 100%)' 
      }}
    >
      {/* Background glowing spheres */}
      <div 
        className="absolute top-0 left-1/4 w-[250px] h-[250px] md:w-[500px] md:h-[500px] rounded-full blur-[100px] pointer-events-none transition-opacity duration-1000"
        style={{ 
          background: 'rgba(255, 107, 53, 0.12)', 
          opacity: dark ? 0.6 : 0.4 
        }} 
      />
      <div 
        className="absolute bottom-0 right-1/4 w-[250px] h-[250px] md:w-[400px] md:h-[400px] rounded-full blur-[100px] pointer-events-none transition-opacity duration-1000"
        style={{ 
          background: 'rgba(56, 189, 248, 0.08)', 
          opacity: dark ? 0.6 : 0.4 
        }} 
      />

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

      <div className="relative z-10 w-full max-w-sm flex flex-col justify-center h-full max-h-[640px] overflow-hidden">
        {/* Logo */}
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
          <div className="mb-4 shrink-0">
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
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 shrink-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-400 leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 overflow-y-auto pr-1">
            {/* Email */}
            <div>
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
            <div>
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
  );
}
