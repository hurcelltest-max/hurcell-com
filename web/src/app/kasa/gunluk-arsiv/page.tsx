'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  List,
  Wrench,
  MinusCircle,
  FileSpreadsheet,
  Edit3,
  XCircle,
} from 'lucide-react';
import { canEditSale, canCancelSale, canEditExpense, canCancelExpense } from '@/lib/kasa/pure_utils';

interface DayItem {
  id: string;
  date_val: string;
  status: 'open' | 'closed';
  opening_balance_kurus: number;
  counted_cash_kurus?: number | null;
  expected_cash_kurus?: number | null;
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

export default function StaffDailyArchivePage() {
  const [user, setUser] = useState<{ id: string; role: 'yonetici' | 'personel'; full_name: string } | null>(null);
  const [days, setDays] = useState<DayItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dayDetail, setDayDetail] = useState<any | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummaryItem[]>([]);
  const [tsDirectCosts, setTsDirectCosts] = useState<TSDirectCostItem[]>([]);
  const [tsSubtotals, setTsSubtotals] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDays = async () => {
    try {
      setLoading(true);
      setError(null);

      const [meRes, daysRes] = await Promise.all([
        fetch('/api/kasa/auth/me'),
        fetch('/api/kasa/days'),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      const daysData = await daysRes.json();
      if (!daysRes.ok) throw new Error(daysData.error || 'Kasa günleri yüklenemedi.');

      const sorted = (daysData.days || daysData.items || []).sort((a: DayItem, b: DayItem) => b.date_val.localeCompare(a.date_val));
      setDays(sorted);

      if (sorted.length > 0 && !selectedDay) {
        setSelectedDay(sorted[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Günlük arşiv listesi yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const loadDayDetail = async (day: DayItem) => {
    try {
      setDetailLoading(true);
      setDetailError(null);

      const [detailRes, summaryRes, movRes] = await Promise.all([
        fetch(`/api/kasa/day-detail?day_id=${day.id}`),
        fetch(`/api/kasa/expense-summary?day_id=${day.id}`),
        fetch(`/api/kasa/movements?kasa_day_id=${day.id}&page_size=200`),
      ]);

      const detailData = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailData.error || 'Gün detayları okunamadı.');
      setDayDetail(detailData);

      const summaryData = await summaryRes.json();
      if (summaryRes.ok) {
        setExpenseSummary(summaryData.expenseSummary || []);
        setTsDirectCosts(summaryData.tsDirectCosts || []);
        setTsSubtotals(summaryData.tsSubtotals || null);
      }

      const movData = await movRes.json();
      if (movRes.ok) {
        setMovements(movData.items || movData.movements || []);
      }
    } catch (err: any) {
      setDetailError(err.message || 'Günlük detaylar yüklenirken hata oluştu.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadDays();
  }, []);

  useEffect(() => {
    if (selectedDay) {
      loadDayDetail(selectedDay);
    }
  }, [selectedDay]);

  const handleExportCSV = () => {
    if (!selectedDay || !movements) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Tarih,Islem Turi,Fis No,Aciklama,Genel Gider TL,TS Dogrudan Maliyet TL,Nakit Giris TL,Nakit Cikis TL,Kredi Karti TL,Havale TL,Islemi Yapan\n';

    movements.forEach((m) => {
      const isExpense = ['nakit_gider', 'salary_payment', 'ts_cost_cash_payment'].includes(m.movement_type);
      const isTsCost = m.movement_type === 'ts_cost_cash_payment' || Boolean(m.category_name === 'Teknik Servis' && m.service_cost_kurus > 0);
      const genExpTL = isExpense && !isTsCost ? (m.amount_kurus / 100).toFixed(2) : '0.00';
      const tsCostTL = isTsCost ? ((m.amount_kurus || m.service_cost_kurus || 0) / 100).toFixed(2) : '0.00';

      const row = [
        m.date_val,
        `"${m.movement_label || m.movement_type}"`,
        `"${m.receipt_no || '-'}"`,
        `"${(m.description || '').replace(/"/g, '""')}"`,
        genExpTL,
        tsCostTL,
        (m.cash_in_kurus / 100).toFixed(2),
        (m.cash_out_kurus / 100).toFixed(2),
        (m.card_portion_kurus / 100).toFixed(2),
        (m.bank_transfer_portion_kurus / 100).toFixed(2),
        `"${m.created_by_name || '-'}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HurCELL_Kasa_Arsiv_${selectedDay.date_val}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Link href="/kasa" className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-600">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar size={22} className="text-indigo-600" /> Günlük Kasa Arşivi
              </h1>
              <p className="text-xs text-slate-500">Tarihsel kasa günleri, genel giderler, Teknik Servis maliyetleri ve hareket defteri</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={!selectedDay}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <FileSpreadsheet size={16} /> CSV Raporu İndir
            </button>
            <button
              onClick={loadDays}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2 shadow-sm">
            <AlertCircle size={18} />
            <span>Günlük arşiv yüklenemedi: {error}</span>
          </div>
        )}

        {/* Gün Seçim Tabları */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Kasa Gününü Seçin</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDay(d)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                  selectedDay?.id === d.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
                }`}
              >
                <span>{d.date_val}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                    d.status === 'open'
                      ? selectedDay?.id === d.id ? 'bg-emerald-400 text-slate-950' : 'bg-emerald-100 text-emerald-800'
                      : selectedDay?.id === d.id ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {d.status === 'open' ? 'Açık' : 'Kapalı'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Detay Alanı */}
        {selectedDay && (
          <div className="space-y-6">
            {/* Gün Durum Başlığı */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-extrabold text-slate-900">{selectedDay.date_val} Kasa Özeti</h2>
                {selectedDay.status === 'closed' ? (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-xs font-bold">
                    KAPALI GÜN (Salt Okunur)
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> AÇIK GÜN (Yetkili İşlemlere Açık)
                  </span>
                )}
              </div>
            </div>

            {detailLoading ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-semibold text-slate-400">
                Günlük detaylar yükleniyor...
              </div>
            ) : detailError ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>Günlük detaylar yüklenemedi: {detailError}</span>
              </div>
            ) : (
              <>
                {/* 1. GÜNLÜK KASA GİDERİ ÖZET FÖYÜ */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <MinusCircle size={18} className="text-rose-600" /> Günlük Kasa Gideri Özet Föyü ({selectedDay.date_val})
                    </h3>
                  </div>

                  {/* BÖLÜM A: GENEL KASA GİDERLERİ */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span>A. GENEL KASA GİDERLERİ</span>
                      <span className="text-[10px] text-slate-400 font-normal">(public.kasa_expenses)</span>
                    </h4>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="p-3">Gider Kategorisi</th>
                            <th className="p-3 text-center">İşlem Adedi</th>
                            <th className="p-3 text-right">Brüt Gider Toplamı</th>
                            <th className="p-3 text-right">İptal / Düzeltme Toplamı</th>
                            <th className="p-3 text-right">Net Aktif Gider Toplamı</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {expenseSummary.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400 font-medium italic">
                                {selectedDay.date_val} tarihinde genel kasa gideri kaydedilmemiştir.
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

                  {/* BÖLÜM B: TEKNİK SERVİS DOĞRUDAN MALİYETLERİ */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Wrench size={14} className="text-purple-600" />
                      <span>B. TEKNİK SERVİS DOĞRUDAN MALİYETLERİ</span>
                      <span className="text-[10px] text-slate-400 font-normal">(kasa_sales.service_cost_kurus)</span>
                    </h4>

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
                                {selectedDay.date_val} tarihinde Teknik Servis doğrudan maliyeti bulunmamaktadır.
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
                </div>

                {/* 2. DEĞİŞTİRİLEMEZ HAREKET DEFTERİ (kasa_movements) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <List size={18} className="text-indigo-600" /> Değiştirilemez Kasa Hareket Defteri ({movements.length} Hareket)
                    </h3>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="p-3">Saat</th>
                          <th className="p-3">İşlem Türü</th>
                          <th className="p-3">Fiş No</th>
                          <th className="p-3">Açıklama</th>
                          <th className="p-3 text-right">Nakit Giriş</th>
                          <th className="p-3 text-right">Nakit Çıkış</th>
                          <th className="p-3 text-right">Kredi Kartı</th>
                          <th className="p-3 text-right">Havale / EFT</th>
                          <th className="p-3">İşlemi Yapan</th>
                          <th className="p-3 text-center">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {movements.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-6 text-center text-slate-400 font-medium">
                              Bu kasa gününe ait hareket bulunamamıştır.
                            </td>
                          </tr>
                        ) : (
                          movements.map((m) => {
                            const isCancel = ['satis_duzeltme_iptal', 'gider_duzeltme_iptal', 'gider_iptal', 'iptal'].includes(m.movement_type);

                            const canEdit = canEditSale({
                              role: user?.role,
                              currentUserId: user?.id,
                              saleCreatedByUserId: m.sale_created_by_user_id || m.created_by_user_id,
                              saleStatus: m.sale_status,
                              dayStatus: selectedDay.status,
                              movementType: m.movement_type,
                            });

                            const canCancel = canCancelSale({
                              role: user?.role,
                              saleStatus: m.sale_status,
                              dayStatus: selectedDay.status,
                              movementType: m.movement_type,
                            });

                            return (
                              <tr key={m.id} className={`hover:bg-slate-50 ${isCancel ? 'bg-amber-50/40' : ''}`}>
                                <td className="p-3 text-slate-500 font-medium">
                                  {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                      isCancel
                                        ? 'bg-amber-100 text-amber-800'
                                        : m.cash_in_kurus > 0
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {m.movement_label}
                                  </span>
                                </td>
                                <td className="p-3 font-mono text-slate-600 text-[11px]">{m.receipt_no || '-'}</td>
                                <td className="p-3 font-medium text-slate-700 max-w-xs">{m.description}</td>
                                <td className="p-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  {m.cash_in_kurus > 0 ? formatTL(m.cash_in_kurus) : '-'}
                                </td>
                                <td className="p-3 text-right font-bold text-rose-600 whitespace-nowrap">
                                  {m.cash_out_kurus > 0 ? formatTL(m.cash_out_kurus) : '-'}
                                </td>
                                <td className="p-3 text-right font-semibold text-blue-700 whitespace-nowrap">
                                  {m.card_portion_kurus > 0 ? formatTL(m.card_portion_kurus) : '-'}
                                </td>
                                <td className="p-3 text-right font-semibold text-purple-700 whitespace-nowrap">
                                  {m.bank_transfer_portion_kurus > 0 ? formatTL(m.bank_transfer_portion_kurus) : '-'}
                                </td>
                                <td className="p-3 text-slate-500 font-medium whitespace-nowrap">{m.created_by_name}</td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    {canEdit ? (
                                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">Düzenlenebilir</span>
                                    ) : canCancel ? (
                                      <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-bold">İptal Edilebilir</span>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
