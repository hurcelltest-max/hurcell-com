'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, ArrowLeft, TrendingUp, ShieldCheck, AlertCircle, Building, PieChart } from 'lucide-react';
import { KasaBalanceSheetReport } from '@/lib/kasa/types';

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus);
}

export default function AdminBilancoPage() {
  const router = useRouter();
  const [report, setReport] = useState<KasaBalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/kasa/balance-sheet');
      if (!res.ok) throw new Error('Bilanço raporu yüklenemedi.');
      const data = await res.json();
      setReport(data.report || null);
    } catch (err: any) {
      setError(err.message || 'Rapor alınırken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Bilanço ve kâr-zarar raporu yükleniyor...</div>;
  }

  const fin = report?.financial_status;
  const inc = report?.income_statement;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/kasa')}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Scale className="text-indigo-600" size={26} /> İşletme Finansal Durum & Bilanço Ekranı
          </h1>
          <p className="text-xs text-slate-500">Varlıklar, Yükümlülükler, Net Finansal Pozisyon ve Dönem Kâr-Zarar Özeti</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl">
          {error}
        </div>
      )}

      {/* FİNANSAL DURUM VE VARLIK ÖZETİ (BİLANÇO) */}
      {fin && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Building size={20} className="text-indigo-600" /> A) Finansal Durum ve Varlık Özeti ({report.as_of_date})
            </h2>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-bold border border-indigo-200">
              Net Varlık: {formatTL(fin.net_financial_assets_try)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Fiziki TL Nakit Kasa</span>
              <div className="text-xl font-black text-emerald-700">{formatTL(fin.physical_cash_tl)}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Banka Hesapları Bakiyesi</span>
              <div className="text-xl font-black text-blue-900">{formatTL(fin.bank_balances_try)}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">POS Bekleyen Alacak</span>
              <div className="text-xl font-black text-amber-900">{formatTL(fin.pending_pos_receivables_try)}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Açık Cari Alacaklar</span>
              <div className="text-xl font-black text-indigo-900">{formatTL(fin.open_credit_receivables_try)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-emerald-800 uppercase">Toplam Likit Varlık</span>
              <div className="text-xl font-black text-emerald-900">{formatTL(fin.total_liquid_assets_try)}</div>
              <p className="text-[10px] text-emerald-700">Fiziki Nakit Kasa + Banka Hesapları Bakiyesi</p>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-blue-800 uppercase">Toplam Finansal Varlık</span>
              <div className="text-xl font-black text-blue-900">{formatTL(fin.total_financial_assets_try)}</div>
              <p className="text-[10px] text-blue-700">Likit Varlık + POS Alacağı + Cari Alacak</p>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-red-800 uppercase">Toplam Kayıtlı Yükümlülük</span>
              <div className="text-xl font-black text-red-900">{formatTL(fin.total_liabilities_try)}</div>
              <p className="text-[10px] text-red-700">{fin.liabilities_status_note}</p>
            </div>
          </div>
        </div>
      )}

      {/* DÖNEM KÂR / ZARAR TABLOSU */}
      {inc && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-600" /> B) Aybaşından Bugüne Kâr / Zarar Tablosu ({inc.month_label})
            </h2>
            <span className={`text-xs px-3 py-1 rounded-lg font-extrabold border ${inc.net_profit_tl >= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              Net Kâr: {formatTL(inc.net_profit_tl)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Brüt Satış Cirosu</span>
              <div className="text-lg font-black text-slate-900">{formatTL(inc.gross_turnover_tl)}</div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Ürün Satış Maliyeti</span>
              <div className="text-lg font-black text-slate-700">{formatTL(inc.product_sales_cost_tl)}</div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Teknik Servis Maliyeti</span>
              <div className="text-lg font-black text-slate-700">{formatTL(inc.ts_direct_cost_tl)}</div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <span className="text-[10px] font-extrabold text-emerald-800 uppercase">Brüt Kâr</span>
              <div className="text-lg font-black text-emerald-900">{formatTL(inc.gross_profit_tl)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
