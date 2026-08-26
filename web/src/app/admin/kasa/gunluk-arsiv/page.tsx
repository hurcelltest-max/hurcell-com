'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Download, Printer, CheckCircle, Lock, Eye } from 'lucide-react';
import { KasaDay, KasaUnifiedMovement } from '@/lib/kasa/types';

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function AdminGunlukArsivPage() {
  const [days, setDays] = useState<KasaDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<KasaDay | null>(null);
  const [dayMovements, setDayMovements] = useState<KasaUnifiedMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedCashTL, setCountedCashTL] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [closingSubmitting, setClosingSubmitting] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);

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
  }, []);

  const handleSelectDay = async (day: KasaDay) => {
    setSelectedDay(day);
    try {
      setMovementsLoading(true);
      const res = await fetch(`/api/kasa/movements?kasa_day_id=${day.id}&page_size=200`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Veri okunamadı.');
      setDayMovements(data.items || data.movements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setMovementsLoading(false);
    }
  };

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

  const exportCSV = (day: KasaDay, movements: KasaUnifiedMovement[]) => {
    const sanitize = (val: string) => {
      if (!val) return '';
      const str = String(val).trim().replace(/[\r\n\t]/g, ' ');
      if (/^[=\+\-@\t\r]/.test(str)) {
        return `'${str}`;
      }
      return str;
    };

    let csv = '\uFEFF'; // UTF-8 BOM for Turkish Excel support
    csv += `Tarih;${sanitize(day.date_val)}\n`;
    csv += `Durum;${day.status === 'closed' ? 'Kapalı' : 'Açık'}\n`;
    csv += `Açılış Devri (TL);${(day.opening_balance_kurus / 100).toFixed(2)}\n`;
    csv += `Beklenen Nakit (TL);${((day.expected_cash_kurus || 0) / 100).toFixed(2)}\n`;
    csv += `Sayılan Nakit (TL);${((day.counted_cash_kurus || 0) / 100).toFixed(2)}\n\n`;

    csv += 'Tarih & Saat;İşlem Türü;Kategori;Açıklama;Nakit Giriş (TL);Nakit Çıkış (TL);Kredi Kartı (TL);Havale/EFT (TL);Kullanıcı\n';

    movements.forEach((m) => {
      const timeStr = new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      csv += `${sanitize(m.date_val + ' ' + timeStr)};${sanitize(m.movement_label)};${sanitize(m.category_name || '-')};${sanitize(m.description)};${(m.cash_in_kurus / 100).toFixed(2)};${(m.cash_out_kurus / 100).toFixed(2)};${(m.card_portion_kurus / 100).toFixed(2)};${(m.bank_transfer_portion_kurus / 100).toFixed(2)};${sanitize(m.created_by_name)}\n`;
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
              <p className="text-xs text-slate-500">Tarih sırasıyla tüm kasa günleri, kapanış sonuçları ve günlük hareket defterleri</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Kolon: Gün Listesi */}
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
                        {formatTL(d.counted_cash_kurus || d.expected_cash_kurus || 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sağ Kolon: Günlük Detay Föyü & Hareket Defteri */}
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
                      onClick={() => exportCSV(selectedDay, dayMovements)}
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

                {/* Özet Kartları */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Önceki Gün Devri</span>
                    <div className="text-sm font-extrabold text-slate-900">{formatTL(selectedDay.opening_balance_kurus)}</div>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Sermaye Girişi</span>
                    <div className="text-sm font-extrabold text-emerald-800">{formatTL(selectedDay.capital_injected_kurus)}</div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Patron Çekimi</span>
                    <div className="text-sm font-extrabold text-amber-900">{formatTL(selectedDay.owner_withdrawn_kurus)}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Kapanış / Sayılan</span>
                    <div className="text-sm font-extrabold text-blue-900">{formatTL(selectedDay.counted_cash_kurus || selectedDay.expected_cash_kurus || 0)}</div>
                  </div>
                </div>

                {/* Günlük Hareket Defteri */}
                <div className="space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Günlük Hareket Defteri ({dayMovements.length} İşlem)</h3>
                  {movementsLoading ? (
                    <div className="py-6 text-center text-xs text-slate-400">Hareketler yükleniyor...</div>
                  ) : dayMovements.length === 0 ? (
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
                          {dayMovements.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50">
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

      {/* GÜN SONU KAPATMA MODALI */}
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
