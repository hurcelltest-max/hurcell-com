'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Coins,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Landmark,
  Clock,
  UserX,
  CreditCard,
  ShieldAlert,
} from 'lucide-react';
import { DashboardCarryoverInfo, KasaDashboardMetrics } from '@/lib/kasa/types';

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

export function KasaHeaderWidget() {
  const [metrics, setMetrics] = useState<KasaDashboardMetrics | null>(null);
  const [carryoverInfo, setCarryoverInfo] = useState<DashboardCarryoverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/kasa/dashboard');
      if (!res.ok) throw new Error('Kasa verisi alınamadı.');
      const data = await res.json();
      setMetrics(data.metrics);
      setCarryoverInfo(data.carryoverInfo || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const handleUpdate = () => fetchMetrics();
    if (typeof window !== 'undefined') {
      window.addEventListener('kasa-updated', handleUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('kasa-updated', handleUpdate);
      }
    };
  }, []);

  if (loading && !metrics) {
    return (
      <div className="bg-slate-900 text-white p-3 text-xs font-medium flex items-center justify-between sticky top-0 z-40">
        <span className="animate-pulse">HurCELL Kasa Durumu Yükleniyor...</span>
      </div>
    );
  }

  if (error || !metrics) return null;

  const usdCents = metrics.usd_balance_cents || 0;
  const eurCents = metrics.eur_balance_cents || 0;
  const openCredit = metrics.open_credit_total_kurus || 0;
  const overdueCredit = metrics.overdue_credit_total_kurus || 0;
  const overdueCustomerCount = metrics.overdue_customer_count || 0;
  const prudentResult = metrics.prudent_financial_result_kurus || 0;

  return (
    <div className="bg-slate-950 text-white border-b border-slate-800 shadow-md sticky top-0 z-40 no-print transition-all">
      <div className="max-w-7xl mx-auto px-4 py-2 space-y-2">
        {/* KRİTİK GECİKMİŞ CARİ ALACAK BİLDİRİM UYARISI (7 GÜNÜ AŞAN) */}
        {overdueCredit > 0 && (
          <Link
            href="/admin/kasa/cari?filter=overdue"
            className="p-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-between shadow-lg transition-all animate-pulse"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="shrink-0" />
              <span>
                DİKKAT: <strong>{overdueCustomerCount} Müşteride</strong> Toplam <strong>{formatTL(overdueCredit)}</strong> Gecikmiş Cari Alacak Bulunuyor! (7 Günü Geçmiş)
              </span>
            </div>
            <span className="underline text-[11px] font-bold uppercase tracking-wider">Cari Takip Ekranını Aç &rarr;</span>
          </Link>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* SOL TARAFA SABİTLENMİŞ KASA NAKİT, CARİ & DÖVİZ VARLIKLARI */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
            {/* FİZİKSEL TL KASA */}
            {carryoverInfo?.carryover_status === 'pending_previous_close' ? (
              <div className="flex items-center gap-2 bg-amber-950/90 border border-amber-500/50 text-amber-300 px-3 py-1.5 rounded-xl shadow-inner" title="Önceki gün kapanışı bekleniyor (Devir Onayı Bekliyor)">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-amber-400 font-extrabold">TAHMİNİ FİZİKSEL KASA</span>
                  <span className="text-sm font-black text-amber-300">
                    {formatTL(carryoverInfo.displayed_carryover_kurus)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-3 py-1.5 rounded-xl shadow-inner">
                <Banknote size={16} className="text-emerald-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Fiziksel TL Kasa</span>
                  <span className="text-sm font-black text-emerald-400">
                    {formatTL(metrics.expected_cash_kurus)}
                  </span>
                </div>
              </div>
            )}

            {/* DÖVİZ KASALARI */}
            {(usdCents > 0 || eurCents > 0) && (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-200">
                <Coins size={16} className="text-blue-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Döviz Kasaları</span>
                  <span className="text-xs font-bold space-x-1">
                    {usdCents > 0 && <span className="text-blue-300">{formatFX(usdCents, 'USD')}</span>}
                    {usdCents > 0 && eurCents > 0 && <span>|</span>}
                    {eurCents > 0 && <span className="text-indigo-300">{formatFX(eurCents, 'EUR')}</span>}
                  </span>
                </div>
              </div>
            )}

            {/* AÇIK CARİ ALACAK RISK BADGE */}
            <Link
              href="/admin/kasa/cari"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                openCredit > 0 ? 'bg-amber-950/80 border-amber-800 text-amber-300 hover:bg-amber-900' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <CreditCard size={16} className={openCredit > 0 ? 'text-amber-400' : 'text-slate-500'} />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider">Açık Cari Alacak</span>
                <span className="text-xs font-extrabold">{openCredit > 0 ? formatTL(openCredit) : 'Cari Borç Yok'}</span>
              </div>
            </Link>

            {/* GECİKEN CARİ (7+ GÜN) BADGE */}
            {overdueCredit > 0 && (
              <Link
                href="/admin/kasa/cari?filter=overdue"
                className="flex items-center gap-1.5 bg-red-950 border border-red-800 text-red-300 px-3 py-1.5 rounded-xl text-xs font-extrabold hover:bg-red-900"
              >
                <Clock size={16} className="text-red-400" />
                <span>Geciken (7+ Gün): {formatTL(overdueCredit)}</span>
              </Link>
            )}
          </div>
          {/* SAĞ TARAFA SABİTLENMİŞ BANKA UYARISI, KÂR VE İHTİYATLI SONUÇ */}
          <div className="flex items-center gap-3 text-xs font-semibold">
            {/* BANKA YATIRMA UYARISI */}
            {metrics.excess_cash_to_bank_kurus > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-300 px-3 py-1 rounded-xl border border-amber-500/30 font-bold">
                <Landmark size={14} className="text-amber-400" />
                <span>Bankaya Yatır: <strong>{formatTL(metrics.excess_cash_to_bank_kurus)}</strong></span>
              </div>
            )}

            {/* İHTİYATLI FİNANSAL SONUÇ */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border font-bold ${
              prudentResult < 0 ? 'bg-red-950 border-red-800 text-red-300' : 'bg-emerald-950 border-emerald-800 text-emerald-300'
            }`}>
              <TrendingUp size={14} />
              <span>İhtiyatlı Sonuç: <strong>{formatTL(prudentResult)}</strong></span>
            </div>

            <button
              onClick={fetchMetrics}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Yenile"
            >
              <RefreshCw size={14} />
            </button>

          </div>

        </div>
      </div>
    </div>
  );
}

export default KasaHeaderWidget;
