'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  CheckCircle,
  AlertTriangle,
  Lock,
  ArrowLeft,
  Banknote,
  Coins,
  CreditCard,
  Clock,
} from 'lucide-react';
import { KasaDashboardMetrics } from '@/lib/kasa/types';

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

function formatFX(cents: number, symbol: string): string {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(cents / 100)} ${symbol}`;
}

export default function AdminGunSonuPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<KasaDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // TL Sayım State
  const [countedCashTL, setCountedCashTL] = useState('');

  // USD & EUR Sayım State
  const [countedUsd, setCountedUsd] = useState('');
  const [countedEur, setCountedEur] = useState('');
  const [closingNote, setClosingNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/kasa/dashboard');
        if (!res.ok) throw new Error('Dashboard verisi yüklenemedi.');
        const data = await res.json();
        setMetrics(data.metrics);
        if (data.metrics) {
          setCountedCashTL((data.metrics.expected_cash_kurus / 100).toString());
          setCountedUsd((data.metrics.usd_balance_cents / 100).toString());
          setCountedEur((data.metrics.eur_balance_cents / 100).toString());
        }
      } catch (err: any) {
        setError(err.message || 'Veriler alınırken hata oluştu.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const expectedCashTL = (metrics?.expected_cash_kurus || 0) / 100;
  const countedCashNum = Number(countedCashTL) || 0;
  const cashDifferenceTL = countedCashNum - expectedCashTL;

  const expectedUsdNum = (metrics?.usd_balance_cents || 0) / 100;
  const countedUsdNum = Number(countedUsd) || 0;
  const usdDifferenceNum = countedUsdNum - expectedUsdNum;

  const expectedEurNum = (metrics?.eur_balance_cents || 0) / 100;
  const countedEurNum = Number(countedEur) || 0;
  const eurDifferenceNum = countedEurNum - expectedEurNum;

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (countedCashTL === '' || isNaN(countedCashNum) || countedCashNum < 0) {
      return setError('Lütfen geçerli bir fiziki TL nakit sayımı girin.');
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/kasa/closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counted_cash_tl: countedCashNum,
          counted_usd: countedUsd !== '' ? Number(countedUsd) : undefined,
          counted_eur: countedEur !== '' ? Number(countedEur) : undefined,
          closing_note: closingNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gün sonu kapatılamadı.');

      setSuccess('Gün sonu başarıyla kapatıldı ve kasa kilitlendi!');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      setTimeout(() => {
        router.push('/admin/kasa/raporlar');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Gün kapatılırken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Kasa verileri yükleniyor...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/kasa')}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="text-emerald-600" size={26} /> Gün Sonu Kapanış İşlemi
          </h1>
          <p className="text-xs text-slate-500">Fiziksel Nakit TL, USD/EUR Döviz ve Gün Sonu Cari Veresiye Sayım Özeti</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-extrabold rounded-2xl flex items-center gap-2">
          <CheckCircle size={20} className="text-emerald-600" /> {success}
        </div>
      )}

      {/* GÜN SONU CARİ / VERESİYE HAREKET ÖZETİ */}
      {metrics && (
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-amber-950 font-bold text-sm border-b border-amber-200 pb-2">
            <span className="flex items-center gap-2">
              <CreditCard size={18} className="text-amber-700" /> Gün Sonu Cari / Veresiye Durum Özeti
            </span>
            <span className="text-xs bg-amber-200 px-2.5 py-0.5 rounded-lg text-amber-900 font-extrabold">
              İhtiyatlı Risk Takibi
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-3 rounded-xl border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Bugünkü Cari Satış</span>
              <div className="text-sm font-extrabold text-amber-900">{formatTL(metrics.credit_sales_total_kurus || 0)}</div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Bugünkü Cari Tahsilat</span>
              <div className="text-sm font-extrabold text-emerald-700">{formatTL(metrics.credit_collections_total_kurus || 0)}</div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Açık Cari Toplamı</span>
              <div className="text-sm font-black text-amber-950">{formatTL(metrics.open_credit_total_kurus || 0)}</div>
            </div>

            <div className={`p-3 rounded-xl border ${metrics.overdue_credit_total_kurus > 0 ? 'bg-red-100 border-red-300 text-red-950' : 'bg-white border-amber-200'}`}>
              <span className="text-[10px] uppercase font-extrabold flex items-center gap-1">
                <Clock size={12} /> 7+ Gün Geciken
              </span>
              <div className="text-sm font-black text-red-700">{formatTL(metrics.overdue_credit_total_kurus || 0)}</div>
              {metrics.overdue_customer_count > 0 && (
                <div className="text-[10px] font-bold text-red-800">{metrics.overdue_customer_count} Müşteride</div>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleCloseDay} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">

        {/* BEKLENEN VE SAYILAN FİZİKSEL TL KASA */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
              <Banknote size={16} className="text-emerald-400" /> Sistem Beklenen Fiziki TL Nakit:
            </span>
            <span className="text-xl font-extrabold text-emerald-400">{formatTL(metrics?.expected_cash_kurus || 0)}</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
              Kasada Kasa Sayımında Çıkan Gerçek TL Nakit (TL) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={countedCashTL}
              onChange={(e) => setCountedCashTL(e.target.value)}
              className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xl font-black text-white"
            />
          </div>

          {Math.abs(cashDifferenceTL) > 0.009 && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${cashDifferenceTL > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'}`}>
              <AlertTriangle size={16} />
              <span>TL Kasa Farkı: <strong>{cashDifferenceTL > 0 ? `+${cashDifferenceTL.toFixed(2)} TL FAZLA` : `${cashDifferenceTL.toFixed(2)} TL EKSİK`}</strong></span>
            </div>
          )}
        </div>

        {/* DÖVİZ SAYIMI (USD & EUR) */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Coins size={18} className="text-blue-600" /> Fiziksel Döviz Kasası Sayımı (USD & EUR)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Beklenen USD:</span>
                <span className="font-bold text-blue-900">{formatFX(metrics?.usd_balance_cents || 0, 'USD')}</span>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">Sayılan USD ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={countedUsd}
                  onChange={(e) => setCountedUsd(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                />
              </div>
              {Math.abs(usdDifferenceNum) > 0.009 && (
                <div className="text-[11px] font-bold text-amber-700">
                  Fark: {usdDifferenceNum > 0 ? `+${usdDifferenceNum.toFixed(2)} USD` : `${usdDifferenceNum.toFixed(2)} USD`}
                </div>
              )}
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Beklenen EUR:</span>
                <span className="font-bold text-indigo-900">{formatFX(metrics?.eur_balance_cents || 0, 'EUR')}</span>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">Sayılan EUR (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={countedEur}
                  onChange={(e) => setCountedEur(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                />
              </div>
              {Math.abs(eurDifferenceNum) > 0.009 && (
                <div className="text-[11px] font-bold text-amber-700">
                  Fark: {eurDifferenceNum > 0 ? `+${eurDifferenceNum.toFixed(2)} EUR` : `${eurDifferenceNum.toFixed(2)} EUR`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GÜN SONU NOTU */}
        <div>
          <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Kapanış Notu (Opsiyonel)</label>
          <textarea
            rows={2}
            placeholder="Nakit/döviz/cari veresiye sayımı veya kasa farkı açıklaması..."
            value={closingNote}
            onChange={(e) => setClosingNote(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Lock size={18} /> {submitting ? 'Kasa Kapatılıyor...' : 'Gün Sonunu Onayla ve Kasayı Kapat'}
        </button>

      </form>
    </div>
  );
}
