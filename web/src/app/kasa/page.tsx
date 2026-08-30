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
  TrendingUp,
  MinusCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  AlertTriangle,
  Wrench,
  Edit3,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Coins,
  RefreshCw,
  Info,
} from 'lucide-react';
import { DashboardCarryoverInfo, KasaMonthlyReport } from '@/lib/kasa/types';

interface CategorySummary {
  category_id: string;
  category_name: string;
  count: number;
  cash_total_kurus: number;
  card_total_kurus: number;
  bank_transfer_total_kurus?: number;
  credit_total_kurus?: number;
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
  cash_reserve_target_kurus?: number;
  bank_deposits_total_kurus?: number;
  ts_cost_paid_from_cash_kurus?: number;
}

interface UserData {
  id: string;
  username: string;
  full_name: string;
  role: 'yonetici' | 'personel';
}

interface ExpenseItem {
  id: string;
  kasa_day_id: string;
  kasa_day_date?: string;
  expense_category_id: string;
  category_name?: string;
  amount_kurus: number;
  description: string;
  recipient_name?: string;
  status?: 'active' | 'cancelled';
  cancelled_at?: string;
  cancel_reason?: string;
  cancel_justification?: string;
  created_by_user_id: string;
  created_by_name?: string;
  cancelled_by_name?: string;
  created_at: string;
}

interface ExpenseSummaryItem {
  category_id: string;
  category_name: string;
  is_salary_category: boolean;
  count: number;
  active_total_kurus: number;
  cancelled_total_kurus: number;
  net_total_kurus: number;
}

interface TSDirectCostItem {
  id: string;
  receipt_no: string;
  customer_name: string;
  product_name: string;
  service_cost_kurus: number;
  service_cost_payment_status: string;
  paid_from_cash_kurus: number;
  unpaid_kurus: number;
  stock_kurus: number;
  status: string;
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format((kurus || 0) / 100);
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

