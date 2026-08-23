'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PlusCircle,
  List,
  LogOut,
  ShoppingBag,
  CreditCard,
  Banknote,
  DollarSign,
  TrendingUp,
  MinusCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  AlertTriangle,
  Wrench,
} from 'lucide-react';

interface CategorySummary {
  category_id: string;
  category_name: string;
  count: number;
  cash_total_kurus: number;
  card_total_kurus: number;
  bank_transfer_total_kurus?: number;
  grand_total_kurus: number;
}

interface Metrics {
  sales_count: number;
  total_quantity: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  bank_transfer_collection_kurus: number;
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
}

interface UserData {
  id: string;
  username: string;
  full_name: string;
  role: 'yonetici' | 'personel';
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function KasaMainDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [dayStatus, setDayStatus] = useState<'open' | 'closed'>('open');
  const [dateStr, setDateStr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const meRes = await fetch('/api/kasa/auth/me');
      if (!meRes.ok) {
        router.push('/kasa/giris');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const dashRes = await fetch('/api/kasa/dashboard');
      if (!dashRes.ok) throw new Error('Kasa özet verisi yüklenemedi.');
      const dashData = await dashRes.json();
      setMetrics(dashData.metrics);
      setCategories(dashData.categorySummary || []);
      setDayStatus(dashData.day?.status || 'open');
      setDateStr(dashData.day?.date_val || '');
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/kasa/auth/logout', { method: 'POST' });
    router.push('/kasa/giris');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Kasa Föyü Yükleniyor...</p>
        </div>
      </div>
    );
  }

