'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSpreadsheet,
  Calendar,
  ArrowLeft,
  Coins,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Printer,
} from 'lucide-react';
import { KasaPeriodReportMetrics } from '@/lib/kasa/service';

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

export default function AdminKasaRaporlarPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState<KasaPeriodReportMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/api/kasa/reports?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Rapor verileri alınamadı.');
      const data = await res.json();
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || 'Rapor oluşturulurken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== 'custom') {
      fetchReport();
    }
  }, [period]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/kasa')}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-indigo-600" size={26} /> Kasa & Kâr-Zarar Dönem Raporları
            </h1>
            <p className="text-xs text-slate-500">Günlük, Haftalık, Aylık, Yıllık Kâr-Zarar ve İhtiyatlı Cari Risk Analizi</p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2"
        >
          <Printer size={16} /> Yazdır / PDF Al
        </button>
      </div>

      {/* DÖNEM SEÇİM SEKMELERİ */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 no-print">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPeriod('daily')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${period === 'daily' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Günlük Rapor
          </button>
          <button
            onClick={() => setPeriod('weekly')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${period === 'weekly' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Haftalık Rapor
          </button>
          <button
            onClick={() => setPeriod('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${period === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Aylık Rapor
          </button>
          <button
            onClick={() => setPeriod('yearly')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${period === 'yearly' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Yıllık Rapor
          </button>
          <button
            onClick={() => setPeriod('custom')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${period === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Özel Tarih Aralığı
          </button>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Başlangıç Tarihi</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Bitiş Tarihi</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div className="pt-5">
              <button
                onClick={fetchReport}
                disabled={!startDate || !endDate}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
              >
                Raporu Getir
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="p-8 text-center text-slate-500 font-medium">Rapor hesaplanıyor...</div>}
      {error && <div className="p-4 bg-red-50 text-red-700 text-sm font-bold rounded-2xl">{error}</div>}

      {/* RAPOR ÇIKTISI */}
      {report && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 print:p-0 print:border-none print:shadow-none">
          <div className="border-b pb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-black text-slate-900">{report.period_name} Kasa ve Mali Raporu</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tarih Aralığı: <strong>{report.start_date}</strong> ile <strong>{report.end_date}</strong> arası (Europe/Istanbul)</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold uppercase text-slate-400">Rapor Tarihi</span>
              <div className="text-xs font-bold text-slate-700">{new Date().toLocaleDateString('tr-TR')}</div>
            </div>
          </div>
          {/* İHTİYATLI YÖNETİM VE GERÇEKLEŞEN KÂR ÖZET KARTLARI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1">
              <span className="text-xs font-bold uppercase text-emerald-800 flex items-center gap-1">
                <TrendingUp size={16} /> Tahsil Edilmiş Gerçekleşen Net Kâr
              </span>
              <div className="text-2xl font-black text-emerald-950">{formatTL(report.realized_net_profit_kurus || 0)}</div>
              <div className="text-[11px] text-emerald-700 font-semibold">Tahsil edilmiş nakit/kart satış kârı</div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
              <span className="text-xs font-bold uppercase text-amber-900 flex items-center gap-1">
                <CreditCard size={16} /> Tahsil Edilmemiş Cari Risk
              </span>
              <div className="text-2xl font-black text-amber-950">-{formatTL(report.uncollected_credit_risk_kurus || 0)}</div>
              <div className="text-[11px] text-amber-800 font-extrabold">Açık veresiye alacak riski (Kırmızı)</div>
            </div>

            <div className={`p-4 rounded-2xl border space-y-1 ${report.prudent_financial_result_kurus < 0 ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'}`}>
              <span className="text-xs font-bold uppercase flex items-center gap-1 text-slate-800">
                <AlertTriangle size={16} /> İhtiyatlı Yönetim Metriği
              </span>
              <div className={`text-2xl font-black ${report.prudent_financial_result_kurus < 0 ? 'text-red-700' : 'text-indigo-900'}`}>
                {formatTL(report.prudent_financial_result_kurus || 0)}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">Gerçekleşen Kâr - Açık Cari Risk</div>
            </div>
          </div>

          {/* DETAYLI HAREKET TABLOSU */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Dönemsel Satış ve Cari Özeti</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold">Brüt Satış Cirosu</span>
                <div className="font-extrabold text-slate-900 text-sm">{formatTL(report.gross_sales_kurus)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold">Nakit Tahsilat</span>
                <div className="font-extrabold text-emerald-700 text-sm">{formatTL(report.cash_collection_kurus)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold">Kredi Kartı Tahsilat</span>
                <div className="font-extrabold text-blue-700 text-sm">{formatTL(report.card_collection_kurus)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold">Havale / EFT Tahsilat</span>
                <div className="font-extrabold text-purple-700 text-sm">{formatTL(report.bank_transfer_collection_kurus || 0)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold">Açılan Cari Satış</span>
                <div className="font-extrabold text-amber-900 text-sm">{formatTL(report.credit_sales_total_kurus || 0)}</div>
              </div>
            </div>
          </div>

          {/* KATEGORİ BAZLI SATIŞ DAĞILIMI */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Kategori Bazlı Satış Dağılımı</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">Kategori Adı</th>
                    <th className="p-2.5 text-center">Adet</th>
                    <th className="p-2.5 text-right">Nakit</th>
                    <th className="p-2.5 text-right">Kredi Kartı</th>
                    <th className="p-2.5 text-right">Havale / EFT</th>
                    <th className="p-2.5 text-right">Toplam Ciro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {report.category_summaries.map((cat) => (
                    <tr key={cat.category_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{cat.category_name}</td>
                      <td className="p-2.5 text-center">{cat.count}</td>
                      <td className="p-2.5 text-right text-emerald-700 font-semibold">{formatTL(cat.cash_total_kurus)}</td>
                      <td className="p-2.5 text-right text-blue-700 font-semibold">{formatTL(cat.card_total_kurus)}</td>
                      <td className="p-2.5 text-right text-purple-700 font-semibold">{formatTL(cat.bank_transfer_total_kurus || 0)}</td>
                      <td className="p-2.5 text-right font-black text-slate-900">{formatTL(cat.grand_total_kurus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GİDER DAĞILIMI */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Kasa Gider Toplamları</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {report.expense_summaries.map((exp) => (
                <div key={exp.category_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <span className="font-semibold text-slate-700">{exp.category_name}</span>
                  <span className="font-extrabold text-rose-700">{formatTL(exp.amount_kurus)}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
