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
  Edit3,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Coins,
} from 'lucide-react';
import { DashboardCarryoverInfo, KasaMonthlyReport } from '@/lib/kasa/types';

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
  cash_reserve_target_kurus?: number;
  bank_deposits_total_kurus?: number;
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
  expense_category_id: string;
  category_name?: string;
  amount_kurus: number;
  description: string;
  recipient_name?: string;
  status?: 'active' | 'cancelled';
  cancelled_at?: string;
  cancel_reason?: string;
  created_by_user_id: string;
  created_by_name?: string;
  created_at: string;
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

  // Gider Ekleme Modalı State'leri
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string; is_salary_category: boolean }[]>([]);
  const [expenseCatId, setExpenseCatId] = useState('');
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

  // Gider Özet Föyü State'leri
  const [expenseSummary, setExpenseSummary] = useState<any[]>([]);

  // Devir & Fiziksel Kasa Modalları
  const [carryoverInfo, setCarryoverInfo] = useState<DashboardCarryoverInfo | null>(null);
  const [showDevirModal, setShowDevirModal] = useState(false);
  const [showPhysicalCashModal, setShowPhysicalCashModal] = useState(false);
  const [targetDayId, setTargetDayId] = useState<string | null>(null);
  const [repairOpeningTL, setRepairOpeningTL] = useState('');
  const [repairJustification, setRepairJustification] = useState('');
  const [repairSubmitting, setRepairSubmitting] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  // Önceki Gün Kapatılmama Uyarısı State'leri
  const [isPreviousDayUnclosed, setIsPreviousDayUnclosed] = useState(false);
  const [unclosedDayDate, setUnclosedDayDate] = useState<string | null>(null);

  // Aylık Bilanço State'leri
  const [selectedMonthISO, setSelectedMonthISO] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyReport, setMonthlyReport] = useState<KasaMonthlyReport | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);

  const loadExpenseSummary = async () => {
    try {
      const res = await fetch('/api/kasa/expense-summary');
      if (res.ok) {
        const data = await res.json();
        setExpenseSummary(data.expenseSummary || []);
      }
    } catch (err) {
      console.error(err);
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

      if (dashData.day) {
        setDayStatus(dashData.day.status);
        setDateStr(dashData.day.date_val);
        setTargetDayId(dashData.day.id);
      }
      await loadExpenseSummary();
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
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

  const loadDailyExpenses = async () => {
    try {
      setExpenseListLoading(true);
      const res = await fetch('/api/kasa/expenses');
      if (res.ok) {
        const data = await res.json();
        setDailyExpenses(data.expenses || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExpenseListLoading(false);
    }
  };

  const openExpenseListModal = async () => {
    setShowExpenseListModal(true);
    await loadDailyExpenses();
  };

  const handleLogout = async () => {
    await fetch('/api/kasa/auth/logout', { method: 'POST' });
    router.push('/kasa/giris');
  };

  const openExpenseModal = async () => {
    setExpenseError(null);
    setExpenseSuccess(null);
    setExpenseAmountTL('');
    setExpenseDescription('');
    setExpenseRecipient('');

    try {
      const res = await fetch('/api/kasa/expense-categories');
      if (res.ok) {
        const data = await res.json();
        const cats = data.categories || [];
        setExpenseCategories(cats);
        if (cats.length > 0) {
          const defaultCat = cats.find((c: any) => !c.is_salary_category && c.name !== 'Personel Maaşı') || cats[0];
          setExpenseCatId(defaultCat.id);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setShowExpenseModal(true);
  };

  const openEditExpenseModal = async (exp: ExpenseItem) => {
    setEditExpError(null);
    setEditingExpense(exp);
    setEditExpCatId(exp.expense_category_id);
    setEditExpAmountTL((exp.amount_kurus / 100).toString());
    setEditExpDescription(exp.description);
    setEditExpRecipient(exp.recipient_name || '');
    setEditExpJustification('');

    if (expenseCategories.length === 0) {
      try {
        const res = await fetch('/api/kasa/expense-categories');
        if (res.ok) {
          const data = await res.json();
          setExpenseCategories(data.categories || []);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseCatId || !expenseAmountTL || !expenseDescription.trim()) {
      setExpenseError('Lütfen kategori, tutar ve açıklama alanlarını doldurun.');
      return;
    }

    try {
      setExpenseSubmitting(true);
      setExpenseError(null);

      const res = await fetch('/api/kasa/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_category_id: expenseCatId,
          amount_tl: Number(expenseAmountTL),
          description: expenseDescription.trim(),
          recipient_name: expenseRecipient.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider eklenemedi.');

      setExpenseSuccess('Gider başarıyla kaydedildi.');
      setShowExpenseModal(false);
      await loadData();
      await loadMonthlyReportData(selectedMonthISO);
    } catch (err: any) {
      setExpenseError(err.message || 'Gider eklenirken hata oluştu.');
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    if (!editExpJustification.trim()) {
      return setEditExpError('Gider düzeltme için gerekçe girilmesi zorunludur.');
    }

    if (!editExpAmountTL || Number(editExpAmountTL) <= 0 || !editExpDescription.trim()) {
      return setEditExpError('Lütfen geçerli bir tutar ve açıklama girin.');
    }

    try {
      setEditExpSubmitting(true);
      setEditExpError(null);

      const res = await fetch(`/api/kasa/expenses/${editingExpense.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_category_id: editExpCatId,
          amount_tl: Number(editExpAmountTL),
          description: editExpDescription.trim(),
          recipient_name: editExpRecipient.trim() || undefined,
          justification: editExpJustification.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider düzeltilemedi.');

      setEditingExpense(null);
      await loadDailyExpenses();
      await loadData();
      await loadMonthlyReportData(selectedMonthISO);
    } catch (err: any) {
      setEditExpError(err.message || 'Gider düzeltilirken hata oluştu.');
    } finally {
      setEditExpSubmitting(false);
    }
  };

  const handleCancelExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingExpense) return;

    if (!cancelExpJustification.trim()) {
      return setCancelExpError('Gider iptali için gerekçe belirtilmesi zorunludur.');
    }

    try {
      setCancelExpSubmitting(true);
      setCancelExpError(null);

      const res = await fetch(`/api/kasa/expenses/${cancellingExpense.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: cancelExpJustification.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider iptal edilemedi.');

      setCancellingExpense(null);
      setCancelExpJustification('');
      await loadDailyExpenses();
      await loadData();
      await loadMonthlyReportData(selectedMonthISO);
    } catch (err: any) {
      setCancelExpError(err.message || 'Gider iptal edilirken hata oluştu.');
    } finally {
      setCancelExpSubmitting(false);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = selectedMonthISO.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    const newMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    setSelectedMonthISO(newMonth);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonthISO.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 1));
    const now = new Date();
    const currentCalendarMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const newMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (newMonth <= currentCalendarMonthISO) {
      setSelectedMonthISO(newMonth);
    }
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

            {user?.role === 'yonetici' && (
              <Link
                href="/admin/kasa/gun-sonu"
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
              >
                Gün Sonu
              </Link>
            )}

            <Link
              href="/admin/kasa/gunluk-arsiv"
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
            >
              Günlük Arşiv
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
              <div className="font-extrabold text-red-950">Kasa Özet Verisi Yüklenemedi</div>
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
                href="/admin/kasa/gunluk-arsiv"
                className="px-3.5 py-2 bg-white border border-red-300 text-red-800 hover:bg-red-50 text-xs font-bold rounded-xl transition shadow-sm"
              >
                Günlük Arşive Git →
              </Link>
            </div>
          </div>
        )}

        {isPreviousDayUnclosed && (
          <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 flex items-center justify-between flex-wrap gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <AlertTriangle size={24} className="text-amber-600 shrink-0" />
              <div>
                <div className="font-extrabold text-sm text-amber-950 uppercase tracking-wide">ÖNCEKİ KASA GÜNÜ HENÜZ KAPATILMADI ({dateStr})</div>
                <p className="text-xs text-amber-900 font-medium mt-0.5">
                  Önceki kasa gününün sayımı yapılmadan yeni gün başlatılamaz. Ekranda gördüğünüz veriler <strong>{dateStr}</strong> tarihli aktif açık güne aittir.
                </p>
              </div>
            </div>
            <Link
              href="/admin/kasa/gunluk-arsiv"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
            >
              Günlük Arşive Git →
            </Link>
          </div>
        )}

        {/* BANKAYA PARA YATIRMA UYARISI BANNER'I */}
        {excessCashToBankKurus > 0 && (
          <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 flex items-center justify-between flex-wrap gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <div className="font-extrabold text-sm text-amber-950 uppercase tracking-wide">BANKAYA PARA YATIRMA UYARISI</div>
                <p className="text-xs text-amber-900 font-medium mt-0.5">
                  Kasada <strong>{formatTL(excessCashToBankKurus)}</strong> fazla var. Bankaya yatırılmalı. (Hedef Nakit Limiti: {formatTL(reserveTargetKurus)})
                </p>
              </div>
            </div>
            {user?.role === 'yonetici' && (
              <Link
                href="/admin/kasa"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Bankaya Çıkış Yap (Yönetici)
              </Link>
            )}
          </div>
        )}

        {/* EKSİK MALİYET UYARISI BANNER'I */}
        {metrics?.missing_cost_warning && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 flex items-center gap-3 text-sm font-semibold shadow-sm">
            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            <span>Maliyet bilgisi eksik; net ürün kârı kesin hesaplanamıyor. (Satış maliyeti eksik kalemler bulunmaktadır).</span>
          </div>
        )}

        {/* ÜST ÖZET KARTLARI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
          {/* ÖNCEKİ GÜN DEVRİ KARTI */}
          <div
            onClick={() => setShowDevirModal(true)}
            className="bg-white hover:bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-blue-300 shadow-sm space-y-1 cursor-pointer transition-all group"
          >
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block flex items-center justify-between">
              <span>Önceki Gün Devri</span>
              <span className="text-[10px] text-blue-600 group-hover:underline">Detay &gt;</span>
            </span>

            {carryoverInfo?.carryover_status === 'pending_previous_close' ? (
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-1 text-amber-600 font-extrabold text-[11px] uppercase tracking-wide">
                  <AlertTriangle size={12} /> DEVİR ONAYI BEKLİYOR
                </div>
                <div className="text-lg font-black text-amber-900">
                  {formatTL(carryoverInfo.displayed_carryover_kurus)}
                </div>
                <p className="text-[11px] text-amber-700 font-medium leading-tight">
                  Kaynak: {carryoverInfo.carryover_source_date} (Kapanış bekleniyor)
                </p>
              </div>
            ) : (
              <>
                <div className="text-xl font-bold text-slate-900">
                  {formatTL(carryoverInfo?.displayed_carryover_kurus || metrics?.opening_balance_kurus || 0)}
                </div>
                <p className="text-[11px] text-slate-400">Önceki günden devreden nakit (Tıklayın)</p>
              </>
            )}
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

          {/* KASA GİDERİ KARTI (Tıklanabilir -> Gider Listesini Açar) */}
          <div
            onClick={openExpenseListModal}
            className="bg-white hover:bg-rose-50/50 p-4 rounded-2xl border border-slate-200 hover:border-rose-300 shadow-sm space-y-1 cursor-pointer transition-all group"
          >
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block flex items-center justify-between">
              <span className="flex items-center gap-1"><MinusCircle size={14} /> Kasa Gideri</span>
              <span className="text-[10px] text-rose-500 group-hover:underline">Detaylar &gt;</span>
            </span>
            <div className="text-xl font-bold text-rose-600">
              {formatTL(metrics?.expenses_total_kurus || 0)}
            </div>
            <p className="text-[11px] text-slate-400">Giderler + Maaşlar (Tıklayın)</p>
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

        {/* GÜNLÜK KASA GİDERİ ÖZET FÖYÜ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MinusCircle size={18} className="text-rose-600" /> Günlük Kasa Gideri Özet Föyü
            </h2>
            <button
              onClick={openExpenseListModal}
              className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1"
            >
              Tüm Gider Listesini Gör &gt;
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Gider Kategorisi</th>
                  <th className="p-3 text-center">İşlem Adedi</th>
                  <th className="p-3 text-right">Nakit Gider Toplamı</th>
                  <th className="p-3 text-right">İptal / Düzeltme Toplamı</th>
                  <th className="p-3 text-right">Net Gider Toplamı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseSummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
                      Bugün için kaydedilmiş gider bulunmamaktadır.
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
        </section>

        {/* AYLIK BİLANÇO BÖLÜMÜ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
                <PieChart size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {monthlyReport?.month_label || 'Aylık Bilanço'} Finansal Durumu
                </h2>
                <p className="text-xs text-slate-500">
                  Europe/Istanbul takvim ayına göre brüt satışlar, maliyetler, cari risk ve net sonuçlar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                title="Önceki Ay"
              >
                <ChevronLeft size={18} />
              </button>

              <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl">
                {monthlyReport?.month_label || selectedMonthISO}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Sonraki Ay"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {monthlyLoading ? (
            <div className="py-8 text-center text-xs font-semibold text-slate-400">
              Aylık bilanço verileri yükleniyor...
            </div>
          ) : monthlyReport ? (
            <div className="space-y-6">
              {/* MALİYET EKSİK UYARISI BANNER'I */}
              {monthlyReport.missing_cost_warning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>Maliyet bilgisi eksik satışlar bulunduğu için net kâr kesin değildir ({monthlyReport.missing_cost_sales_count} satışta maliyet eksik).</span>
                </div>
              )}

              {/* GRUP 1: GELİR VE TAHSİLATLAR */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-3">1. Gelirler & Tahsilatlar</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Toplam Ciro</span>
                    <div className="text-sm font-extrabold text-slate-900">{formatTL(monthlyReport.gross_sales_kurus)}</div>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-700">Nakit Satış</span>
                    <div className="text-sm font-extrabold text-emerald-800">{formatTL(monthlyReport.cash_sales_kurus)}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-blue-700">Kredi Kartı</span>
                    <div className="text-sm font-extrabold text-blue-800">{formatTL(monthlyReport.card_sales_kurus)}</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-purple-700">Havale / EFT</span>
                    <div className="text-sm font-extrabold text-purple-800">{formatTL(monthlyReport.bank_transfer_sales_kurus)}</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-purple-700">Teknik Servis</span>
                    <div className="text-sm font-extrabold text-purple-800">{formatTL(monthlyReport.technical_service_revenue_kurus)}</div>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-700">Tahsil Edilen Cari</span>
                    <div className="text-sm font-extrabold text-emerald-800">{formatTL(monthlyReport.credit_payments_collected_kurus)}</div>
                  </div>
                </div>
              </div>

              {/* GRUP 2: MALİYET VE GİDERLER */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-3">2. Maliyetler & Giderler</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-600">Ürün Satış Maliyeti</span>
                    <div className="text-sm font-extrabold text-slate-800">{formatTL(monthlyReport.product_sales_cost_kurus)}</div>
                  </div>
                  <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-rose-700">Teknik Servis Doğrudan Maliyeti</span>
                    <div className="text-sm font-extrabold text-rose-800">{formatTL(monthlyReport.technical_service_direct_cost_kurus)}</div>
                    <p className="text-[9px] text-rose-600 font-semibold">
                      Kasadan Ödenen: {formatTL(monthlyReport.ts_cost_paid_from_cash_kurus)} | Toplam Ödenmemiş Borç: {formatTL(monthlyReport.ts_cost_unpaid_kurus)}
                    </p>
                    {monthlyReport.unrefunded_cancelled_ts_cost_kurus > 0 && (
                      <p className="text-[9px] text-red-600 font-bold mt-0.5">
                        Geri Alınamayan İptal Maliyeti: {formatTL(monthlyReport.unrefunded_cancelled_ts_cost_kurus)}
                      </p>
                    )}
                    {monthlyReport.cancelled_unpaid_ts_cost_kurus > 0 && (
                      <p className="text-[9px] text-amber-700 font-bold mt-0.5">
                        İptal Edilmiş Servis Borcu (Zarar): {formatTL(monthlyReport.cancelled_unpaid_ts_cost_kurus)}
                      </p>
                    )}
                  </div>
                  <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-rose-700">Genel İşletme Giderleri</span>
                    <div className="text-sm font-extrabold text-rose-800">{formatTL(monthlyReport.general_operating_expenses_kurus)}</div>
                  </div>
                  {user?.role === 'yonetici' && (
                    <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 space-y-0.5">
                      <span className="text-[10px] font-bold uppercase text-rose-700">Personel Maaşları</span>
                      <div className="text-sm font-extrabold text-rose-800">{formatTL(monthlyReport.salary_expenses_kurus)}</div>
                    </div>
                  )}
                  <div className="bg-slate-900 text-white p-3 rounded-xl space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Toplam Maliyet & Gider</span>
                    <div className="text-sm font-extrabold text-white">{formatTL(monthlyReport.total_costs_and_expenses_kurus)}</div>
                  </div>
                </div>
              </div>

              {/* GRUP 3: CARİ RİSK VE KASA HAREKETLERİ */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-3">3. Cari Risk & Diğer Kasa Hareketleri</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-amber-800">Aylık Cari Satış</span>
                    <div className="text-sm font-extrabold text-amber-900">{formatTL(monthlyReport.monthly_credit_sales_kurus)}</div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-amber-800">Açık Cari Risk</span>
                    <div className="text-sm font-extrabold text-amber-950">{formatTL(monthlyReport.total_open_credit_balance_kurus)}</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-xl border border-red-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-red-700">7+ Gün Geciken Cari</span>
                    <div className="text-sm font-extrabold text-red-800">{formatTL(monthlyReport.overdue_credit_balance_kurus)}</div>
                  </div>
                  <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-indigo-700">Sermaye Girişi</span>
                    <div className="text-sm font-extrabold text-indigo-900">{formatTL(monthlyReport.capital_injected_kurus)}</div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-amber-800">Patron Çekimi</span>
                    <div className="text-sm font-extrabold text-amber-900">{formatTL(monthlyReport.owner_withdrawn_kurus)}</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-600">Bankaya Yatırılan</span>
                    <div className="text-sm font-extrabold text-slate-800">{formatTL(monthlyReport.bank_deposits_kurus)}</div>
                  </div>
                </div>
              </div>

              {/* GRUP 4: NET SONUÇ */}
              <div className={`p-4 text-white rounded-2xl flex items-center justify-between flex-wrap gap-4 shadow-md ${
                monthlyReport.missing_cost_warning ? 'bg-amber-950 border border-amber-500/40' : 'bg-slate-900'
              }`}>
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {monthlyReport.missing_cost_warning ? 'Brüt Satış Cirosu' : 'Brüt Kâr'}
                    </span>
                    <div className="text-lg font-bold text-slate-200">
                      {formatTL(monthlyReport.missing_cost_warning ? monthlyReport.gross_sales_kurus : monthlyReport.gross_profit_kurus)}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {monthlyReport.missing_cost_warning ? 'Tahmini Ara Sonuç (Maliyet Eksik)' : 'Net Kâr / Zarar'}
                    </span>
                    <div className={`text-2xl font-black ${
                      monthlyReport.missing_cost_warning ? 'text-amber-300' : monthlyReport.net_profit_kurus >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {formatTL(monthlyReport.net_profit_kurus)}
                    </div>
                    {monthlyReport.missing_cost_warning && (
                      <div className="text-[11px] text-amber-300/90 font-semibold mt-0.5">
                        {monthlyReport.missing_cost_sales_count} satışın maliyet bilgisi eksik; kesin net kâr hesaplanamaz.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {monthlyReport.missing_cost_warning ? (
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-xs font-bold uppercase tracking-wide">
                      Maliyet Eksik — Net Kâr Kesin Değil
                    </span>
                  ) : monthlyReport.net_profit_kurus >= 0 ? (
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-bold uppercase tracking-wide">
                      AYLIK KÂR
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-xs font-bold uppercase tracking-wide">
                      AYLIK ZARAR
                    </span>
                  )}

                  {user?.role === 'yonetici' && (
                    <Link
                      href="/admin/kasa/raporlar"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
                    >
                      Detaylı Dönem Raporu
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs font-semibold text-slate-400">
              Bu aya ait finansal kayıt bulunamadı.
            </div>
          )}
        </section>
      </main>

      {/* GİDER EKLEME MODALI */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Günlük Gider Ekle</h3>

            {expenseError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleExpenseSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Gider Kategorisi *</label>
                <select
                  required
                  value={expenseCatId}
                  onChange={(e) => setExpenseCatId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  {expenseCategories
                    .filter((c) => user?.role === 'yonetici' || (!c.is_salary_category && c.name !== 'Personel Maaşı'))
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Gider Tutarı (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={expenseAmountTL}
                  onChange={(e) => setExpenseAmountTL(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-rose-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Gider Açıklaması *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Örn: Yemek / Ofis temizlik malzemeleri"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Ödeme Yapılan Kişi / Firma (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Kişi veya marka adı"
                  value={expenseRecipient}
                  onChange={(e) => setExpenseRecipient(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={expenseSubmitting}
                  className="w-1/2 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  {expenseSubmitting ? 'Kaydediliyor...' : 'Gideri Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GÜNLÜK GİDER LİSTESİ MODALI */}
      {showExpenseListModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <MinusCircle className="text-rose-600" size={22} /> Günlük Gider Listesi
              </h3>
              <button
                onClick={() => setShowExpenseListModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3">Tarih / Saat</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-3">Açıklama</th>
                    <th className="py-3 px-3">Alıcı / Firma</th>
                    <th className="py-3 px-3 text-right">Tutar</th>
                    <th className="py-3 px-3 text-center">Ekleyen</th>
                    <th className="py-3 px-3 text-center">Durum</th>
                    <th className="py-3 px-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {dailyExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-semibold">
                        Bugün henüz genel kasa gideri kaydedilmedi.
                      </td>
                    </tr>
                  ) : (
                    dailyExpenses.map((exp) => {
                      const isManager = user?.role === 'yonetici';
                      const isOwnExpense = exp.created_by_user_id === user?.id;
                      const isSalary = exp.category_name === 'Personel Maaşı';

                      const canEdit =
                        exp.status !== 'cancelled' &&
                        dayStatus === 'open' &&
                        (isManager || (isOwnExpense && !isSalary));
                      const canCancel = exp.status !== 'cancelled' && dayStatus === 'open' && isManager;

                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3 text-slate-500">
                            {new Date(exp.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">{exp.category_name}</td>
                          <td className="py-3 px-3 text-slate-900">{exp.description}</td>
                          <td className="py-3 px-3 text-slate-600">{exp.recipient_name || '-'}</td>
                          <td className="py-3 px-3 text-right font-extrabold text-rose-600">
                            {formatTL(exp.amount_kurus)}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600">{exp.created_by_name}</td>
                          <td className="py-3 px-3 text-center">
                            {exp.status === 'cancelled' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                İptal Edildi
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Aktif
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => openEditExpenseModal(exp)}
                                  className="px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Edit3 size={12} /> Düzelt
                                </button>
                              )}
                              {canCancel && (
                                <button
                                  onClick={() => setCancellingExpense(exp)}
                                  className="px-2 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                >
                                  İptal Et
                                </button>
                              )}
                              {!canEdit && !canCancel && <span className="text-slate-400 text-[11px]">-</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExpenseListModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GİDER DÜZELTME MODALI */}
      {editingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Edit3 className="text-blue-600" size={20} /> Gider Kaydını Düzelt
              </h3>
              <button onClick={() => setEditingExpense(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">
                ✕
              </button>
            </div>

            {editExpError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {editExpError}
              </div>
            )}

            <form onSubmit={handleEditExpenseSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Gider Kategorisi *</label>
                <select
                  required
                  value={editExpCatId}
                  onChange={(e) => setEditExpCatId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  {expenseCategories
                    .filter((c) => user?.role === 'yonetici' || (!c.is_salary_category && c.name !== 'Personel Maaşı'))
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Gider Tutarı (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editExpAmountTL}
                  onChange={(e) => setEditExpAmountTL(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-rose-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Gider Açıklaması *</label>
                <textarea
                  required
                  rows={2}
                  value={editExpDescription}
                  onChange={(e) => setEditExpDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Ödeme Yapılan Kişi / Firma</label>
                <input
                  type="text"
                  value={editExpRecipient}
                  onChange={(e) => setEditExpRecipient(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-blue-900 uppercase tracking-wider mb-1">
                  Düzeltme Gerekçesi (Zorunlu) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Gider tutarında veya kategorisinde yapılan değişikliğin sebebini açıklayın..."
                  value={editExpJustification}
                  onChange={(e) => setEditExpJustification(e.target.value)}
                  className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={editExpSubmitting}
                  className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md text-xs disabled:opacity-50"
                >
                  {editExpSubmitting ? 'Düzeltiliyor...' : 'Düzeltmeyi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GİDER İPTAL MODALI */}
      {cancellingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Gider İptali Onayı (Yönetici)</h3>
            <p className="text-xs text-slate-600">
              <span className="font-bold">{cancellingExpense.category_name}</span> kategorisindeki{' '}
              <span className="font-bold">{formatTL(cancellingExpense.amount_kurus)}</span> tutarındaki gider kaydı iptal edilecektir.
            </p>

            {cancelExpError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {cancelExpError}
              </div>
            )}

            <form onSubmit={handleCancelExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  İptal Gerekçesi (Zorunlu) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Gider kaydının iptal sebebini açıklayın..."
                  value={cancelExpJustification}
                  onChange={(e) => setCancelExpJustification(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingExpense(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelExpSubmitting}
                  className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-red-600/20"
                >
                  {cancelExpSubmitting ? 'İptal Ediliyor...' : 'Gideri İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEVİR DETAYI VE ONARIM MODALI */}
      {showDevirModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" /> Önceki Gün Devir Detayı
            </h3>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
              <span className="text-xs font-bold uppercase text-blue-700">Mevcut Gün Açılış Devri</span>
              <div className="text-2xl font-black text-blue-900">{formatTL(metrics?.opening_balance_kurus || 0)}</div>
              <p className="text-xs text-blue-800">
                Bu tutar önceki kapatılan kasa gününün sayılan kapanış bakiyesinden otomatik olarak devredilmiştir.
              </p>
            </div>

            {user?.role === 'yonetici' && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Güvenli Devir Onarımı (Yönetici)</h4>
                <p className="text-xs text-slate-500">
                  Devir bakiyesi veritabanındaki en yakın kapatılmış önceki günden otomatik olarak hesaplanır. Yönetici serbest tutar giremez.
                </p>

                {repairError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                    {repairError}
                  </div>
                )}

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!targetDayId || !repairJustification.trim()) {
                      return setRepairError('Lütfen onarım gerekçesi girin.');
                    }
                    try {
                      setRepairSubmitting(true);
                      setRepairError(null);

                      // Önceki kapatılmış kasa gününü getir
                      const daysRes = await fetch('/api/admin/kasa/reports?type=daily_archive');
                      let sourceDayId = null;
                      if (daysRes.ok) {
                        const daysData = await daysRes.json();
                        const closedPrevDay = (daysData.days || []).find(
                          (d: any) => d.status === 'closed' && d.id !== targetDayId
                        );
                        if (closedPrevDay) sourceDayId = closedPrevDay.id;
                      }

                      if (!sourceDayId) {
                        throw new Error('Onaylı kapatılmış önceki kasa günü bulunamadı. Lütfen önce önceki kasa gününü kapatın.');
                      }

                      const res = await fetch('/api/admin/kasa/repair-carryover', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          target_day_id: targetDayId,
                          source_day_id: sourceDayId,
                          justification: repairJustification.trim(),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Devir onarılamadı.');
                      setShowDevirModal(false);
                      setRepairJustification('');
                      await loadData();
                    } catch (err: any) {
                      setRepairError(err.message || 'Hata oluştu.');
                    } finally {
                      setRepairSubmitting(false);
                    }
                  }}
                  className="space-y-3 text-xs font-semibold"
                >
                  <div>
                    <label className="block text-slate-700 mb-1">Onarım Gerekçesi *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Örn: Önceki kapatılmış günün bakiyesi otomatik devir olarak doğrulandı."
                      value={repairJustification}
                      onChange={(e) => setRepairJustification(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={repairSubmitting}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {repairSubmitting ? 'Hesaplanan Devir Onaylanıyor...' : 'Hesaplanan Devri Onayla'}
                  </button>
                </form>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDevirModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BEKLENEN FİZİKSEL KASA HESAP DÖKÜMÜ MODALI */}
      {showPhysicalCashModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Coins size={20} className="text-emerald-600" />
                  Fiziksel Kasa Hesap Dökümü
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {carryoverInfo?.carryover_status === 'pending_previous_close'
                    ? 'Devir onayı bekleyen tahmini bakiye detayları'
                    : 'Onaylanmış açılış ve bugünkü nakit hareketleri'}
                </p>
              </div>
              <button
                onClick={() => setShowPhysicalCashModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-semibold">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Onaylı Açılış Bakiyesi</span>
                <span className="font-bold text-slate-900">{formatTL(carryoverInfo?.opening_balance_kurus || 0)}</span>
              </div>

              {carryoverInfo?.carryover_status === 'pending_previous_close' && (
                <div className="flex justify-between items-center py-1.5 border-b border-amber-100 bg-amber-50/60 px-2 rounded-lg">
                  <span className="text-amber-900 font-bold">Onay Bekleyen Devir ({carryoverInfo.carryover_source_date || 'Önceki Gün'})</span>
                  <span className="font-black text-amber-900">{formatTL(carryoverInfo.displayed_carryover_kurus)}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-emerald-700 font-medium">+ Bugünkü Nakit Satışlar</span>
                <span className="font-extrabold text-emerald-800">+{formatTL(carryoverInfo?.today_cash_sales_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-emerald-700 font-medium">+ Bugünkü Nakit Cari Tahsilatı</span>
                <span className="font-extrabold text-emerald-800">+{formatTL(carryoverInfo?.today_cash_credit_collections_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-emerald-700 font-medium">+ Bugünkü Sermaye Girişi</span>
                <span className="font-extrabold text-emerald-800">+{formatTL(carryoverInfo?.today_capital_injected_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-rose-700 font-medium">- Bugünkü Aktif Genel Giderler</span>
                <span className="font-extrabold text-rose-800">-{formatTL(carryoverInfo?.today_active_expenses_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-rose-700 font-medium">- Kasadan Ödenen Teknik Servis Maliyeti</span>
                <span className="font-extrabold text-rose-800">-{formatTL(carryoverInfo?.today_ts_cash_costs_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-rose-700 font-medium">- Bugünkü Bankaya Yatırılan</span>
                <span className="font-extrabold text-rose-800">-{formatTL(carryoverInfo?.today_bank_deposits_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-amber-800 font-medium">- Bugünkü Patron Çekimi</span>
                <span className="font-extrabold text-amber-900">-{formatTL(carryoverInfo?.today_owner_withdrawn_kurus || 0)}</span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t-2 border-slate-900 text-sm">
                <span className="font-extrabold text-slate-900">
                  {carryoverInfo?.carryover_status === 'pending_previous_close'
                    ? 'Tahmini Beklenen Fiziki Kasa'
                    : 'Onaylı Fiziki Kasa'}
                </span>
                <span className="font-black text-emerald-600 text-base">
                  {formatTL(carryoverInfo?.displayed_expected_cash_kurus || metrics?.expected_cash_kurus || 0)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPhysicalCashModal(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
