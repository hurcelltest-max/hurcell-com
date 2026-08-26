'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Download,
  Printer,
  CheckCircle,
  Lock,
  Eye,
  Edit3,
  XCircle,
  AlertCircle,
  ShieldAlert,
  FileSpreadsheet,
} from 'lucide-react';
import { KasaDay, KasaUnifiedMovement } from '@/lib/kasa/types';

function formatTL(kurus: number | null | undefined): string {
  const val = typeof kurus === 'number' && !isNaN(kurus) ? kurus : 0;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(val / 100);
}

export default function AdminGunlukArsivPage() {
  const [days, setDays] = useState<KasaDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<KasaDay | null>(null);

  // Gün Detay Verileri (Satışlar, Giderler, Defter)
  const [dayDetail, setDayDetail] = useState<{
    day: any;
    sales: any[];
    expenses: any[];
    ledger: any[];
    counts?: { sales: number; expenses: number; movements: number };
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Aktif Sekme (Düzenlenebilir Kayıtlar vs Defter)
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales');

  // Kapanış Modalı
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedCashTL, setCountedCashTL] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [closingSubmitting, setClosingSubmitting] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Kategoriler
  const [salesCategories, setSalesCategories] = useState<{ id: string; name: string }[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string; is_salary_category: boolean }[]>([]);

  // Satış Düzelt Modalı State'leri
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [editSaleCatId, setEditSaleCatId] = useState('');
  const [editSaleProductName, setEditSaleProductName] = useState('');
  const [editSaleQuantity, setEditSaleQuantity] = useState('1');
  const [editSaleUnitPriceTL, setEditSaleUnitPriceTL] = useState('');
  const [editSaleCashPaidTL, setEditSaleCashPaidTL] = useState('');
  const [editSaleCardPaidTL, setEditSaleCardPaidTL] = useState('');
  const [editSaleBankPaidTL, setEditSaleBankPaidTL] = useState('');
  const [editSaleCostPriceTL, setEditSaleCostPriceTL] = useState('');
  const [editSaleJustification, setEditSaleJustification] = useState('');
  const [editSaleSubmitting, setEditSaleSubmitting] = useState(false);
  const [editSaleError, setEditSaleError] = useState<string | null>(null);

  // Satış İptal Modalı State'leri
  const [cancellingSale, setCancellingSale] = useState<any | null>(null);
  const [cancelSaleJustification, setCancelSaleJustification] = useState('');
  const [cancelSaleCostRefunded, setCancelSaleCostRefunded] = useState(false);
  const [cancelSaleSubmitting, setCancelSaleSubmitting] = useState(false);
  const [cancelSaleError, setCancelSaleError] = useState<string | null>(null);

  // Gider Düzelt Modalı State'leri
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editExpCatId, setEditExpCatId] = useState('');
  const [editExpAmountTL, setEditExpAmountTL] = useState('');
  const [editExpDescription, setEditExpDescription] = useState('');
  const [editExpRecipient, setEditExpRecipient] = useState('');
  const [editExpJustification, setEditExpJustification] = useState('');
  const [editExpSubmitting, setEditExpSubmitting] = useState(false);
  const [editExpError, setEditExpError] = useState<string | null>(null);

  // Gider İptal Modalı State'leri
  const [cancellingExpense, setCancellingExpense] = useState<any | null>(null);
  const [cancelExpJustification, setCancelExpJustification] = useState('');
  const [cancelExpSubmitting, setCancelExpSubmitting] = useState(false);
  const [cancelExpError, setCancelExpError] = useState<string | null>(null);

  const loadDays = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/kasa/days');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Günlük arşiv verileri yüklenemedi.');
      }
      const fetchedDays = data.items || [];
      setDays(fetchedDays);
      if (fetchedDays.length > 0 && !selectedDay) {
        setSelectedDay(fetchedDays[0]);
        handleSelectDay(fetchedDays[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDays();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const [sRes, eRes] = await Promise.all([
        fetch('/api/kasa/categories'),
        fetch('/api/kasa/expense-categories'),
      ]);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSalesCategories(sData.categories || []);
      }
      if (eRes.ok) {
        const eData = await eRes.json();
        setExpenseCategories(eData.categories || []);
      }
    } catch (err) {
      console.error('Kategoriler yüklenemedi:', err);
    }
  };

  const [detailError, setDetailError] = useState<string | null>(null);

  const handleSelectDay = async (day: KasaDay) => {
    setSelectedDay(day);
    setDayDetail(null);
    setDetailError(null);
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/admin/kasa/day-detail?day_id=${day.id}`);
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data.error || 'Gün detayları alınamadı.');
        return;
      }
      const ledgerMovements = data.movements || data.ledger || [];
      setDayDetail({
        ...data,
        ledger: ledgerMovements,
      });
    } catch (err: any) {
      setDetailError(err.message || 'Gün detayları yüklenirken hata oluştu.');
    } finally {
      setDetailLoading(false);
    }
  };

  // --- SATIŞ DÜZELTME & İPTAL HANDLERS ---
  const openEditSaleModal = (sale: any) => {
    setEditingSale(sale);
    setEditSaleCatId(sale.category_id || '');
    setEditSaleProductName(sale.product_name || '');
    setEditSaleQuantity(String(sale.quantity || 1));
    setEditSaleUnitPriceTL((sale.unit_price_kurus / 100).toFixed(2));
    setEditSaleCashPaidTL((sale.cash_paid_kurus / 100).toFixed(2));
    setEditSaleCardPaidTL((sale.card_paid_kurus / 100).toFixed(2));
    setEditSaleBankPaidTL((sale.bank_transfer_paid_kurus / 100).toFixed(2));
    setEditSaleCostPriceTL(sale.cost_price_kurus ? (sale.cost_price_kurus / 100).toFixed(2) : '');
    setEditSaleJustification('');
    setEditSaleError(null);
  };

  const handleSaleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale || !editSaleJustification.trim()) {
      setEditSaleError('Lütfen düzeltme gerekçesini belirtin.');
      return;
    }
    try {
      setEditSaleSubmitting(true);
      setEditSaleError(null);
      const res = await fetch(`/api/kasa/sales/${editingSale.entity_id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: editSaleCatId,
          product_name: editSaleProductName.trim(),
          quantity: Number(editSaleQuantity),
          unit_price_tl: Number(editSaleUnitPriceTL),
          cash_paid_tl: Number(editSaleCashPaidTL),
          card_paid_tl: Number(editSaleCardPaidTL),
          bank_transfer_paid_tl: Number(editSaleBankPaidTL),
          cost_price_tl: editSaleCostPriceTL ? Number(editSaleCostPriceTL) : undefined,
          justification: editSaleJustification.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış düzeltilemedi.');

      setEditingSale(null);
      await loadDays();
      if (selectedDay) await handleSelectDay(selectedDay);
    } catch (err: any) {
      setEditSaleError(err.message || 'Satış düzeltilirken hata oluştu.');
    } finally {
      setEditSaleSubmitting(false);
    }
  };

  const openCancelSaleModal = (sale: any) => {
    setCancellingSale(sale);
    setCancelSaleJustification('');
    setCancelSaleCostRefunded(false);
    setCancelSaleError(null);
  };

  const handleSaleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSale || !cancelSaleJustification.trim()) {
      setCancelSaleError('Lütfen iptal gerekçesini belirtin.');
      return;
    }
    try {
      setCancelSaleSubmitting(true);
      setCancelSaleError(null);
      const res = await fetch(`/api/kasa/sales/${cancellingSale.entity_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification: cancelSaleJustification.trim(),
          cost_refunded: cancelSaleCostRefunded,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış iptal edilemedi.');

      setCancellingSale(null);
      await loadDays();
      if (selectedDay) await handleSelectDay(selectedDay);
    } catch (err: any) {
      setCancelSaleError(err.message || 'Satış iptal edilirken hata oluştu.');
    } finally {
      setCancelSaleSubmitting(false);
    }
  };

  // --- GİDER DÜZELTME & İPTAL HANDLERS ---
  const openEditExpenseModal = (exp: any) => {
    setEditingExpense(exp);
    setEditExpCatId(exp.expense_category_id || '');
    setEditExpAmountTL((exp.amount_kurus / 100).toFixed(2));
    setEditExpDescription(exp.description || '');
    setEditExpRecipient(exp.recipient_name || '');
    setEditExpJustification('');
    setEditExpError(null);
  };

  const handleExpenseUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !editExpJustification.trim()) {
      setEditExpError('Lütfen düzeltme gerekçesini belirtin.');
      return;
    }
    try {
      setEditExpSubmitting(true);
      setEditExpError(null);
      const res = await fetch(`/api/kasa/expenses/${editingExpense.entity_id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_category_id: editExpCatId,
          amount_tl: Number(editExpAmountTL),
          description: editExpDescription.trim(),
          recipient_name: editExpRecipient.trim(),
          justification: editExpJustification.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider düzeltilemedi.');

      setEditingExpense(null);
      await loadDays();
      if (selectedDay) await handleSelectDay(selectedDay);
    } catch (err: any) {
      setEditExpError(err.message || 'Gider düzeltilirken hata oluştu.');
    } finally {
      setEditExpSubmitting(false);
    }
  };

  const openCancelExpenseModal = (exp: any) => {
    setCancellingExpense(exp);
    setCancelExpJustification('');
    setCancelExpError(null);
  };

  const handleExpenseCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingExpense || !cancelExpJustification.trim()) {
      setCancelExpError('Lütfen iptal gerekçesini belirtin.');
      return;
    }
    try {
      setCancelExpSubmitting(true);
      setCancelExpError(null);
      const res = await fetch(`/api/kasa/expenses/${cancellingExpense.entity_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification: cancelExpJustification.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gider iptal edilemedi.');

      setCancellingExpense(null);
      await loadDays();
      if (selectedDay) await handleSelectDay(selectedDay);
    } catch (err: any) {
      setCancelExpError(err.message || 'Gider iptal edilirken hata oluştu.');
    } finally {
      setCancelExpSubmitting(false);
    }
  };

  // --- KAPANIS HANDLER ---
  const handleCloseDaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay || countedCashTL === '' || Number(countedCashTL) < 0) {
      return setClosingError('Lütfen geçerli bir sayılan nakit tutarı girin.');
    }
    try {
      setClosingSubmitting(true);
      setClosingError(null);
      const res = await fetch('/api/kasa/closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kasa_day_id: selectedDay.id,
          counted_cash_tl: Number(countedCashTL),
          closing_note: closingNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gün kapatılamadı.');
      setShowCloseModal(false);
      setCountedCashTL('');
      setClosingNote('');
      await loadDays();
      if (data.day) {
        await handleSelectDay(data.day);
      }
    } catch (err: any) {
      setClosingError(err.message || 'Gün kapatılırken hata oluştu.');
    } finally {
      setClosingSubmitting(false);
    }
  };

  const exportCSV = (day: KasaDay, movements: any[]) => {
    const sanitize = (val: string) => {
      if (!val) return '';
      const str = String(val).trim().replace(/[\r\n\t]/g, ' ');
      return /^[=\+\-@\t\r]/.test(str) ? `'${str}` : str;
    };

    let csv = '\uFEFF';
    csv += `Tarih;${sanitize(day.date_val)}\n`;
    csv += `Durum;${day.status === 'closed' ? 'Kapalı' : 'Açık'}\n`;
    csv += `Açılış Devri (TL);${(day.opening_balance_kurus / 100).toFixed(2)}\n`;
    csv += `Beklenen Nakit (TL);${((day.expected_cash_kurus || 0) / 100).toFixed(2)}\n`;
    csv += `Sayılan Nakit (TL);${((day.counted_cash_kurus || 0) / 100).toFixed(2)}\n\n`;

    csv += 'Tarih & Saat;İşlem Türü;Açıklama;Nakit Giriş (TL);Nakit Çıkış (TL);Kredi Kartı (TL);Kullanıcı\n';

    (movements || []).forEach((m) => {
      const timeStr = new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      csv += `${sanitize(timeStr)};${sanitize(m.movement_label)};${sanitize(m.description)};${(m.cash_in_kurus / 100).toFixed(2)};${(m.cash_out_kurus / 100).toFixed(2)};${(m.card_portion_kurus / 100).toFixed(2)};${sanitize(m.created_by_name)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kasa_foyu_${day.date_val}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Link href="/admin/kasa" className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-600">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Günlük Kasa Arşivi</h1>
              <p className="text-xs text-slate-500">Tarih sırasıyla tüm kasa günleri, kapanış sonuçları, açık gün düzeltmeleri ve muhasebe defteri</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* SOL KOLON: GÜN LİSTESİ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calendar size={16} className="text-blue-600" /> Kasa Günleri Listesi
            </h2>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">Yükleniyor...</div>
            ) : days.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">Henüz kayıtlı kasa günü yok.</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSelectDay(d)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                      selectedDay?.id === d.id
                        ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900">{d.date_val}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Devir: {formatTL(d.opening_balance_kurus)}
                      </div>
                    </div>
                    <div className="text-right">
                      {d.status === 'closed' ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Lock size={10} /> KAPALI
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle size={10} /> AÇIK
                        </span>
                      )}
                      <div className="text-xs font-bold text-slate-700 mt-1">
                        {formatTL(d.counted_cash_kurus ?? d.calculated_physical_cash_kurus ?? d.expected_cash_kurus ?? 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SAĞ KOLON: GÜN DETAYLARI & DÜZELTME ALANI & DEFTER */}
          <div className="lg:col-span-2 space-y-6">
            {selectedDay ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 print:shadow-none print:border-none">
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{selectedDay.date_val} Kasa Günlük Özet Föyü</h2>
                    <p className="text-xs text-slate-500">Durum: {selectedDay.status === 'closed' ? 'Gün Sonu Kapalı (Kilitli)' : 'Açık Kasa'}</p>
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    {selectedDay.status === 'open' && (
                      selectedDay.can_close !== false ? (
                        <button
                          onClick={() => {
                            setCountedCashTL(((selectedDay.expected_cash_kurus || (selectedDay as any).calculated_physical_cash_kurus || 0) / 100).toFixed(2));
                            setShowCloseModal(true);
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
                        >
                          <Lock size={14} /> Bu Günü Kapat (Gün Sonu)
                        </button>
                      ) : (
                        <button
                          disabled
                          title={(selectedDay as any).close_block_reason || 'Önceki gün kapatılmadan bu gün kapatılamaz.'}
                          className="px-3 py-1.5 bg-slate-200 text-slate-400 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-not-allowed opacity-80"
                        >
                          <Lock size={14} /> Kapanış Kilitli
                        </button>
                      )
                    )}
                    <button
                      onClick={() => exportCSV(selectedDay, dayDetail?.ledger || [])}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                    >
                      <Download size={14} /> CSV İndir
                    </button>
                    <button
                      onClick={handlePrint}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                    >
                      <Printer size={14} /> Yazdır / PDF
                    </button>
                  </div>
                </div>

                {detailError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle size={18} className="shrink-0 text-red-600" />
                    <div>
                      <div className="font-bold text-sm">Gün Detay Verileri Yüklenemedi</div>
                      <p className="mt-0.5">{detailError}</p>
                    </div>
                  </div>
                )}

                {/* Özet Kartları (NaN Önleyici Temiz Hesaplama) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Önceki Gün Devri</span>
                    <div className="text-sm font-extrabold text-slate-900">{formatTL(selectedDay.opening_balance_kurus)}</div>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Sermaye Girişi</span>
                    <div className="text-sm font-extrabold text-emerald-800">{formatTL(dayDetail?.day?.capital_injected_kurus ?? selectedDay.capital_injected_kurus ?? 0)}</div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Patron Çekimi</span>
                    <div className="text-sm font-extrabold text-amber-900">{formatTL(dayDetail?.day?.owner_withdrawn_kurus ?? selectedDay.owner_withdrawn_kurus ?? 0)}</div>
                  </div>
                  {selectedDay.status === 'open' && (dayDetail?.day?.counted_cash_kurus == null && selectedDay.counted_cash_kurus == null) ? (
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">HESAPLANAN FİZİKİ KASA</span>
                      <div className="text-sm font-extrabold text-blue-900">
                        {formatTL(dayDetail?.day?.calculated_physical_cash_kurus ?? selectedDay.calculated_physical_cash_kurus ?? selectedDay.expected_cash_kurus ?? 0)}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">KAPANIŞTA SAYILAN</span>
                      <div className="text-sm font-extrabold text-indigo-900">
                        {formatTL(dayDetail?.day?.counted_cash_kurus ?? selectedDay.counted_cash_kurus ?? 0)}
                      </div>
                    </div>
                  )}
                </div>

                {/* --- BÖLÜM 1: DÜZENLENEBİLİR KAYITLAR --- */}
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 flex items-start gap-2.5">
                    <ShieldAlert size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold text-indigo-950 uppercase tracking-wide">AÇIK GÜNE AİT DÜZENLENEBİLİR MALİ KAYITLAR</div>
                      <p className="mt-0.5 text-indigo-800 font-medium">
                        Üst bölümde açık güne ait satış ve giderleri düzeltebilir veya iptal edebilirsiniz. Yapılan değişiklikler çift taraflı ters kayıt ve muhasebe audit logu ile işlenir. Kapanmış günlerde kayıtlar değiştirilemez.
                      </p>
                    </div>
                  </div>

                  {/* Sekme Butonları */}
                  <div className="flex border-b border-slate-200">
                    <button
                      onClick={() => setActiveTab('sales')}
                      className={`py-2 px-4 text-xs font-bold transition border-b-2 ${
                        activeTab === 'sales'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Günlük Satışlar ({dayDetail?.counts?.sales ?? dayDetail?.sales?.length ?? 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('expenses')}
                      className={`py-2 px-4 text-xs font-bold transition border-b-2 ${
                        activeTab === 'expenses'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Kasa Giderleri ({dayDetail?.counts?.expenses ?? dayDetail?.expenses?.length ?? 0})
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="py-6 text-center text-xs text-slate-400">Detaylar yükleniyor...</div>
                  ) : activeTab === 'sales' ? (
                    // SATIŞLAR TABLOSU
                    <div className="space-y-2">
                      {!dayDetail?.sales || dayDetail.sales.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Bu güne ait satış kaydı bulunamadı.</div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Fiş No</th>
                                <th className="p-2.5">Saat</th>
                                <th className="p-2.5">Kategori</th>
                                <th className="p-2.5">Ürün / Hizmet</th>
                                <th className="p-2.5 text-center">Adet</th>
                                <th className="p-2.5 text-right">Tutar</th>
                                <th className="p-2.5">Durum</th>
                                <th className="p-2.5 text-right print:hidden">Yönetici Aksiyonları</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dayDetail.sales.map((s) => (
                                <tr key={s.entity_id} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">{s.receipt_no}</td>
                                  <td className="p-2.5 text-slate-500 whitespace-nowrap">
                                    {new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="p-2.5 font-medium text-slate-700 whitespace-nowrap">{s.category_name}</td>
                                  <td className="p-2.5 font-bold text-slate-900 max-w-xs truncate">{s.product_name}</td>
                                  <td className="p-2.5 text-center font-semibold text-slate-700">{s.quantity}</td>
                                  <td className="p-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                                    {formatTL(s.total_price_kurus)}
                                  </td>
                                  <td className="p-2.5 whitespace-nowrap">
                                    {s.status === 'completed' ? (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">Tamamlandı</span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-md">İptal/İade</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right whitespace-nowrap print:hidden">
                                    {s.can_update ? (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => openEditSaleModal(s)}
                                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                                        >
                                          <Edit3 size={12} /> Düzelt
                                        </button>
                                        <button
                                          onClick={() => openCancelSaleModal(s)}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                                        >
                                          <XCircle size={12} /> İptal Et
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic" title={s.action_block_reason || 'Değiştirilemez'}>
                                        {selectedDay.status === 'closed' ? 'Kilitli (Kapanmış Gün)' : 'İptal Edilmiş'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    // GİDERLER TABLOSU
                    <div className="space-y-2">
                      {!dayDetail?.expenses || dayDetail.expenses.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Bu güne ait gider kaydı bulunamadı.</div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Saat</th>
                                <th className="p-2.5">Gider Kategorisi</th>
                                <th className="p-2.5">Açıklama</th>
                                <th className="p-2.5">Ödeme Yapılan</th>
                                <th className="p-2.5 text-right">Tutar</th>
                                <th className="p-2.5">Durum</th>
                                <th className="p-2.5 text-right print:hidden">Yönetici Aksiyonları</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dayDetail.expenses.map((e) => (
                                <tr key={e.entity_id} className="hover:bg-slate-50">
                                  <td className="p-2.5 text-slate-500 whitespace-nowrap">
                                    {new Date(e.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">{e.category_name}</td>
                                  <td className="p-2.5 text-slate-700 max-w-xs truncate">{e.description}</td>
                                  <td className="p-2.5 text-slate-600 whitespace-nowrap">{e.recipient_name || '-'}</td>
                                  <td className="p-2.5 text-right font-bold text-rose-700 whitespace-nowrap">
                                    {formatTL(e.amount_kurus)}
                                  </td>
                                  <td className="p-2.5 whitespace-nowrap">
                                    {e.status === 'cancelled' ? (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-md">İptal Edildi</span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">Aktif Gider</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right whitespace-nowrap print:hidden">
                                    {e.can_update ? (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => openEditExpenseModal(e)}
                                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                                        >
                                          <Edit3 size={12} /> Düzelt
                                        </button>
                                        <button
                                          onClick={() => openCancelExpenseModal(e)}
                                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                                        >
                                          <XCircle size={12} /> İptal Et
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic" title={e.action_block_reason || 'Değiştirilemez'}>
                                        {selectedDay.status === 'closed' ? 'Kilitli (Kapanmış Gün)' : 'İptal Edilmiş'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* --- BÖLÜM 2: DEĞİŞTİRİLEMEZ HAREKET DEFTERİ --- */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileSpreadsheet size={16} className="text-slate-500" /> DEĞİŞTİRİLEMEZ HAREKET DEFTERİ ({dayDetail?.ledger?.length || 0} İŞLEM)
                    </h3>
                  </div>

                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-[11px] text-slate-600 font-medium">
                    Alt bölüm değiştirilemez muhasebe hareket defteridir. Bu satırlar üzerinde doğrudan düzenleme/silme yapılmaz; yapılan tüm düzeltmeler yeni muhasebe hareketleri olarak buraya eklenir.
                  </div>

                  {!dayDetail?.ledger || dayDetail.ledger.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">Bu güne ait hareket kaydı bulunamadı.</div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">Saat</th>
                            <th className="p-2.5">İşlem Türü</th>
                            <th className="p-2.5">Açıklama</th>
                            <th className="p-2.5 text-right">Nakit Giriş</th>
                            <th className="p-2.5 text-right">Nakit Çıkış</th>
                            <th className="p-2.5 text-right">Kart</th>
                            <th className="p-2.5">İşlemi Yapan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dayDetail.ledger.map((m) => (
                            <tr key={m.entity_id} className="hover:bg-slate-50">
                              <td className="p-2.5 text-slate-500 whitespace-nowrap">
                                {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">{m.movement_label}</td>
                              <td className="p-2.5 text-slate-600 max-w-xs truncate">{m.description}</td>
                              <td className="p-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                                {m.cash_in_kurus > 0 ? formatTL(m.cash_in_kurus) : '-'}
                              </td>
                              <td className="p-2.5 text-right font-semibold text-rose-600 whitespace-nowrap">
                                {m.cash_out_kurus > 0 ? formatTL(m.cash_out_kurus) : '-'}
                              </td>
                              <td className="p-2.5 text-right text-blue-700 whitespace-nowrap">
                                {m.card_portion_kurus > 0 ? formatTL(m.card_portion_kurus) : '-'}
                              </td>
                              <td className="p-2.5 text-slate-500 whitespace-nowrap">{m.created_by_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 space-y-2">
                <Eye size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-medium">Detayını incelemek için soldaki listeden bir kasa günü seçin.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODAL 1: SATIŞ DÜZELTME MODALI --- */}
      {editingSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Edit3 size={18} className="text-amber-600" /> Satış Düzeltme (Fiş: {editingSale.receipt_no})
            </h3>

            {editSaleError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {editSaleError}
              </div>
            )}

            <form onSubmit={handleSaleUpdateSubmit} className="space-y-3 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={editSaleCatId}
                    onChange={(e) => setEditSaleCatId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {salesCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Ürün / Hizmet Adı *</label>
                  <input
                    type="text"
                    required
                    value={editSaleProductName}
                    onChange={(e) => setEditSaleProductName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Adet *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editSaleQuantity}
                    onChange={(e) => setEditSaleQuantity(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Birim Fiyat (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editSaleUnitPriceTL}
                    onChange={(e) => setEditSaleUnitPriceTL(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="block text-slate-700 mb-1 font-bold">Ödeme Dağılımı (TL)</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500">Nakit</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaleCashPaidTL}
                      onChange={(e) => setEditSaleCashPaidTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Kredi Kartı</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaleCardPaidTL}
                      onChange={(e) => setEditSaleCardPaidTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Havale/EFT</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaleBankPaidTL}
                      onChange={(e) => setEditSaleBankPaidTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Düzeltme Gerekçesi (Zorunlu) *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Örn: Müşteri hatalı birim fiyatı düzeltildi."
                  value={editSaleJustification}
                  onChange={(e) => setEditSaleJustification(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={editSaleSubmitting}
                  className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                >
                  {editSaleSubmitting ? 'Kaydediliyor...' : 'Satışı Düzelt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: SATIŞ İPTAL MODALI --- */}
      {cancellingSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <XCircle size={18} className="text-rose-600" /> Satış İptali (Fiş: {cancellingSale.receipt_no})
            </h3>

            <p className="text-xs text-slate-500">
              Bu satışı iptal ettiğinizde kasaya girmiş nakit/kart tutarları için ters kayıt oluşturulacak ve bilanço güncellenecektir.
            </p>

            {cancelSaleError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {cancelSaleError}
              </div>
            )}

            <form onSubmit={handleSaleCancelSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">İptal Gerekçesi (Zorunlu) *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Örn: Müşteri üründen vazgeçti, iade alındı."
                  value={cancelSaleJustification}
                  onChange={(e) => setCancelSaleJustification(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingSale(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelSaleSubmitting}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                >
                  {cancelSaleSubmitting ? 'İptal Ediliyor...' : 'Satışı İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: GİDER DÜZELTME MODALI --- */}
      {editingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Edit3 size={18} className="text-amber-600" /> Gider Düzeltme
            </h3>

            {editExpError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {editExpError}
              </div>
            )}

            <form onSubmit={handleExpenseUpdateSubmit} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Gider Kategorisi *</label>
                <select
                  value={editExpCatId}
                  onChange={(e) => setEditExpCatId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Açıklama *</label>
                <input
                  type="text"
                  required
                  value={editExpDescription}
                  onChange={(e) => setEditExpDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Ödeme Yapılan Kişi/Kurum</label>
                <input
                  type="text"
                  value={editExpRecipient}
                  onChange={(e) => setEditExpRecipient(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Düzeltme Gerekçesi (Zorunlu) *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Örn: Gider tutarı sehven fazla yazılmıştı."
                  value={editExpJustification}
                  onChange={(e) => setEditExpJustification(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={editExpSubmitting}
                  className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                >
                  {editExpSubmitting ? 'Kaydediliyor...' : 'Gideri Düzelt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: GİDER İPTAL MODALI --- */}
      {cancellingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <XCircle size={18} className="text-rose-600" /> Gider İptali
            </h3>

            <p className="text-xs text-slate-500">
              Bu gider kaydını iptal ettiğinizde kasadan çıkan nakit iade kaydıyla kasaya geri eklenecektir.
            </p>

            {cancelExpError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {cancelExpError}
              </div>
            )}

            <form onSubmit={handleExpenseCancelSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">İptal Gerekçesi (Zorunlu) *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Örn: Hatalı gider girişi iptal ediliyor."
                  value={cancelExpJustification}
                  onChange={(e) => setCancelExpJustification(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingExpense(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelExpSubmitting}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                >
                  {cancelExpSubmitting ? 'İptal Ediliyor...' : 'Gideri İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 5: GÜN SONU KAPATMA MODALI --- */}
      {showCloseModal && selectedDay && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Lock size={20} className="text-amber-600" /> {selectedDay.date_val} Gün Sonu Kapanışı
            </h3>

            <p className="text-xs text-slate-500">
              Bu günün fiziki kasadaki sayımını onaylayarak resmen kapatın. Kapatılan günden sonraki gün için devir bakiyesi oluşacaktır.
            </p>

            {closingError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {closingError}
              </div>
            )}

            <form onSubmit={handleCloseDaySubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Sayılan Fiziki Nakit Tutarı (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Örn: 13415.00"
                  value={countedCashTL}
                  onChange={(e) => setCountedCashTL(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Hesaplanan Beklenen Nakit: {formatTL(selectedDay.expected_cash_kurus || 0)}
                </span>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Kapanış Notu (Opsiyonel)</label>
                <textarea
                  rows={2}
                  placeholder="Örn: Gün sonu nakit sayımı eksiksiz tamamlandı."
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={closingSubmitting}
                  className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-amber-600/20 disabled:opacity-50"
                >
                  {closingSubmitting ? 'Kapatılıyor...' : 'Günü Kapat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