  // Gider Ekleme Modalı State'leri
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string; is_salary_category: boolean }[]>([]);
  const [expenseCatId, setExpenseCatId] = useState('');
  const [expenseCategoriesLoading, setExpenseCategoriesLoading] = useState(false);
  const [expenseAmountTL, setExpenseAmountTL] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseRecipient, setExpenseRecipient] = useState('');
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);

  // Gider Listesi Modalı State'leri
  const [showExpenseListModal, setShowExpenseListModal] = useState(false);
  const [dailyExpenses, setDailyExpenses] = useState<ExpenseItem[]>([]);
  const [expenseListLoading, setExpenseListLoading] = useState(false);

  // Gider Düzeltme Modalı State'leri
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editExpCatId, setEditExpCatId] = useState('');
  const [editExpAmountTL, setEditExpAmountTL] = useState('');
  const [editExpDescription, setEditExpDescription] = useState('');
  const [editExpRecipient, setEditExpRecipient] = useState('');
  const [editExpJustification, setEditExpJustification] = useState('');
  const [editExpSubmitting, setEditExpSubmitting] = useState(false);
  const [editExpError, setEditExpError] = useState<string | null>(null);

  // Gider İptal Modalı State'leri
  const [cancellingExpense, setCancellingExpense] = useState<ExpenseItem | null>(null);
  const [cancelExpJustification, setCancelExpJustification] = useState('');
  const [cancelExpSubmitting, setCancelExpSubmitting] = useState(false);
  const [cancelExpError, setCancelExpError] = useState<string | null>(null);

  // Gider Özet Föyü State'leri (Bölüm A & Bölüm B)
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummaryItem[]>([]);
  const [tsDirectCosts, setTsDirectCosts] = useState<TSDirectCostItem[]>([]);
  const [tsSubtotals, setTsSubtotals] = useState<any | null>(null);
  const [expenseSummaryError, setExpenseSummaryError] = useState<string | null>(null);

  // Devir & Fiziksel Kasa Modalları
  const [carryoverInfo, setCarryoverInfo] = useState<DashboardCarryoverInfo | null>(null);
  const [showKasadanCikanModal, setShowKasadanCikanModal] = useState(false);
  const [showPhysicalCashModal, setShowPhysicalCashModal] = useState(false);
  const [targetDayId, setTargetDayId] = useState<string | null>(null);

  // Önceki Gün Kapatılmama Uyarısı State'leri
  const [isPreviousDayUnclosed, setIsPreviousDayUnclosed] = useState(false);
  const [unclosedDayDate, setUnclosedDayDate] = useState<string | null>(null);
  const [openDaysList, setOpenDaysList] = useState<any[]>([]);
  const [firstDayToClose, setFirstDayToClose] = useState<any | null>(null);

  // Aylık Bilanço State'leri
  const [selectedMonthISO, setSelectedMonthISO] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyReport, setMonthlyReport] = useState<KasaMonthlyReport | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);

  const loadExpenseSummary = async (dayId?: string) => {
    try {
      setExpenseSummaryError(null);
      const activeDayId = dayId || targetDayId;
      const url = activeDayId ? `/api/kasa/expense-summary?day_id=${encodeURIComponent(activeDayId)}` : '/api/kasa/expense-summary';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gider özeti veritabanından çekilemedi.');
      }
      setExpenseSummary(data.expenseSummary || []);
      setTsDirectCosts(data.tsDirectCosts || []);
      setTsSubtotals(data.tsSubtotals || null);
    } catch (err: any) {
      console.error(err);
      setExpenseSummaryError(err.message || 'Gider özeti yüklenirken hata oluştu.');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const meRes = await fetch('/api/kasa/auth/me');
      if (!meRes.ok) {
        router.push('/kasa/giris');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const dashRes = await fetch('/api/kasa/dashboard');
      const dashData = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashData.error || 'Kasa özet verisi yüklenemedi.');

      setMetrics(dashData.metrics);
      setCategories(dashData.categorySummary || []);
      setCarryoverInfo(dashData.carryoverInfo || null);
      setIsPreviousDayUnclosed(Boolean(dashData.is_previous_day_unclosed));
      setUnclosedDayDate(dashData.unclosed_day_date || null);
      setOpenDaysList(dashData.open_days || []);
      setFirstDayToClose(dashData.first_day_requiring_close || null);

      if (dashData.day) {
        setDayStatus(dashData.day.status);
        setDateStr(dashData.day.date_val);
        setTargetDayId(dashData.day.id);
        await loadExpenseSummary(dashData.day.id);
      } else {
        await loadExpenseSummary();
      }
    } catch (err: any) {
      setError(err.message || 'Gider özeti yüklenemedi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReportData = async (monthISO: string) => {
    try {
      setMonthlyLoading(true);
      const res = await fetch(`/api/kasa/monthly-report?month=${monthISO}`);
      if (res.ok) {
        const data = await res.json();
        setMonthlyReport(data.report);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMonthlyReportData(selectedMonthISO);
  }, [selectedMonthISO]);

  const [expenseListError, setExpenseListError] = useState<string | null>(null);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');

  const loadDailyExpenses = async (statusF: 'all' | 'active' | 'cancelled' = expenseStatusFilter) => {
    try {
      setExpenseListLoading(true);
      setExpenseListError(null);
      const res = await fetch(`/api/kasa/expenses?scope=all&status=${statusF}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gider listesi veritabanından çekilemedi.');
      }
      setDailyExpenses(data.expenses || []);
    } catch (err: any) {
      setExpenseListError(err.message || 'Gider listesi yüklenirken hata oluştu.');
    } finally {
      setExpenseListLoading(false);
    }
  };

  const openExpenseModal = async () => {
    setShowExpenseModal(true);
    setExpenseError(null);
    setExpenseSuccess(null);
    setExpenseAmountTL('');
    setExpenseDescription('');
    setExpenseRecipient('');
    setExpenseCategoriesLoading(true);

    try {
      const res = await fetch('/api/kasa/expense-categories');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gider kategorileri yüklenemedi. Lütfen tekrar deneyin.');
      }
      const rawCats = data.items || data.categories || data.expenseCategories || [];
      const validItems = rawCats.filter((c: any) => {
        if (user?.role === 'personel' && c.is_salary_category) return false;
        return true;
      });
      setExpenseCategories(validItems);
      if (validItems.length > 0) {
        setExpenseCatId(validItems[0].id);
      } else {
        setExpenseCatId('');
        setExpenseError('Aktif gider kategorisi bulunamadı. Lütfen tekrar deneyin.');
      }
    } catch (err: any) {
      setExpenseError(err.message || 'Gider kategorileri yüklenemedi. Lütfen tekrar deneyin.');
      setExpenseCategories([]);
      setExpenseCatId('');
    } finally {
      setExpenseCategoriesLoading(false);
    }
  };

  const handleCreateExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError(null);
    setExpenseSuccess(null);

    const cleanAmtStr = expenseAmountTL.replace(',', '.').trim();
    const amt = Number(cleanAmtStr);
    if (!expenseCatId) {
      setExpenseError('Lütfen gider kategorisi seçin.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setExpenseError('Geçerli pozitif bir gider tutarı girin.');
      return;
    }
    if (!expenseDescription.trim()) {
      setExpenseError('Gider açıklaması zorunludur.');
      return;
    }

    try {
      setExpenseSubmitting(true);
      const res = await fetch('/api/kasa/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_category_id: expenseCatId,
          amount_tl: amt,
          description: expenseDescription.trim(),
          recipient_name: expenseRecipient.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider kaydedilemedi.');

      setExpenseSuccess('Gider kaydı başarıyla oluşturuldu.');
      setExpenseAmountTL('');
      setExpenseDescription('');
      setExpenseRecipient('');
      setShowExpenseModal(false);
      await loadData();
    } catch (err: any) {
      setExpenseError(err.message || 'Gider kaydedilirken hata oluştu.');
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const openExpenseListModal = async () => {
    setShowExpenseListModal(true);
    await loadDailyExpenses('all');
  };

  const handleLogout = async () => {
    await fetch('/api/kasa/auth/logout', { method: 'POST' });
    router.push('/kasa/giris');
  };

  if (loading && !metrics) {
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

  const reserveTargetKurus = metrics?.cash_reserve_target_kurus || 1500000;
  const excessCashToBankKurus = (metrics?.expected_cash_kurus || 0) - reserveTargetKurus;

  const now = new Date();
  const currentCalendarMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isNextDisabled = selectedMonthISO >= currentCalendarMonthISO;

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

          <div className="flex items-center gap-3 flex-wrap">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">
              <User size={14} className="text-slate-500" />
              <span>{user?.full_name}</span>
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] uppercase font-bold">
                {user?.role === 'yonetici' ? 'Yönetici' : 'Personel'}
              </span>
            </div>

            <button
              onClick={openExpenseModal}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-rose-600/20 flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <MinusCircle size={18} /> Günlük Gider Ekle
            </button>

            <button
              onClick={openExpenseListModal}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
            >
              <List size={18} /> Giderler
            </button>

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
              <List size={18} /> Kasa Hareketleri
            </Link>

            <Link
              href="/admin/kasa/gun-sonu"
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
            >
              Gün Sonu
            </Link>

            {/* Ortak Role-Aware Rota: Personele de açık Günlük Arşiv */}
            <Link
              href="/kasa/gunluk-arsiv"
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
            >
              <Calendar size={16} /> Günlük Arşiv
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
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between flex-wrap gap-3 shadow-sm">
            <div>
              <div className="font-extrabold text-red-950">Gider özeti yüklenemedi: {error}</div>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Yeniden Dene
              </button>
              <Link
                href="/kasa/gunluk-arsiv"
                className="px-3.5 py-2 bg-white border border-red-300 text-red-800 hover:bg-red-50 text-xs font-bold rounded-xl transition shadow-sm"
              >
                Günlük Arşive Git →
              </Link>
            </div>
          </div>
        )}

        {isPreviousDayUnclosed && (
          <div className="p-5 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 space-y-3 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} className="text-amber-600 shrink-0" />
                <div>
                  <div className="font-extrabold text-sm text-amber-950 uppercase tracking-wide">
                    ÖNCEKİ KASA GÜNLERİ KAPATILMALI
                  </div>
                  <p className="text-xs text-amber-900 mt-0.5">
                    {unclosedDayDate} tarihli kasa günü henüz kapatılmamıştır. Kronolojik sıra bozulmadan işlemler devam edemez.
                  </p>
                </div>
              </div>
              <Link
                href={firstDayToClose ? `/admin/kasa/gun-sonu?day_id=${firstDayToClose.id}` : '/admin/kasa/gun-sonu'}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                Günü Kapat →
              </Link>
            </div>
          </div>
        )}

        {/* METRİK KARTLARI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* DÜZELTİLMİŞ KASADAN ÇIKAN GİDER KARTI */}
          <div
            onClick={() => setShowKasadanCikanModal(true)}
            className="bg-white hover:bg-rose-50/50 p-4 rounded-2xl border border-slate-200 hover:border-rose-300 shadow-sm space-y-1 cursor-pointer transition-all group"
          >
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block flex items-center justify-between">
              <span className="flex items-center gap-1"><MinusCircle size={14} /> KASADAN ÇIKAN GİDER</span>
              <span className="text-[10px] text-rose-500 group-hover:underline">Hesap Dökümü &gt;</span>
            </span>
            <div className="text-xl font-bold text-rose-600">
              {formatTL(metrics?.expenses_total_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Genel Gider + Maaş + Kasadan Ödenen TS Maliyeti</p>
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

          <div
            onClick={() => setShowPhysicalCashModal(true)}
            className={`p-4 rounded-2xl border shadow-md space-y-1 cursor-pointer transition-all group ${
              carryoverInfo?.carryover_status === 'pending_previous_close'
                ? 'bg-amber-950 hover:bg-amber-900 border-amber-400 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider block text-emerald-100 flex items-center justify-between">
              <span className="flex items-center gap-1">
                {carryoverInfo?.carryover_status === 'pending_previous_close' && <AlertTriangle size={14} className="text-amber-400" />}
                {carryoverInfo?.carryover_status === 'pending_previous_close' ? 'TAHMİNİ BEKLENEN FİZİKSEL KASA' : 'BEKLENEN FİZİKSEL KASA'}
              </span>
              <span className="text-[10px] text-emerald-200 group-hover:underline">Hesap Dökümü &gt;</span>
            </span>
            <div className="text-2xl font-extrabold text-white">
              {formatTL(carryoverInfo?.displayed_expected_cash_kurus || metrics?.expected_cash_kurus || 0)}
            </div>
            <p className="text-[11px] opacity-90">
              {carryoverInfo?.carryover_status === 'pending_previous_close'
                ? `${formatTL(carryoverInfo.displayed_carryover_kurus)} bekleyen devir + ${formatTL(carryoverInfo.today_net_cash_kurus)} bugünkü net nakit`
                : 'Kasada olması gereken net fiziki nakit (Tıklayın)'}
            </p>
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
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {metrics?.missing_cost_warning ? 'Tahmini Ara Sonuç' : 'Tahmini Dönem Kâr/Zarar'}
              </span>
              <div className={`text-xl font-extrabold ${
                (metrics?.estimated_profit_kurus || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatTL(metrics?.estimated_profit_kurus || 0)}
              </div>
              <p className="text-[11px] text-slate-400">
                {metrics?.missing_cost_warning ? '⚠️ Bazı satışlarda maliyet eksik olduğu için ara sonuç gösterilmektedir' : 'Net hesaplanan kâr/zarar'}
              </p>
            </div>
          </div>
        )}

        {/* BİRLEŞİK GÜNLÜK KASA ÖZET FÖYÜ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag size={18} className="text-blue-600" /> Günlük Kasa Özet Föyü ({dateStr})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Satışlar, tahsilatlar, genel giderler ve Teknik Servis maliyetlerinin birleşik kanonik görünümü</p>
            </div>
            <button
              onClick={openExpenseListModal}
              className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1"
            >
              Tüm Gider Listesini Gör &gt;
            </button>
          </div>

          {expenseSummaryError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>Gider Özeti Hatası: {expenseSummaryError}</span>
            </div>
          )}

          {/* BÖLÜM A: SATIŞLAR VE TAHSİLATLAR */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>A. SATIŞLAR VE TAHSİLATLAR</span>
              <span className="text-[10px] text-slate-400 font-normal">(public.kasa_sales)</span>
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-blue-50 text-blue-900 font-bold uppercase text-[10px] border-b border-blue-200">
                  <tr>
                    <th className="p-3">Satış Kategorisi</th>
                    <th className="p-3 text-center">İşlem / Adet</th>
                    <th className="p-3 text-right">Nakit (TL)</th>
                    <th className="p-3 text-right">Kredi Kartı (TL)</th>
                    <th className="p-3 text-right">Havale / EFT (TL)</th>
                    <th className="p-3 text-right">Cari / Veresiye (TL)</th>
                    <th className="p-3 text-right">Toplam Satış (TL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400 font-medium italic">
                        {dateStr} tarihinde henüz satış kaydı bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    categories.map((c) => (
                      <tr key={c.category_id} className="hover:bg-blue-50/30">
                        <td className="p-3 font-semibold text-slate-800">{c.category_name}</td>
                        <td className="p-3 text-center font-bold text-slate-700">{c.count}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">{formatTL(c.cash_total_kurus)}</td>
                        <td className="p-3 text-right font-bold text-blue-600">{formatTL(c.card_total_kurus)}</td>
                        <td className="p-3 text-right font-semibold text-purple-700">{formatTL(c.bank_transfer_total_kurus || 0)}</td>
                        <td className="p-3 text-right font-semibold text-amber-700">{formatTL(c.credit_total_kurus || 0)}</td>
                        <td className="p-3 text-right font-black text-slate-900">{formatTL(c.grand_total_kurus)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {categories.length > 0 && (
                  <tfoot className="bg-blue-50/60 font-bold text-slate-900 border-t border-blue-200">
                    <tr>
                      <td className="p-3">SATIŞ TOPLAMLARI</td>
                      <td className="p-3 text-center">{categories.reduce((sum, c) => sum + c.count, 0)}</td>
                      <td className="p-3 text-right text-emerald-600">{formatTL(categories.reduce((sum, c) => sum + c.cash_total_kurus, 0))}</td>
                      <td className="p-3 text-right text-blue-600">{formatTL(categories.reduce((sum, c) => sum + c.card_total_kurus, 0))}</td>
                      <td className="p-3 text-right text-purple-700">{formatTL(categories.reduce((sum, c) => sum + (c.bank_transfer_total_kurus || 0), 0))}</td>
                      <td className="p-3 text-right text-amber-700">{formatTL(categories.reduce((sum, c) => sum + (c.credit_total_kurus || 0), 0))}</td>
                      <td className="p-3 text-right text-slate-900 text-sm">{formatTL(categories.reduce((sum, c) => sum + c.grand_total_kurus, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* BÖLÜM B: GENEL KASA GİDERLERİ */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>B. GENEL KASA GİDERLERİ</span>
              <span className="text-[10px] text-slate-400 font-normal">(public.kasa_expenses)</span>
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Gider Kategorisi</th>
                    <th className="p-3 text-center">İşlem Adedi</th>
                    <th className="p-3 text-right">Brüt Gider Toplamı</th>
                    <th className="p-3 text-right">İptal / Düzeltme Toplamı</th>
                    <th className="p-3 text-right">Net Gider Toplamı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseSummary.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 font-medium italic">
                        {dateStr} tarihinde genel kasa gideri kaydedilmemiştir.
                      </td>
                    </tr>
                  ) : (
                    expenseSummary.map((item) => (
                      <tr key={item.category_id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-800">{item.category_name}</td>
                        <td className="p-3 text-center font-bold text-slate-700">{item.count}</td>
                        <td className="p-3 text-right font-bold text-rose-600">{formatTL(item.active_total_kurus)}</td>
                        <td className="p-3 text-right font-medium text-slate-400">{formatTL(item.cancelled_total_kurus)}</td>
                        <td className="p-3 text-right font-black text-rose-700">{formatTL(item.net_total_kurus)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {expenseSummary.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                    <tr>
                      <td className="p-3">GENEL GİDER TOPLAMI</td>
                      <td className="p-3 text-center">{expenseSummary.reduce((sum, i) => sum + i.count, 0)}</td>
                      <td className="p-3 text-right text-rose-600">
                        {formatTL(expenseSummary.reduce((sum, i) => sum + i.active_total_kurus, 0))}
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {formatTL(expenseSummary.reduce((sum, i) => sum + i.cancelled_total_kurus, 0))}
                      </td>
                      <td className="p-3 text-right text-rose-700 text-sm">
                        {formatTL(expenseSummary.reduce((sum, i) => sum + i.net_total_kurus, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* BÖLÜM C: TEKNİK SERVİS DOĞRUDAN MALİYETLERİ */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench size={14} className="text-purple-600" />
              <span>C. TEKNİK SERVİS DOĞRUDAN MALİYETLERİ</span>
              <span className="text-[10px] text-slate-400 font-normal">(kasa_sales.service_cost_kurus)</span>
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-purple-50 text-purple-900 font-bold uppercase text-[10px] border-b border-purple-200">
                  <tr>
                    <th className="p-3">Fiş No</th>
                    <th className="p-3">Müşteri Adı</th>
                    <th className="p-3">İşlem / Hizmet</th>
                    <th className="p-3 text-right">Doğrudan Maliyet</th>
                    <th className="p-3">Ödeme Durumu</th>
                    <th className="p-3 text-right">Kasadan Ödenen</th>
                    <th className="p-3 text-right">Ödenmemiş Borç</th>
                    <th className="p-3 text-right">Stoktan / Önceden Ödenmiş</th>
                    <th className="p-3 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tsDirectCosts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-slate-400 font-medium italic">
                        {dateStr} tarihinde Teknik Servis doğrudan maliyeti bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    tsDirectCosts.map((item) => (
                      <tr key={item.id} className="hover:bg-purple-50/40">
                        <td className="p-3 font-mono font-semibold text-slate-700">{item.receipt_no}</td>
                        <td className="p-3 font-medium text-slate-800">{item.customer_name}</td>
                        <td className="p-3 text-slate-700 font-medium">{item.product_name}</td>
                        <td className="p-3 text-right font-extrabold text-purple-900">{formatTL(item.service_cost_kurus)}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            {item.service_cost_payment_status === 'paid_from_cash'
                              ? 'Kasadan Ödendi'
                              : item.service_cost_payment_status === 'unpaid'
                              ? 'Henüz Ödenmedi (Borç)'
                              : item.service_cost_payment_status === 'no_cost'
                              ? 'Maliyet Yok'
                              : 'Önceden Ödendi / Stoktan'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-rose-600">{formatTL(item.paid_from_cash_kurus)}</td>
                        <td className="p-3 text-right font-bold text-amber-700">{formatTL(item.unpaid_kurus)}</td>
                        <td className="p-3 text-right font-semibold text-slate-500">{formatTL(item.stock_kurus)}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {tsSubtotals && tsDirectCosts.length > 0 && (
                  <tfoot className="bg-purple-50/80 font-bold text-purple-950 border-t border-purple-200">
                    <tr>
                      <td colSpan={3} className="p-3">TEKNİK SERVİS DOĞRUDAN MALİYET TOPLAMLARI</td>
                      <td className="p-3 text-right text-purple-900">{formatTL(tsSubtotals.total_ts_cost_kurus)}</td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right text-rose-600">{formatTL(tsSubtotals.paid_from_cash_ts_cost_kurus)}</td>
                      <td className="p-3 text-right text-amber-700">{formatTL(tsSubtotals.unpaid_ts_cost_kurus)}</td>
                      <td className="p-3 text-right text-slate-600">{formatTL(tsSubtotals.stock_ts_cost_kurus)}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* BÖLÜM D / ANA TOPLAM SATIRI: GÜNLÜK FİNANSAL SONUÇ FÖYÜ */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Coins size={16} className="text-emerald-400" /> D. GÜNLÜK FİNANSAL SONUÇ ÖZETİ
              </span>
              <span className="text-[10px] text-slate-400">({dateStr})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center text-xs">
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Brüt Satış</div>
                <div className="text-sm font-black text-white">{formatTL(metrics?.gross_sales_kurus || 0)}</div>
              </div>

              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-emerald-400 font-bold uppercase">Nakit Tahsilat</div>
                <div className="text-sm font-black text-emerald-400">+{formatTL(metrics?.cash_collection_kurus || 0)}</div>
              </div>

              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-blue-400 font-bold uppercase">Kart Tahsilatı</div>
                <div className="text-sm font-black text-blue-400">{formatTL(metrics?.card_collection_kurus || 0)}</div>
              </div>

              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-purple-400 font-bold uppercase">Havale / EFT</div>
                <div className="text-sm font-black text-purple-400">{formatTL(metrics?.bank_transfer_collection_kurus || 0)}</div>
              </div>

              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-rose-400 font-bold uppercase">Genel Gider</div>
                <div className="text-sm font-black text-rose-400">-{formatTL((metrics?.expenses_total_kurus || 0) - (metrics?.ts_cost_paid_from_cash_kurus || 0))}</div>
              </div>

              <div className="p-2 bg-slate-800/80 rounded-xl">
                <div className="text-[10px] text-purple-300 font-bold uppercase">Kasadan TS Maliyeti</div>
                <div className="text-sm font-black text-purple-300">-{formatTL(metrics?.ts_cost_paid_from_cash_kurus || 0)}</div>
              </div>

              <div className="p-2 bg-emerald-950/80 border border-emerald-500/30 rounded-xl">
                <div className="text-[10px] text-emerald-300 font-bold uppercase">Net Kasa Etkisi</div>
                <div className="text-sm font-black text-emerald-400">
                  {((metrics?.cash_collection_kurus || 0) - (metrics?.expenses_total_kurus || 0)) >= 0 ? '+' : ''}
                  {formatTL((metrics?.cash_collection_kurus || 0) - (metrics?.expenses_total_kurus || 0))}
                </div>
              </div>

              <div className="p-2 bg-blue-950/80 border border-blue-500/30 rounded-xl">
                <div className="text-[10px] text-blue-300 font-bold uppercase">
                  {metrics?.missing_cost_warning ? 'Tahmini Ara Sonuç' : 'Tahmini Kâr/Zarar'}
                </div>
                <div className="text-sm font-black text-blue-400">{formatTL(metrics?.estimated_profit_kurus || 0)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* HESAP DÖKÜMÜ MODALI (KASADAN ÇIKAN GİDER HESAP DÖKÜMÜ) */}
        {showKasadanCikanModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-100">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
                  <MinusCircle size={20} />
                  <span>KASADAN ÇIKAN GİDER HESAP DÖKÜMÜ ({dateStr})</span>
                </div>
                <button onClick={() => setShowKasadanCikanModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-rose-200/60">
                    <span className="font-semibold">Aktif Genel Kasa Giderleri:</span>
                    <span className="font-bold">{formatTL((metrics?.expenses_total_kurus || 0) - (metrics?.salary_expenses_kurus || 0) - (metrics?.ts_cost_paid_from_cash_kurus || 0))}</span>
                  </div>
                  {user?.role === 'yonetici' && (
                    <div className="flex justify-between items-center py-1 border-b border-rose-200/60">
                      <span className="font-semibold">Personel Maaş Ödemeleri:</span>
                      <span className="font-bold">{formatTL(metrics?.salary_expenses_kurus || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1 border-b border-rose-200/60">
                    <span className="font-semibold">Kasadan Ödenen TS Doğrudan Maliyeti:</span>
                    <span className="font-bold">{formatTL(metrics?.ts_cost_paid_from_cash_kurus || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-sm font-black text-rose-800">
                    <span>TOPLAM KASADAN ÇIKAN GİDER:</span>
                    <span>{formatTL(metrics?.expenses_total_kurus || 0)}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-slate-600">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <Info size={14} className="text-blue-600" /> Dahil Edilmeyen Kalemler:
                  </p>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5">
                    <li>Henüz ödenmemiş TS borçları (Kasadan çıkmaz)</li>
                    <li>Stoktan / Önceden ödenmiş TS maliyetleri (Bugün kasadan çıkmaz)</li>
                    <li>İptal edilmiş giderler (Aktif nakit çıkışı değildir)</li>
                  </ul>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setShowKasadanCikanModal(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GİDER EKLEME MODALI */}
        {showExpenseModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowExpenseModal(false);
            }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-base">
                  <MinusCircle size={20} />
                  <span>Günlük Kasa Gideri Ekle</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg transition"
                >
                  ✕
                </button>
              </div>

              {expenseError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-600 shrink-0" />
                    <span>{expenseError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={openExpenseModal}
                    className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg text-[11px] font-extrabold transition shrink-0"
                  >
                    Tekrar Dene
                  </button>
                </div>
              )}

              {expenseSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{expenseSuccess}</span>
                </div>
              )}

              <form onSubmit={handleCreateExpenseSubmit} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Gider Kategorisi *</label>
                  <select
                    required
                    disabled={expenseCategoriesLoading || expenseCategories.length === 0}
                    value={expenseCatId}
                    onChange={(e) => setExpenseCatId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:border-transparent disabled:opacity-60"
                  >
                    {expenseCategoriesLoading ? (
                      <option value="">Kategoriler yükleniyor...</option>
                    ) : expenseCategories.length === 0 ? (
                      <option value="">Gider kategorileri bulunamadı</option>
                    ) : (
                      expenseCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    💡 Satış fişine bağlı parça/doğrudan maliyeti ayrıca günlük gider olarak tekrar girmeyin.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Gider Tutarı (TL) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={expenseAmountTL}
                    onChange={(e) => setExpenseAmountTL(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Açıklama *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Gider detay açıklaması..."
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Ödeme Yapılan Kişi / Kurum (Opsiyonel)</label>
                  <input
                    type="text"
                    placeholder="Örn: Aras Kargo / Ahmet Bey"
                    value={expenseRecipient}
                    onChange={(e) => setExpenseRecipient(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowExpenseModal(false)}
                    className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={expenseSubmitting || expenseCategoriesLoading || expenseCategories.length === 0 || !expenseCatId}
                    className="w-2/3 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {expenseSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Kaydediliyor...</span>
                      </>
                    ) : (
                      'Gideri Kaydet'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