  const grandCount = categories.reduce((sum, c) => sum + c.count, 0);
  const grandCash = categories.reduce((sum, c) => sum + c.cash_total_kurus, 0);
  const grandCard = categories.reduce((sum, c) => sum + c.card_total_kurus, 0);
  const grandBankTransfer = categories.reduce((sum, c) => sum + (c.bank_transfer_total_kurus || 0), 0);
  const grandTotal = categories.reduce((sum, c) => sum + c.grand_total_kurus, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <ShoppingBag size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-slate-900 leading-none">HurCELL Kasa Föyü</h1>
                {dayStatus === 'closed' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    KAPALI GÜN
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 size={12} /> AÇIK KASA
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Calendar size={12} /> Tarih: {dateStr}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">
              <User size={14} className="text-slate-500" />
              <span>{user?.full_name}</span>
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] uppercase font-bold">
                {user?.role === 'yonetici' ? 'Yönetici' : 'Personel'}
              </span>
            </div>

            <Link
              href="/kasa/satis"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <PlusCircle size={18} /> Yeni Satış Girişi
            </Link>

            <Link
              href="/kasa/hareketler"
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-sm font-medium rounded-xl flex items-center gap-2 transition-all"
            >
              <List size={18} /> Satışlar
            </Link>

            {user?.role === 'yonetici' && (
              <Link
                href="/admin/kasa"
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-xl transition-all"
              >
                Yönetici Paneli
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              title="Çıkış Yap"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* EKSİK MALİYET UYARISI BANNER'I */}
        {metrics?.missing_cost_warning && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 flex items-center gap-3 text-sm font-semibold shadow-sm">
            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            <span>Maliyet bilgisi eksik; net ürün kârı kesin hesaplanamıyor. (Satış maliyeti eksik kalemler bulunmaktadır).</span>
          </div>
        )}

        {/* ÜST ÖZET KARTLARI (Önceki gün devri, sermaye ve çekimler dahil) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Önceki Gün Devri
            </span>
            <div className="text-xl font-bold text-slate-900">
              {formatTL(metrics?.opening_balance_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Önceki günden devreden nakit</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block flex items-center gap-1">
              <Banknote size={14} /> Nakit Tahsilat
            </span>
            <div className="text-xl font-bold text-emerald-700">
              {formatTL(metrics?.cash_collection_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Nakit satış ödemeleri</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block flex items-center gap-1">
              <CreditCard size={14} /> Kredi Kartı Tahsilatı
            </span>
            <div className="text-xl font-bold text-blue-700">
              {formatTL(metrics?.card_collection_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">POS Cihazı (Nakit kasaya girmez)</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider block flex items-center gap-1">
              <Banknote size={14} /> Havale / EFT Tahsilatı
            </span>
            <div className="text-xl font-bold text-purple-700">
              {formatTL(metrics?.bank_transfer_collection_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Banka transferi (Nakit kasaya girmez)</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider block flex items-center gap-1">
              <Wrench size={14} /> Teknik Servis Geliri
            </span>
            <div className="text-xl font-bold text-purple-700">
              {formatTL(metrics?.technical_service_revenue_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Servis & tamir cirosu</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block flex items-center gap-1">
              <TrendingUp size={14} /> Günlük Toplam Satış
            </span>
            <div className="text-xl font-bold text-slate-900">
              {formatTL(metrics?.gross_sales_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Brüt satış cirosu</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block flex items-center gap-1">
              <MinusCircle size={14} /> Kasa Gideri
            </span>
            <div className="text-xl font-bold text-rose-600">
              {formatTL(metrics?.expenses_total_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Giderler + Maaşlar</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block flex items-center gap-1">
              <RotateCcw size={14} /> Nakit İade / İptal
            </span>
            <div className="text-xl font-bold text-amber-600">
              {formatTL(metrics?.returns_total_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">İade edilen nakit</p>
          </div>

          <div className="bg-emerald-600 text-white p-4 rounded-2xl border border-emerald-700 shadow-md space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider block text-emerald-100 flex items-center gap-1">
              <DollarSign size={14} /> Beklenen Fiziksel Kasa
            </span>
            <div className="text-2xl font-extrabold text-white">
              {formatTL(metrics?.expected_cash_kurus || 0)}
            </div>
            <p className="text-[11px] text-emerald-100/80">Kasada olması gereken net fiziki nakit</p>
          </div>
        </div>

        {/* YÖNETİCİ SERMAYE / SAHİP ÇEKİMİ BİLGİSİ */}
        {user?.role === 'yonetici' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-indigo-950">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Sermaye Girişleri</span>
              <div className="text-xl font-extrabold text-indigo-900">{formatTL(metrics?.capital_injected_kurus || 0)}</div>
              <p className="text-[11px] text-indigo-700/80">Kasaya eklenen işletme sermayesi (Ciro değildir)</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-950">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">İşletme Sahibi Çekimleri</span>
              <div className="text-xl font-extrabold text-amber-900">{formatTL(metrics?.owner_withdrawn_kurus || 0)}</div>
              <p className="text-[11px] text-amber-800/80">Kasadan patron çekimleri (Gider değildir)</p>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tahmini Dönem Kâr/Zarar</span>
              <div className={`text-xl font-extrabold ${
                (metrics?.estimated_profit_kurus || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatTL(metrics?.estimated_profit_kurus || 0)}
              </div>
              <p className="text-[11px] text-slate-400">
                {metrics?.missing_cost_warning ? '⚠️ Ürün maliyeti eksik ara sonuç' : 'Net hesaplanan kâr/zarar'}
              </p>
            </div>
          </div>
        )}

        {/* ANA EKRAN: KASA FÖYÜ TABLOSU (9 Kategori) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg text-slate-900">Günlük Kasa Özet Föyü</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                9 Satış ve Gelir Kategorisine göre miktar, nakit ve kredi kartı tahsilat dağılımı
              </p>
            </div>
            <button
              onClick={loadData}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Yenile
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-6">Gelir / Satış Kategorisi</th>
                  <th className="py-3.5 px-4 text-center">Miktar / Adet</th>
                  <th className="py-3.5 px-6 text-right text-emerald-700">Nakit Tutarı</th>
                  <th className="py-3.5 px-6 text-right text-blue-700">Kredi Kartı</th>
                  <th className="py-3.5 px-6 text-right text-purple-700">Havale / EFT</th>
                  <th className="py-3.5 px-6 text-right font-bold text-slate-800">Toplam Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {categories.map((cat) => (
                  <tr key={cat.category_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 text-slate-900 font-semibold">{cat.category_name}</td>
                    <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{cat.count} adet</td>
                    <td className="py-3.5 px-6 text-right text-emerald-600">{formatTL(cat.cash_total_kurus)}</td>
                    <td className="py-3.5 px-6 text-right text-blue-600">{formatTL(cat.card_total_kurus)}</td>
                    <td className="py-3.5 px-6 text-right text-purple-600">{formatTL(cat.bank_transfer_total_kurus || 0)}</td>
                    <td className="py-3.5 px-6 text-right font-bold text-slate-900">
                      {formatTL(cat.grand_total_kurus)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-base border-t-2 border-slate-900">
                  <td className="py-4 px-6 uppercase tracking-wider text-sm font-semibold">GENEL TOPLAM</td>
                  <td className="py-4 px-4 text-center text-amber-400">{grandCount} adet</td>
                  <td className="py-4 px-6 text-right text-emerald-400">{formatTL(grandCash)}</td>
                  <td className="py-4 px-6 text-right text-blue-400">{formatTL(grandCard)}</td>
                  <td className="py-4 px-6 text-right text-purple-300">{formatTL(grandBankTransfer)}</td>
                  <td className="py-4 px-6 text-right text-white font-extrabold text-lg">
                    {formatTL(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
