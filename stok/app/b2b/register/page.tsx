'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function B2bRegisterPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession?.user?.email) {
        setEmail(currentSession.user.email);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const payload = {
        sessionUserId: session?.user?.id,
        email: email.trim(),
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        taxNumber: taxNumber.trim(),
        city: city.trim(),
        note: note.trim()
      };

      const res = await fetch('/api/b2b/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Başvuru kaydedilemedi.');
        setLoading(false);
      } else {
        setSuccessMsg(data.message || 'Başvurunuz başarıyla alındı! Yönlendiriliyorsunuz...');
        setTimeout(() => {
          window.location.href = '/b2b/pending';
        }, 1500);
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg('Beklenmedik bir hata oluştu.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-sky-950 px-4 py-8">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">
            HurCELL B2B
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Bayilik Başvuru Formu
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Toptan fiyatlarla alışveriş yapmak için formu doldurun.
          </p>
        </div>

        {/* Message Alerts */}
        {errorMsg && (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span className="font-medium">{errorMsg}</span>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span className="font-medium">{successMsg}</span>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {/* Account Credentials (Only if not logged in) */}
          {!session && (
            <div className="grid grid-cols-1 gap-4 p-4 rounded-2xl border border-white/5 bg-white/2 space-y-4 sm:space-y-0">
              <div className="sm:col-span-1">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2">Hesap Bilgileri</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">E-posta Adresi</label>
                <input
                  type="email"
                  required
                  placeholder="bayi@firma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* Dealer Profile Information */}
          <div className="space-y-4 p-4 rounded-2xl border border-white/5 bg-white/2">
            <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Firma Bilgileri</p>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Şirket / Firma Ünvanı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Hurcell Teknoloji Ltd."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Yetkili Adı Soyadı *</label>
                <input
                  type="text"
                  required
                  placeholder="Ad Soyad"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Telefon Numarası *</label>
                <input
                  type="tel"
                  required
                  placeholder="05xx xxx xx xx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Vergi Dairesi & Numarası</label>
                <input
                  type="text"
                  placeholder="Vergi No / T.C. Kimlik"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300">Şehir / Bölge</label>
                <input
                  type="text"
                  placeholder="Örn: İstanbul / Kadıköy"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Ek Not / Açıklama</label>
              <textarea
                rows={2}
                placeholder="Varsa iletmek istedikleriniz..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-500 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-sky-500 py-3.5 text-sm font-semibold text-white transition hover:bg-sky-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-sky-500/20 cursor-pointer"
          >
            {loading ? "Başvuru Gönderiliyor..." : "Başvuruyu Tamamla"}
          </button>
        </form>

        {/* Login Redirect Link */}
        <div className="mt-8 text-center text-xs text-slate-400">
          Zaten bayi hesabınız var mı?{" "}
          <Link href="/b2b/login" className="font-semibold text-sky-400 hover:text-sky-300 transition">
            Giriş Yapın
          </Link>
        </div>
      </div>
    </div>
  );
}
