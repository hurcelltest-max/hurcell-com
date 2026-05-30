'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setErrorMsg('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Humanize common Supabase errors
        if (error.message === 'Invalid login credentials') {
          setErrorMsg('Hatalı e-posta adresi veya şifre.');
        } else {
          setErrorMsg(error.message);
        }
        setLoading(false);
      } else {
        // Redirection is handled reactively by LayoutClient, but let's push for instant feedback
        router.push('/');
      }
    } catch (err: unknown) {
      setErrorMsg('Giriş yapılırken beklenmedik bir hata oluştu.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-sky-950 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">
            HurCELL Elite Tech
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Stok Yönetim Paneli
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Devam etmek için lütfen hesabınıza giriş yapın.
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300 backdrop-blur-sm animate-pulse">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span className="font-medium">{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-slate-300">
              E-posta Adresi
            </label>
            <input
              id="email"
              type="email"
              required
              disabled={loading}
              placeholder="isim@hurcell.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-semibold text-slate-300">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              required
              disabled={loading}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 py-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:from-sky-400 hover:to-sky-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Giriş yapılıyor...</span>
              </div>
            ) : (
              <span>Giriş Yap</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <p className="text-xs text-slate-500">
            © 2026 HurCELL Elite Tech. Tüm hakları saklıdır.
          </p>
        </div>

      </div>
    </div>
  );
}
