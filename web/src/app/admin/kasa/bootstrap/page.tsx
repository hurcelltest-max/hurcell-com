'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, CheckCircle, Shield, ArrowRight } from 'lucide-react';

export default function AdminKasaBootstrapPage() {
  const router = useRouter();
  const [hasManager, setHasManager] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('hür');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/kasa/bootstrap');
      const data = await res.json();
      setHasManager(data.hasManager);
    } catch {
      setHasManager(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username.trim()) {
      return setError('Kullanıcı adı boş olamaz.');
    }

    if (!fullName.trim()) {
      return setError('Ad Soyad boş olamaz.');
    }

    if (password.length < 10) {
      return setError('Parola en az 10 karakter olmalıdır.');
    }

    if (password !== passwordConfirm) {
      return setError('Girilen parolalar birbiriyle eşleşmiyor.');
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/kasa/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          full_name: fullName.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'İlk yönetici hesabı oluşturulamadı.');
      }

      setSuccess(`İlk Yönetici Hesabı Başarıyla Oluşturuldu! Kullanıcı adı: ${data.user.username}`);
      setHasManager(true);

      setTimeout(() => {
        router.push('/admin/kasa');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Yükleniyor...</div>;
  }

  if (hasManager) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-4">
        <div className="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-2xl mb-2">
          <CheckCircle size={32} />
        </div>
        <h1 className="text-xl font-bold text-slate-800">İlk Kurulum Zaten Tamamlanmış</h1>
        <p className="text-sm text-slate-500">
          Sistemde aktif bir Kasa Yöneticisi mevcuttur. Güvenlik nedeniyle bootstrap ekranı kapalıdır.
        </p>
        <button
          onClick={() => router.push('/admin/kasa')}
          className="mt-4 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2"
        >
          Kasa Yönetim Paneline Git <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto my-8 bg-white rounded-2xl p-8 border border-amber-200 shadow-lg space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
          <Shield size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">İlk Kasa Yöneticisi Kurulumu</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            HurCELL Kasa için ilk yetkili yönetici hesabını oluşturun. (Türkçe karakterler desteklenir).
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <ShieldAlert size={18} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <CheckCircle size={18} className="shrink-0 text-emerald-500" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Yönetici Kullanıcı Adı
          </label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Örn: hür"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
          <p className="text-[11px] text-slate-400 mt-1">Türkçe karakter içerse dahi "hür" güvenle desteklenir.</p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Ad Soyad
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Örn: Hür Yönetici"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Parola / PIN (En az 10 karakter)
          </label>
          <input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            Parola Tekrar
          </label>
          <input
            type="password"
            required
            minLength={10}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="••••••••••••"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-all disabled:opacity-50 mt-2"
        >
          {submitting ? 'Yönetici Oluşturuluyor...' : 'İlk Kasa Yöneticisini Oluştur'}
        </button>
      </form>
    </div>
  );
}
