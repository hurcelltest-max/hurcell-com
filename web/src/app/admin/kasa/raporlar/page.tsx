'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  Download,
  Calendar,
  AlertTriangle,
  TrendingUp,
  MinusCircle,
  Wrench,
  DollarSign,
  Banknote,
  CreditCard,
} from 'lucide-react';

interface PeriodMetrics {
  period_name: string;
  start_date: string;
  end_date: string;
  opening_balance_kurus: number;
  closing_balance_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  gross_sales_kurus: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  returns_total_kurus: number;
  total_expenses_kurus: number;
  salary_expenses_kurus: number;
  technical_service_revenue_kurus: number;
  technical_service_expense_kurus: number;
  total_product_cost_kurus: number;
  net_profit_loss_kurus: number;
  missing_cost_sales_count: number;
  missing_cost_warning: boolean;
  category_summaries: Array<{
    category_id: string;
    category_name: string;
    count: number;
    cash_total_kurus: number;
    card_total_kurus: number;
    grand_total_kurus: number;
  }>;
  expense_summaries: Array<{
    category_id: string;
    category_name: string;
    amount_kurus: number;
  }>;
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function AdminKasaRaporlarPage() {
  const [period, setPeriod] = useState<'gunluk' | 'haftalik' | 'aylik' | 'yillik' | 'custom'>('gunluk');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [displayRange, setDisplayRange] = useState('');
  const [metrics, setMetrics] = useState<PeriodMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/api/kasa/reports?period=${period}`;
      if (period === 'custom' && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Rapor verisi yüklenemedi.');
      const data = await res.json();
      setMetrics(data.metrics);
      setDisplayRange(data.displayRange || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [period]);

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStart && customEnd) {
      loadReport();
    }
  };

  const exportCSV = () => {
    if (!metrics) return;
    const rows = [
      ['HurCELL Kasa Raporu', metrics.period_name, displayRange],
      ['Oluşturma Tarihi', new Date().toLocaleString('tr-TR')],
      [''],
      ['Metrik', 'Tutar (TL)'],
      ['Toplam Ciro', (metrics.gross_sales_kurus / 100).toFixed(2)],
      ['Nakit Tahsilat', (metrics.cash_collection_kurus / 100).toFixed(2)],
      ['Kredi Kartı Tahsilatı', (metrics.card_collection_kurus / 100).toFixed(2)],
      ['Teknik Servis Geliri', (metrics.technical_service_revenue_kurus / 100).toFixed(2)],
      ['Teknik Servis Gideri', (metrics.technical_service_expense_kurus / 100).toFixed(2)],
      ['Toplam Ürün Alış Maliyeti', (metrics.total_product_cost_kurus / 100).toFixed(2)],
      ['Toplam İşletme Gideri', (metrics.total_expenses_kurus / 100).toFixed(2)],
      ['Maaş Ödemeleri', (metrics.salary_expenses_kurus / 100).toFixed(2)],
      ['Net Dönem Kâr / Zarar', (metrics.net_profit_loss_kurus / 100).toFixed(2)],
      [''],
      ['Satış Kategorisi', 'Adet', 'Nakit (TL)', 'Kart (TL)', 'Toplam (TL)'],
      ...metrics.category_summaries.map((c) => [
        c.category_name,
        c.count,
        (c.cash_total_kurus / 100).toFixed(2),
        (c.card_total_kurus / 100).toFixed(2),
        (c.grand_total_kurus / 100).toFixed(2),
      ]),
      [''],
      ['Gider Kategorisi', 'Tutar (TL)'],
      ...metrics.expense_summaries.map((e) => [e.category_name, (e.amount_kurus / 100).toFixed(2)]),
    ];

    // CSV Kaçış (Formula Injection Protection)
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows
        .map((row) =>
          row
            .map((cell) => {
              const str = String(cell);
              if (/^[=+\-@]/.test(str)) {
                return `"'${str.replace(/"/g, '""')}"`;
              }
              return `"${str.replace(/"/g, '""')}"`;
            })
            .join(';')
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HurCELL_Kasa_Raporu_${period}_${metrics.start_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      {/* PRINT CSS STYLES */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header,
          nav,
          .no-print {
            display: none !important;
          }
          .print-area {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-card {
            border: 1px solid #ccc !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* HEADER (No-Print) */}
      <div className="flex items-center justify-between no-print flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/kasa"
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Kasa Raporları ve Çıktı Merkezi</h1>
            <p className="text-sm text-slate-500">Günlük, Haftalık, Aylık Kasa Föyü ve Dönemsel Kâr-Zarar</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md flex items-center gap-2 transition-all"
          >
            <Printer size={18} /> Raporu Yazdır (A4 / PDF)
          </button>

          <button
            onClick={exportCSV}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md flex items-center gap-2 transition-all"
          >
            <Download size={18} /> CSV Dışa Aktar
          </button>
        </div>
      </div>

      {/* RAPOR DÖNEM SEKMELERİ (No-Print) */}
      <div className="no-print space-y-4">
        <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl w-max flex-wrap">
          <button
            onClick={() => setPeriod('gunluk')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              period === 'gunluk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Günlük Rapor
          </button>
          <button
            onClick={() => setPeriod('haftalik')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              period === 'haftalik' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Haftalık Rapor
          </button>
          <button
            onClick={() => setPeriod('aylik')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              period === 'aylik' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Aylık Rapor
          </button>
          <button
            onClick={() => setPeriod('yillik')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              period === 'yillik' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Yıllık Rapor
          </button>
          <button
            onClick={() => setPeriod('custom')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              period === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Özel Tarih Aralığı
          </button>
        </div>

        {period === 'custom' && (
          <form onSubmit={handleCustomSearch} className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <input
              type="date"
              required
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input
              type="date"
              required
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800 transition-all"
            >
              Getir
            </button>
          </form>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-slate-500 font-medium">Rapor verileri hesaplanıyor...</div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
      ) : metrics ? (
        <div className="print-area space-y-6">
          {/* YAZDIRMA BAŞLIĞI */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between print-card">
            <div>
              <h2 className="text-xl font-bold text-slate-900">HurCELL İletişim Kasa Föyü & Raporu</h2>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Calendar size={14} /> Dönem: <span className="font-bold text-slate-800">{displayRange}</span>
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              Oluşturulma: {new Date().toLocaleDateString('tr-TR')}
            </div>
          </div>

          {/* EKSİK MALİYET UYARISI BANNER'I */}
          {metrics.missing_cost_warning && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 flex items-center gap-3 text-sm font-semibold shadow-sm">
              <AlertTriangle size={20} className="text-amber-600 shrink-0" />
              <span>
                Bazı ürünlerin alış maliyeti girilmediği için kesin net kâr hesaplanamıyor. ({metrics.missing_cost_sales_count} adet satışta maliyet eksik).
              </span>
            </div>
          )}

          {/* ÜST DÖNEM ÖZET KARTLARI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 print-card">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <TrendingUp size={14} /> Toplam Ciro
              </span>
              <div className="text-xl font-bold text-slate-900">{formatTL(metrics.gross_sales_kurus)}</div>
              <p className="text-[11px] text-slate-400">Brüt satış geliri</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 print-card">
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider block flex items-center gap-1">
                <Wrench size={14} /> Teknik Servis Geliri
              </span>
              <div className="text-xl font-bold text-purple-700">{formatTL(metrics.technical_service_revenue_kurus)}</div>
              <p className="text-[11px] text-slate-400">Servis & tamir satışı</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 print-card">
              <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block flex items-center gap-1">
                <MinusCircle size={14} /> Toplam Gider
              </span>
              <div className="text-xl font-bold text-rose-600">{formatTL(metrics.total_expenses_kurus)}</div>
              <p className="text-[11px] text-slate-400">Giderler + Maaşlar</p>
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm space-y-1 print-card ${
              metrics.net_profit_loss_kurus >= 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <span className="text-xs font-semibold uppercase tracking-wider block flex items-center gap-1">
                <DollarSign size={14} /> Net Kâr / Zarar
              </span>
              <div className={`text-2xl font-extrabold ${
                metrics.net_profit_loss_kurus >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {formatTL(metrics.net_profit_loss_kurus)}
              </div>
              <p className="text-[11px] opacity-75">
                {metrics.missing_cost_warning ? '⚠️ Eksik maliyetli ara sonuç' : 'Kesin hesaplanan dönem kârı'}
              </p>
            </div>
          </div>

          {/* NAKİT & KART DAĞILIMI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 print-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-emerald-700 flex items-center gap-1">
                  <Banknote size={16} /> Nakit Tahsilat Toplamı
                </span>
                <span className="font-extrabold text-emerald-900 text-lg">{formatTL(metrics.cash_collection_kurus)}</span>
              </div>
              <p className="text-xs text-slate-500">Kasa nakit girişleri</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 print-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-blue-700 flex items-center gap-1">
                  <CreditCard size={16} /> Kredi Kartı Tahsilat Toplamı
                </span>
                <span className="font-extrabold text-blue-900 text-lg">{formatTL(metrics.card_collection_kurus)}</span>
              </div>
              <p className="text-xs text-slate-500">POS cihazı koleksiyonu (Fiziksel kasaya girmez)</p>
            </div>
          </div>

          {/* 9 SATIŞ GELİR KATEGORİSİ TABLOSU */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print-card">
            <div className="p-4 border-b border-slate-100 font-bold text-slate-900 text-base">
              Satış ve Gelir Kategorileri Dağılımı (9 Kategori)
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">Gelir Kategorisi</th>
                  <th className="py-3 px-4 text-center">Satış Adedi</th>
                  <th className="py-3 px-4 text-right text-emerald-700">Nakit Tutarı</th>
                  <th className="py-3 px-4 text-right text-blue-700">Kredi Kartı Tutarı</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-800">Toplam Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {metrics.category_summaries.map((cat) => (
                  <tr key={cat.category_id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-900">{cat.category_name}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{cat.count} adet</td>
                    <td className="py-3 px-4 text-right text-emerald-600">{formatTL(cat.cash_total_kurus)}</td>
                    <td className="py-3 px-4 text-right text-blue-600">{formatTL(cat.card_total_kurus)}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{formatTL(cat.grand_total_kurus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 13 GİDER KATEGORİSİ TABLOSU */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print-card">
            <div className="p-4 border-b border-slate-100 font-bold text-slate-900 text-base">
              Gider ve Harcama Kategorileri Dağılımı (13 Kategori)
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">Gider Kategorisi</th>
                  <th className="py-3 px-4 text-right font-bold text-rose-700">Toplam Harcama (TL)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {metrics.expense_summaries.map((exp) => (
                  <tr key={exp.category_id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-900">{exp.category_name}</td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">{formatTL(exp.amount_kurus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
