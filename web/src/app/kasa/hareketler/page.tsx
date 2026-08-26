'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, XCircle, Edit3, Calendar, Filter, List, Download } from 'lucide-react';
import { KasaUnifiedMovement } from '@/lib/kasa/types';

interface User {
  id: string;
  role: 'yonetici' | 'personel';
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function KasaHareketlerPage() {
  const [user, setUser] = useState<User | null>(null);
  const [movements, setMovements] = useState<KasaUnifiedMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'expenses' | 'credit' | 'corrections'>('all');
  const [datePeriod, setDatePeriod] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const meRes = await fetch('/api/kasa/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      const res = await fetch('/api/kasa/movements?page_size=200');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hareket defteri yüklenemedi.');
      setMovements(data.items || data.movements || []);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredMovements = movements.filter((m) => {
    if (filterType === 'sales') {
      return ['satis', 'satis_duzeltme_yeni', 'fx_sale_payment', 'iade', 'iptal'].includes(m.movement_type);
    }
    if (filterType === 'expenses') {
      return ['nakit_gider', 'salary_payment', 'gider_duzeltme_yeni', 'gider_iptal', 'ts_cost_cash_payment', 'ts_cost_cash_refund'].includes(m.movement_type);
    }
    if (filterType === 'credit') {
      return ['credit_tahsilat', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'bank_transfer_tahsilat'].includes(m.movement_type);
    }
    if (filterType === 'corrections') {
      return ['satis_duzeltme_iptal', 'satis_duzeltme_yeni', 'gider_duzeltme_iptal', 'gider_duzeltme_yeni', 'gider_iptal', 'iptal'].includes(m.movement_type);
    }
    return true;
  });

  const totalCashIn = filteredMovements.reduce((sum, m) => sum + m.cash_in_kurus, 0);
  const totalCashOut = filteredMovements.reduce((sum, m) => sum + m.cash_out_kurus, 0);
  const totalCard = filteredMovements.reduce((sum, m) => sum + m.card_portion_kurus, 0);
  const totalBankTransfer = filteredMovements.reduce((sum, m) => sum + m.bank_transfer_portion_kurus, 0);

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
              <h1 className="text-xl font-bold text-slate-900">Birleşik Günlük Kasa Hareket Defteri</h1>
              <p className="text-xs text-slate-500">Satışlar, giderler, tahsilatlar, banka ve düzeltme ters kayıtları tek kanonik listede</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Üst Dönem Özet Kartları */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Toplam Nakit Giriş</span>
            <div className="text-lg font-extrabold text-emerald-800">{formatTL(totalCashIn)}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Toplam Nakit Çıkış</span>
            <div className="text-lg font-extrabold text-rose-600">{formatTL(totalCashOut)}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Toplam POS Kredi Kartı</span>
            <div className="text-lg font-extrabold text-blue-800">{formatTL(totalCard)}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Toplam Havale / EFT</span>
            <div className="text-lg font-extrabold text-purple-800">{formatTL(totalBankTransfer)}</div>
          </div>
        </div>

        {/* Filtre Tabları */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'Tüm Hareketler' },
            { id: 'sales', label: 'Satışlar' },
            { id: 'expenses', label: 'Giderler' },
            { id: 'credit', label: 'Tahsilatlar' },
            { id: 'corrections', label: 'İptal & Düzeltmeler' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === tab.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tablo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-semibold text-slate-400">Hareket defteri yükleniyor...</div>
          ) : filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-xs font-semibold text-slate-400">Kayıtlı hareket bulunamadı.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Tarih & Saat</th>
                    <th className="p-3">İşlem Türü</th>
                    <th className="p-3">Fiş No / Ref</th>
                    <th className="p-3">Açıklama</th>
                    <th className="p-3 text-right">Nakit Giriş</th>
                    <th className="p-3 text-right">Nakit Çıkış</th>
                    <th className="p-3 text-right">Kredi Kartı</th>
                    <th className="p-3 text-right">Havale / EFT</th>
                    <th className="p-3">İşlemi Yapan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.map((m) => {
                    const isCancelOrReverse = ['satis_duzeltme_iptal', 'gider_duzeltme_iptal', 'gider_iptal', 'iptal'].includes(m.movement_type);
                    return (
                      <tr key={m.id} className={`hover:bg-slate-50 ${isCancelOrReverse ? 'bg-amber-50/40' : ''}`}>
                        <td className="p-3 text-slate-500 font-medium whitespace-nowrap">
                          {m.date_val} {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              isCancelOrReverse
                                ? 'bg-amber-100 text-amber-800'
                                : m.cash_in_kurus > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {m.movement_label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">{m.receipt_no || '-'}</td>
                        <td className="p-3 text-slate-700 max-w-sm font-medium">{m.description}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
