'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Banknote,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Scale,
  Landmark,
  ArrowUpRight,
  ShieldAlert,
  Coins,
  Globe,
} from 'lucide-react';

interface Metrics {
  sales_count: number;
  total_quantity: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  gross_sales_kurus: number;
  expenses_total_kurus: number;
  returns_total_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  expected_cash_kurus: number;
  opening_balance_kurus: number;
  salary_expenses_kurus: number;
  technical_service_revenue_kurus: number;
  technical_service_expense_kurus: number;
  missing_cost_warning: boolean;
  estimated_profit_kurus: number;
  cash_reserve_target_kurus: number;
  excess_cash_to_bank_kurus: number;
  bank_deposits_total_kurus: number;
  reserve_deficit_kurus: number;
  // USD & EUR
  usd_balance_cents: number;
  eur_balance_cents: number;
  usd_rate: number;
  eur_rate: number;
  fx_rate_source: string;
  fx_rate_as_of: string;
  fx_rate_fallback: boolean;
  usd_tl_equivalent_kurus: number;
  eur_tl_equivalent_kurus: number;
  total_fx_tl_equivalent_kurus: number;
  total_asset_try_equivalent_kurus: number;
  realized_fx_diff_total_kurus: number;
}

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

export default function KasaHeaderWidget() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<boolean>(false);

  // Bankaya Çık Modal State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [depositAmountTL, setDepositAmountTL] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);

  const loadMetrics = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(false);

      const res = await fetch('/api/kasa/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error('Dashboard verisi alınamadı.');
      const data = await res.json();

      setMetrics(data.metrics);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();

    const handleUpdate = () => loadMetrics(true);
    window.addEventListener('kasa-updated', handleUpdate);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMetrics(true);
      }
    }, 25000);

    return () => {
      window.removeEventListener('kasa-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [loadMetrics]);

  const handleBankDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepositError(null);
    setDepositSuccess(null);

    const amt = Number(depositAmountTL);
    if (isNaN(amt) || amt <= 0) {
      return setDepositError('Lütfen geçerli bir tutar girin.');
    }

    try {
      setDepositLoading(true);
      const res = await fetch('/api/admin/kasa/bank-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_tl: amt,
          bank_name: bankName,
          reference_no: referenceNo,
          description: depositDescription || 'Bankaya Yatırılan Nakit',
          idempotency_key: `bank_dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Banka yatırma işlemi başarısız.');

      setDepositSuccess('Bankaya nakit transferi başarıyla kaydedildi!');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      setTimeout(() => {
        setIsBankModalOpen(false);
        setDepositAmountTL('');
        setBankName('');
        setReferenceNo('');
        setDepositDescription('');
        setDepositSuccess(null);
      }, 1500);
    } catch (err: any) {
      setDepositError(err.message || 'İşlem başarısız.');
    } finally {
      setDepositLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="bg-white border-b border-slate-200 p-3 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between animate-pulse">
          <div className="h-8 bg-slate-200 rounded-lg w-48" />
          <div className="h-8 bg-slate-200 rounded-lg w-64" />
        </div>
      </div>
    );
  }

  const profitKurus = metrics?.estimated_profit_kurus || 0;
  const isMissingCost = metrics?.missing_cost_warning || false;
  const excessCashKurus = metrics?.excess_cash_to_bank_kurus || 0;
  const reserveDeficitKurus = metrics?.reserve_deficit_kurus || 0;
  const usdCents = metrics?.usd_balance_cents || 0;
  const eurCents = metrics?.eur_balance_cents || 0;

  return (
    <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm sticky top-0 z-40 no-print transition-all">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* SOL TARAFA SABİTLENMİŞ KASA NAKİT & DÖVİZ VARLIKLARI */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* HEDEF KASA & BANKA YATIRMA UYARISI */}
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Kasada Korunacak Nakit: <strong>{formatTL(metrics.cash_reserve_target_kurus)}</strong></span>
              {metrics.excess_cash_to_bank_kurus > 0 ? (
                <span className="text-amber-400 font-extrabold flex items-center gap-1">
                  ⚠️ Bankaya Yatırılacak: {formatTL(metrics.excess_cash_to_bank_kurus)}
                </span>
              ) : (
                <span className="text-slate-400">✅ Banka Çıkış İhtiyacı Yok</span>
              )}
            </div>
            {/* FİZİKSEL TL KASA */}
            <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl shadow-inner">
              <Banknote size={18} className="text-emerald-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block leading-none">
                  Fiziksel TL Kasa
                </span>
                <span className="text-sm font-black text-white leading-tight">
                  {formatTL(metrics?.expected_cash_kurus || 0)}
                </span>
              </div>
            </div>
            {/* DÖVİZ KASALARI (USD / EUR) */}
            {(usdCents > 0 || eurCents > 0) && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-800">
                <Coins size={18} className="text-blue-600 shrink-0" />
                <div className="flex items-center gap-2 text-xs font-bold">
                  {usdCents > 0 && (
                    <span className="text-blue-900" title={`TL Karşılığı: ${formatTL(metrics?.usd_tl_equivalent_kurus || 0)}`}>
                      {formatFX(usdCents, 'USD')}
                    </span>
                  )}
                  {eurCents > 0 && (
                    <span className="text-indigo-900" title={`TL Karşılığı: ${formatTL(metrics?.eur_tl_equivalent_kurus || 0)}`}>
                      {formatFX(eurCents, 'EUR')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* TOPLAM VARLIK (TL + DÖVİZ KARŞILIĞI) */}
            <div className="hidden lg:flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-blue-950">
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-700 block leading-none">
                  Toplam Kasa Varlığı (TL)
                </span>
                <span className="text-sm font-extrabold text-blue-950 leading-tight">
                  {formatTL(metrics?.total_asset_try_equivalent_kurus || 0)}
                </span>
              </div>
            </div>

            {/* BANKAYA YATIRILACAK FAZLA TL NAKİT UYARISI */}
            {excessCashKurus > 0 ? (
              <div className="flex items-center gap-2 bg-amber-500 text-slate-950 px-3 py-1 rounded-xl shadow-md font-bold text-xs border border-amber-400 animate-pulse">
                <ShieldAlert size={16} className="shrink-0 text-slate-950" />
                <div>
                  <span className="text-[9px] uppercase font-extrabold block leading-none text-slate-900">
                    BANKAYA YATIRILACAK TL
                  </span>
                  <span className="text-xs font-black text-slate-950">
                    {formatTL(excessCashKurus)} FAZLA
                  </span>
                </div>
                <button
                  onClick={() => {
                    setDepositAmountTL((excessCashKurus / 100).toString());
                    setIsBankModalOpen(true);
                  }}
                  className="ml-1 px-2 py-0.5 bg-slate-950 hover:bg-slate-900 text-amber-400 text-[11px] font-black rounded-lg shadow transition-all flex items-center gap-1 shrink-0"
                >
                  <ArrowUpRight size={12} /> Bankaya Çık
                </button>
              </div>
            ) : null}

            {/* KÂR / ZARAR ROZETİ */}
            <div>
              {isMissingCost ? (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-xl text-amber-900 text-xs font-bold">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span className="text-amber-950 font-extrabold text-[11px]">KESİN HESAPLANAMADI</span>
                </div>
              ) : profitKurus > 0 ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-xl text-emerald-900 text-xs font-bold">
                  <TrendingUp size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-extrabold text-[11px]">+{formatTL(profitKurus)} KÂR</span>
                </div>
              ) : profitKurus < 0 ? (
                <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-xl text-rose-900 text-xs font-bold">
                  <TrendingDown size={14} className="text-rose-600 shrink-0" />
                  <span className="text-rose-700 font-extrabold text-[11px]">{formatTL(profitKurus)} ZARAR</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-xl text-slate-800 text-xs font-bold">
                  <Scale size={14} className="text-slate-500 shrink-0" />
                  <span className="text-slate-700 font-extrabold text-[11px]">0,00 TL BAŞABAŞ</span>
                </div>
              )}
            </div>

          </div>

          {/* SAĞ TARAFTAKİ DÖVİZ KUR BİLGİSİ VE YENİLEME */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto py-0.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-[11px]" title={`Kur Kaynağı: ${metrics?.fx_rate_source}`}>
              <Globe size={13} className="text-slate-500" />
              <span>USD: <strong>{metrics?.usd_rate?.toFixed(2)} TL</strong></span>
              <span className="text-slate-300">|</span>
              <span>EUR: <strong>{metrics?.eur_rate?.toFixed(2)} TL</strong></span>
            </div>

            <button
              onClick={() => loadMetrics(true)}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              title="Yenile"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            </button>
          </div>

        </div>
      </div>

      {/* BANKAYA ÇIK MODAL */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Landmark size={20} className="text-indigo-600" /> Bankaya TL Nakit Çıkışı (Transfer)
              </h3>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold">
              ⚠️ Bankaya yatırılan para varlık transferidir; <strong>GİDER VEYA ZARAR DEĞİLDİR</strong>. Net kârınızı etkilemez, yalnızca fiziki TL kasa nakdini azaltır.
            </div>

            {depositError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">{depositError}</div>}
            {depositSuccess && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">{depositSuccess}</div>}

            <form onSubmit={handleBankDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Bankaya Yatırılacak Tutar (TL) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={depositAmountTL}
                  onChange={(e) => setDepositAmountTL(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-extrabold text-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Banka Adı (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Örn: Garanti BBVA / Akbank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Dekont / Referans No (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Örn: TR123456789"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Açıklama</label>
                <textarea
                  rows={2}
                  placeholder="Transfer açıklaması..."
                  value={depositDescription}
                  onChange={(e) => setDepositDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={depositLoading}
                  className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {depositLoading ? 'Aktarılıyor...' : 'Bankaya Aktar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
