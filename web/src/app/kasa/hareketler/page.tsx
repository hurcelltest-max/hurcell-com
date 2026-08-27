'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle, Edit3, XCircle, Wrench } from 'lucide-react';
import { KasaUnifiedMovement } from '@/lib/kasa/types';
import { canEditSale, canCancelSale } from '@/lib/kasa/pure_utils';

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
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'expenses' | 'credit' | 'corrections'>('all');

  // Satış Düzeltme Modal State'leri
  const [editingMovement, setEditingMovement] = useState<KasaUnifiedMovement | null>(null);
  const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editUnitPriceTL, setEditUnitPriceTL] = useState('');
  const [editCashPaidTL, setEditCashPaidTL] = useState('');
  const [editCardPaidTL, setEditCardPaidTL] = useState('');
  const [editBankPaidTL, setEditBankPaidTL] = useState('');
  const [editBankRef, setEditBankRef] = useState('');
  const [editCreditPaidTL, setEditCreditPaidTL] = useState('');
  const [editCostPriceTL, setEditCostPriceTL] = useState('');
  const [editServiceCostTL, setEditServiceCostTL] = useState('');
  const [editServiceCostStatus, setEditServiceCostStatus] = useState<string>('previously_paid_or_stock');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editSerialImei, setEditSerialImei] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editJustification, setEditJustification] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Satış İptal Modal State'leri
  const [cancellingMovement, setCancellingMovement] = useState<KasaUnifiedMovement | null>(null);
  const [cancelJustification, setCancelJustification] = useState('');
  const [cancelCostRefunded, setCancelCostRefunded] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [meRes, movRes, catRes] = await Promise.all([
        fetch('/api/kasa/auth/me'),
        fetch('/api/kasa/movements?page_size=200'),
        fetch('/api/kasa/categories'),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      const data = await movRes.json();
      if (!movRes.ok) throw new Error(data.error || 'Hareket defteri yüklenemedi.');
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
  const totalCard = filteredMovements.reduce((sum, m) => sum + (m.card_portion_kurus > 0 ? m.card_portion_kurus : 0), 0);
  const totalBankTransfer = filteredMovements.reduce((sum, m) => sum + (m.bank_transfer_portion_kurus > 0 ? m.bank_transfer_portion_kurus : 0), 0);

  // Satış Düzeltme Modalı Aç (Gerçek GET /api/kasa/sales/[id] ile satış ayrıntılarını yükle)
  const openEditSaleModal = async (m: KasaUnifiedMovement) => {
    if (!m.sale_id) return;
    setEditingMovement(m);
    setLoadingSaleDetail(true);
    setEditError(null);
    setEditProductName('');

    try {
      const res = await fetch(`/api/kasa/sales/${m.sale_id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Satış ayrıntıları yüklenemedi.');
      }

      setEditCategoryId(data.category_id || '');
      setEditProductName(data.product_name || '');
      setEditQuantity(String(data.quantity || 1));
      setEditUnitPriceTL((data.unit_price_kurus / 100).toFixed(2));
      setEditCashPaidTL((data.cash_paid_kurus / 100).toFixed(2));
      setEditCardPaidTL((data.card_paid_kurus / 100).toFixed(2));
      setEditBankPaidTL((data.bank_transfer_paid_kurus / 100).toFixed(2));
      setEditBankRef(data.bank_transfer_reference || '');
      setEditCreditPaidTL((data.credit_paid_kurus / 100).toFixed(2));
      setEditCostPriceTL(data.unit_cost_kurus > 0 ? (data.unit_cost_kurus / 100).toFixed(2) : '');
      setEditServiceCostTL(data.service_cost_kurus > 0 ? (data.service_cost_kurus / 100).toFixed(2) : '');
      setEditServiceCostStatus(data.service_cost_payment_status || 'previously_paid_or_stock');
      setEditCustomerName(data.customer_name || '');
      setEditSerialImei(data.serial_imei || '');
      setEditDescription(data.notes || '');
      setEditJustification('');
    } catch (err: any) {
      setEditError(err.message || 'Satış ayrıntıları yüklenemedi.');
    } finally {
      setLoadingSaleDetail(false);
    }
  };

  const handleSaleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement || !editingMovement.sale_id || loadingSaleDetail) return;

    const trimmedJustification = editJustification.trim();
    if (!trimmedJustification || trimmedJustification.length < 3) {
      setEditError('Düzeltme gerekçesi en az 3 karakter olmalıdır.');
      return;
    }

    const selectedCategoryObj = categories.find((c) => c.id === editCategoryId);
    const isTs = selectedCategoryObj?.name === 'Teknik Servis' || editingMovement.category_name === 'Teknik Servis';

    if (isTs) {
      const trimmedName = editCustomerName.trim();
      if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 120) {
        setEditError('Teknik servis işlemlerinde müşteri adı soyadı zorunludur.');
        return;
      }
    }

    const qtyNum = Number(editQuantity) || 1;
    const unitPriceNum = Number(editUnitPriceTL) || 0;
    const cashNum = Number(editCashPaidTL) || 0;
    const cardNum = Number(editCardPaidTL) || 0;
    const bankNum = Number(editBankPaidTL) || 0;
    const creditNum = Number(editCreditPaidTL) || 0;
    const totalPriceNum = unitPriceNum * qtyNum;
    const totalPaymentsEntered = cashNum + cardNum + bankNum + creditNum;

    if (totalPriceNum <= 0) {
      setEditError('Lütfen geçerli bir birim fiyat girin.');
      return;
    }

    if (Math.abs(totalPaymentsEntered - totalPriceNum) > 0.05) {
      setEditError(`Girilen ödemeler toplamı (${totalPaymentsEntered.toFixed(2)} TL), satış toplamından (${totalPriceNum.toFixed(2)} TL) farklıdır.`);
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError(null);
      const res = await fetch(`/api/kasa/sales/${editingMovement.sale_id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: editCategoryId || undefined,
          product_name: editProductName.trim(),
          quantity: qtyNum,
          unit_price_tl: unitPriceNum,
          cash_paid_tl: cashNum,
          card_paid_tl: cardNum,
          bank_transfer_paid_tl: bankNum,
          bank_transfer_reference: editBankRef.trim() || undefined,
          credit_paid_tl: creditNum > 0 ? creditNum : undefined,
          cost_price_tl: editCostPriceTL ? Number(editCostPriceTL) : undefined,
          service_cost_tl: editServiceCostTL ? Number(editServiceCostTL) : undefined,
          service_cost_payment_status: isTs ? editServiceCostStatus : undefined,
          customer_name: editCustomerName.trim() || undefined,
          serial_imei: editSerialImei.trim() || undefined,
          description: editDescription.trim() || undefined,
          justification: trimmedJustification,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış düzeltilemedi.');

      setEditingMovement(null);
      await loadData();
    } catch (err: any) {
      setEditError(err.message || 'Satış düzeltilirken hata oluştu.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Satış İptal Modalı Aç
  const openCancelSaleModal = (m: KasaUnifiedMovement) => {
    setCancellingMovement(m);
    setCancelJustification('');
    setCancelCostRefunded(false);
    setCancelError(null);
  };

  const handleSaleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingMovement || !cancellingMovement.sale_id) return;

    const trimmedJustification = cancelJustification.trim();
    if (!trimmedJustification || trimmedJustification.length < 3) {
      setCancelError('İptal gerekçesi en az 3 karakter olmalıdır.');
      return;
    }

    try {
      setCancelSubmitting(true);
      setCancelError(null);
      const res = await fetch(`/api/kasa/sales/${cancellingMovement.sale_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification: trimmedJustification,
          cost_refunded: cancelCostRefunded,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış iptal edilemedi.');

      setCancellingMovement(null);
      await loadData();
    } catch (err: any) {
      setCancelError(err.message || 'Satış iptal edilirken hata oluştu.');
    } finally {
      setCancelSubmitting(false);
    }
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
                    <th className="p-3">Açıklama & Detaylar</th>
                    <th className="p-3 text-right">Nakit Giriş</th>
                    <th className="p-3 text-right">Nakit Çıkış</th>
                    <th className="p-3 text-right">Kredi Kartı</th>
                    <th className="p-3 text-right">Havale / EFT</th>
                    <th className="p-3">İşlemi Yapan</th>
                    <th className="p-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.map((m) => {
                    const isCancelOrReverse = ['satis_duzeltme_iptal', 'gider_duzeltme_iptal', 'gider_iptal', 'iptal'].includes(m.movement_type);

                    // Canonical Action Authority Checks
                    const canEdit = canEditSale({
                      role: user?.role,
                      currentUserId: user?.id,
                      saleCreatedByUserId: m.sale_created_by_user_id || m.created_by_user_id,
                      saleStatus: m.sale_status,
                      dayStatus: m.kasa_day_status,
                      movementType: m.movement_type,
                    });

                    const canCancel = canCancelSale({
                      role: user?.role,
                      saleStatus: m.sale_status,
                      dayStatus: m.kasa_day_status,
                      movementType: m.movement_type,
                    });

                    const isTs = m.category_name === 'Teknik Servis';

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
                        <td className="p-3 text-slate-700 max-w-sm font-medium space-y-1">
                          <div>{m.description}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {m.customer_name ? (
                              <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                👤 {m.customer_name}
                              </span>
                            ) : isTs ? (
                              <span className="font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                👤 Müşteri adı girilmemiş
                              </span>
                            ) : null}
                            {Number(m.credit_amount_kurus || 0) > 0 && (
                              <span className="font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                                Cari: {formatTL(m.credit_amount_kurus!)}
                              </span>
                            )}
                            {Number(m.usd_tl_equivalent_kurus || 0) > 0 && (
                              <span className="font-extrabold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">
                                USD TL: {formatTL(m.usd_tl_equivalent_kurus!)}
                              </span>
                            )}
                            {Number(m.eur_tl_equivalent_kurus || 0) > 0 && (
                              <span className="font-extrabold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200">
                                EUR TL: {formatTL(m.eur_tl_equivalent_kurus!)}
                              </span>
                            )}
                          </div>
                        </td>
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
                              <button
                                onClick={() => openEditSaleModal(m)}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[11px] font-bold flex items-center gap-1"
                              >
                                <Edit3 size={11} /> Düzelt
                              </button>
                            ) : null}
                            {canCancel ? (
                              <button
                                onClick={() => openCancelSaleModal(m)}
                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[11px] font-bold flex items-center gap-1"
                              >
                                <XCircle size={11} /> İptal Et
                              </button>
                            ) : null}
                            {!canEdit && !canCancel && <span className="text-slate-300">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SATIŞ DÜZELTME MODALI */}
        {editingMovement && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl border border-slate-100 my-8">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                  <Edit3 size={20} className="text-blue-600" />
                  <span>Satış Kaydını Düzelt ({editingMovement.receipt_no || 'Fiş'})</span>
                </div>
                <button onClick={() => setEditingMovement(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{editError}</span>
                </div>
              )}

              {loadingSaleDetail ? (
                <div className="p-8 text-center text-xs font-semibold text-slate-500">Satış ayrıntıları yükleniyor...</div>
              ) : (
                <form onSubmit={handleSaleUpdateSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Ürün / Hizmet Adı *</label>
                    <input
                      type="text"
                      required
                      value={editProductName}
                      onChange={(e) => setEditProductName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Müşteri Adı Soyadı {editingMovement.category_name === 'Teknik Servis' ? '(Zorunlu) *' : '(Opsiyonel)'}
                    </label>
                    <input
                      type="text"
                      placeholder={editingMovement.category_name === 'Teknik Servis' ? 'Örn: Hür BaySEL (Zorunlu)' : 'Örn: Hür BaySEL (Opsiyonel)'}
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Adet *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Birim Fiyat (TL) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editUnitPriceTL}
                        onChange={(e) => setEditUnitPriceTL(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <label className="block text-slate-700 font-bold mb-2">Ödeme Dağılımı (TL)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold">Nakit TL</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editCashPaidTL}
                          onChange={(e) => setEditCashPaidTL(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold">Kredi Kartı TL</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editCardPaidTL}
                          onChange={(e) => setEditCardPaidTL(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold">Havale / EFT TL</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editBankPaidTL}
                          onChange={(e) => setEditBankPaidTL(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {editingMovement.category_name === 'Teknik Servis' && (
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <label className="block text-slate-700 font-bold flex items-center gap-1">
                        <Wrench size={14} className="text-purple-600" /> Teknik Servis Maliyet Yönetimi
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold">Maliyet Ödeme Durumu *</span>
                          <select
                            value={editServiceCostStatus}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditServiceCostStatus(val);
                              if (val === 'no_cost') setEditServiceCostTL('0');
                            }}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                          >
                            <option value="paid_from_cash">Kasadan Ödendi (Nakit Düşer)</option>
                            <option value="previously_paid_or_stock">Önceden Ödendi / Stoktan</option>
                            <option value="unpaid">Henüz Ödenmedi (Borç Kaydı)</option>
                            <option value="no_cost">Maliyet Yok (0 TL)</option>
                          </select>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold">Maliyet Tutarı (TL) *</span>
                          <input
                            type="number"
                            step="0.01"
                            disabled={editServiceCostStatus === 'no_cost'}
                            value={editServiceCostTL}
                            onChange={(e) => setEditServiceCostTL(e.target.value)}
                            placeholder="0.00"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Düzeltme Gerekçesi (Zorunlu) *</label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Örn: Ödeme türü yanlış seçilmişti, Nakit olarak düzeltildi."
                      value={editJustification}
                      onChange={(e) => setEditJustification(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingMovement(null)}
                      className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={editSubmitting || loadingSaleDetail || Boolean(editError && !editProductName)}
                      className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/20 disabled:opacity-50"
                    >
                      {editSubmitting ? 'Kaydediliyor...' : 'Düzeltmeyi Kaydet'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* SATIŞ İPTAL MODALI */}
        {cancellingMovement && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-red-600 font-bold text-base">
                  <XCircle size={20} />
                  <span>Satış İptali ({cancellingMovement.receipt_no || 'Fiş'})</span>
                </div>
                <button onClick={() => setCancellingMovement(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>

              {cancelError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{cancelError}</span>
                </div>
              )}

              <form onSubmit={handleSaleCancelSubmit} className="space-y-4 text-xs">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                  <p className="font-bold">⚠️ DİKKAT: Satış İptali Geri Alınamaz!</p>
                  <p className="text-[11px]">
                    İptal işlemi satış tutarlarını tersleyerek kasadan düşecek ve muhasebe hareket defterine iptal kaydı ekleyecektir.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">İptal Gerekçesi (Zorunlu) *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Örn: Müşteri ürünü almaktan vazgeçti, iade edildi."
                    value={cancelJustification}
                    onChange={(e) => setCancelJustification(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCancellingMovement(null)}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={cancelSubmitting}
                    className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-600/20 disabled:opacity-50"
                  >
                    {cancelSubmitting ? 'İptal Ediliyor...' : 'Satışı İptal Et'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
