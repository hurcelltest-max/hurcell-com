'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, XCircle, Edit3 } from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

interface CreditCustomer {
  id: string;
  full_name: string;
}

interface Sale {
  id: string;
  receipt_no: string;
  category_id?: string;
  category_name: string;
  product_name: string;
  quantity: number;
  unit_price_kurus: number;
  total_price_kurus: number;
  cash_paid_kurus: number;
  card_paid_kurus: number;
  bank_transfer_paid_kurus?: number;
  bank_transfer_reference?: string;
  credit_paid_kurus?: number;
  credit_customer_id?: string;
  usd_paid_cents?: number;
  usd_rate?: number;
  usd_tl_equivalent_kurus?: number;
  eur_paid_cents?: number;
  eur_rate?: number;
  eur_tl_equivalent_kurus?: number;
  status: 'completed' | 'returned' | 'cancelled';
  created_by_user_id?: string;
  created_by_name: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  serial_imei?: string;
  description?: string;
  cost_price_kurus?: number;
  service_cost_kurus?: number;
}

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
  const [sales, setSales] = useState<Sale[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomer[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // İptal Modalı State'leri
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [justification, setJustification] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Düzeltme Modalı State'leri
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editUnitPriceTL, setEditUnitPriceTL] = useState('');
  const [editCashTL, setEditCashTL] = useState('');
  const [editCardTL, setEditCardTL] = useState('');
  const [editBankTransferTL, setEditBankTransferTL] = useState('');
  const [editBankTransferRef, setEditBankTransferRef] = useState('');
  const [editCreditTL, setEditCreditTL] = useState('');
  const [editCreditCustomerId, setEditCreditCustomerId] = useState('');
  const [editUSDPaid, setEditUSDPaid] = useState('');
  const [editUSDRate, setEditUSDRate] = useState('');
  const [editEURPaid, setEditEURPaid] = useState('');
  const [editEURRate, setEditEURRate] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editSerialIMEI, setEditSerialIMEI] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editJustification, setEditJustification] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const meRes = await fetch('/api/kasa/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      const catRes = await fetch('/api/kasa/categories');
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      const custRes = await fetch('/api/kasa/credit-customers');
      if (custRes.ok) {
        const custData = await custRes.json();
        setCreditCustomers(custData.customers || []);
      }

      const res = await fetch('/api/kasa/sales');
      if (!res.ok) throw new Error('Satış hareketleri yüklenemedi.');
      const data = await res.json();
      setSales(data.sales || []);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEditModal = (s: Sale) => {
    if (
      (s.credit_paid_kurus && s.credit_paid_kurus > 0) ||
      (s.usd_paid_cents && s.usd_paid_cents > 0) ||
      (s.eur_paid_cents && s.eur_paid_cents > 0)
    ) {
      alert(
        'Cari/veresiye veya döviz içeren satışlar güvenlik nedeniyle doğrudan düzeltilemez. Yönetici tarafından iptal edilerek yeniden oluşturulmalıdır.'
      );
      return;
    }

    setEditError(null);
    setEditingSale(s);
    setEditCategoryId(s.category_id || (categories[0]?.id || ''));
    setEditProductName(s.product_name);
    setEditQuantity(s.quantity.toString());
    setEditUnitPriceTL((s.unit_price_kurus / 100).toString());
    setEditCashTL((s.cash_paid_kurus / 100).toString());
    setEditCardTL((s.card_paid_kurus / 100).toString());
    setEditBankTransferTL(((s.bank_transfer_paid_kurus || 0) / 100).toString());
    setEditBankTransferRef(s.bank_transfer_reference || '');
    setEditCreditTL(((s.credit_paid_kurus || 0) / 100).toString());
    setEditCreditCustomerId(s.credit_customer_id || '');
    setEditUSDPaid(((s.usd_paid_cents || 0) / 100).toString());
    setEditUSDRate(s.usd_rate ? s.usd_rate.toString() : '');
    setEditEURPaid(((s.eur_paid_cents || 0) / 100).toString());
    setEditEURRate(s.eur_rate ? s.eur_rate.toString() : '');
    setEditCustomerName(s.customer_name || '');
    setEditCustomerPhone(s.customer_phone || '');
    setEditSerialIMEI(s.serial_imei || '');
    setEditDescription(s.description || '');
    setEditJustification('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;

    if (!editJustification.trim()) {
      return setEditError('Satış düzeltme için gerekçe girilmesi zorunludur.');
    }

    if (Number(editCreditTL) > 0 || Number(editUSDPaid) > 0 || Number(editEURPaid) > 0) {
      return setEditError(
        'Cari/veresiye veya döviz içeren satışlar güvenlik nedeniyle doğrudan düzeltilemez. Yönetici tarafından iptal edilerek yeniden oluşturulmalıdır.'
      );
    }

    if (!editProductName.trim() || Number(editQuantity) <= 0 || Number(editUnitPriceTL) <= 0) {
      return setEditError('Lütfen geçerli ürün adı, adet ve birim fiyat girin.');
    }

    const calculatedTotalTL = Number(editQuantity) * Number(editUnitPriceTL);
    const usdEquivTL = Number(editUSDPaid) > 0 && Number(editUSDRate) > 0 ? Number(editUSDPaid) * Number(editUSDRate) : 0;
    const eurEquivTL = Number(editEURPaid) > 0 && Number(editEURRate) > 0 ? Number(editEURPaid) * Number(editEURRate) : 0;
    const portionsSumTL = Number(editCashTL) + Number(editCardTL) + Number(editBankTransferTL) + Number(editCreditTL) + usdEquivTL + eurEquivTL;

    if (Math.abs(calculatedTotalTL - portionsSumTL) > 0.01) {
      return setEditError(
        `Satış toplamı (${calculatedTotalTL.toLocaleString('tr-TR')} TL) ödeme yöntemleri toplamına (${portionsSumTL.toLocaleString('tr-TR')} TL) eşit olmalıdır.`
      );
    }

    try {
      setEditLoading(true);
      setEditError(null);

      const res = await fetch(`/api/kasa/sales/${editingSale.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: editCategoryId,
          product_name: editProductName.trim(),
          quantity: Number(editQuantity),
          unit_price_tl: Number(editUnitPriceTL),
          cash_paid_tl: Number(editCashTL),
          card_paid_tl: Number(editCardTL),
          bank_transfer_paid_tl: Number(editBankTransferTL),
          bank_transfer_reference: editBankTransferRef.trim() || undefined,
          credit_paid_tl: Number(editCreditTL),
          credit_customer_id: editCreditCustomerId || undefined,
          usd_paid: Number(editUSDPaid),
          usd_rate: Number(editUSDRate) || undefined,
          eur_paid: Number(editEURPaid),
          eur_rate: Number(editEURRate) || undefined,
          justification: editJustification.trim(),
          customer_name: editCustomerName.trim() || undefined,
          customer_phone: editCustomerPhone.trim() || undefined,
          serial_imei: editSerialIMEI.trim() || undefined,
          description: editDescription.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış düzeltilemedi.');

      setEditingSale(null);
      await loadData();
    } catch (err: any) {
      setEditError(err.message || 'Düzeltme sırasında bir hata oluştu.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale || !justification.trim()) return;

    try {
      setCancelLoading(true);
      setCancelError(null);

      const res = await fetch(`/api/kasa/sales/${selectedSale.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: justification.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İptal işlemi başarısız.');

      setSelectedSale(null);
      setJustification('');
      await loadData();
    } catch (err: any) {
      setCancelError(err.message || 'İptal sırasında bir hata oluştu.');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kasa"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-lg text-slate-900">Günlük Satış Hareketleri</h1>
              <p className="text-xs text-slate-500">Bugün gerçekleşen satışlar ve işlem detayları</p>
            </div>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-2 text-xs font-semibold transition-all"
          >
            <RefreshCw size={16} /> Yenile
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Fiş No</th>
                  <th className="py-3.5 px-4">Tarih / Saat</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Ürün Adı</th>
                  <th className="py-3.5 px-3 text-center">Adet</th>
                  <th className="py-3.5 px-4 text-right">Nakit</th>
                  <th className="py-3.5 px-4 text-right">Kredi Kartı</th>
                  <th className="py-3.5 px-4 text-right">Havale/EFT</th>
                  <th className="py-3.5 px-4 text-right">Toplam</th>
                  <th className="py-3.5 px-4 text-center">Personel</th>
                  <th className="py-3.5 px-4 text-center">Durum</th>
                  <th className="py-3.5 px-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">
                      Bugün henüz satış kaydı bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => {
                    const isManager = user?.role === 'yonetici';
                    const isOwnSale = s.created_by_user_id ? s.created_by_user_id === user?.id : true;
                    const canEdit = s.status === 'completed' && (isManager || isOwnSale);
                    const canCancel = s.status === 'completed' && isManager;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-xs">{s.receipt_no}</td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          {new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-semibold">{s.category_name}</td>
                        <td className="py-3.5 px-4 text-slate-900">
                          {s.product_name}
                          {s.serial_imei && (
                            <span className="block text-[11px] font-mono text-slate-400">IMEI: {s.serial_imei}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-800">{s.quantity}</td>
                        <td className="py-3.5 px-4 text-right text-emerald-600">{formatTL(s.cash_paid_kurus)}</td>
                        <td className="py-3.5 px-4 text-right text-blue-600">{formatTL(s.card_paid_kurus)}</td>
                        <td className="py-3.5 px-4 text-right text-purple-600">{formatTL(s.bank_transfer_paid_kurus || 0)}</td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                          {formatTL(s.total_price_kurus)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-slate-600">{s.created_by_name}</td>
                        <td className="py-3.5 px-4 text-center">
                          {s.status === 'completed' ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              Tamamlandı
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                              İptal Edildi
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {canEdit && (
                              <button
                                onClick={() => openEditModal(s)}
                                className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Edit3 size={13} /> Düzelt
                              </button>
                            )}
                            {canCancel && (
                              <button
                                onClick={() => setSelectedSale(s)}
                                className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                              >
                                İptal Et
                              </button>
                            )}
                            {!canEdit && !canCancel && <span className="text-xs text-slate-400">-</span>}
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
      </main>

      {/* SATIŞ DÜZELTME MODALI */}
      {editingSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-xl w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Edit3 className="text-blue-600" size={20} /> Satış Fişini Düzelt ({editingSale.receipt_no})
              </h3>
              <button
                onClick={() => setEditingSale(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ürün / Hizmet Adı *</label>
                  <input
                    type="text"
                    required
                    value={editProductName}
                    onChange={(e) => setEditProductName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Adet *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Birim Fiyat (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editUnitPriceTL}
                    onChange={(e) => setEditUnitPriceTL(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hesaplanan Toplam</label>
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-900">
                    {((Number(editQuantity) || 0) * (Number(editUnitPriceTL) || 0)).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    TL
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-800 text-xs mb-2">Ödeme Dağılımı (TL / Döviz)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-emerald-700 mb-1">Nakit Ödeme (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editCashTL}
                      onChange={(e) => setEditCashTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-emerald-800"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-blue-700 mb-1">Kredi Kartı (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editCardTL}
                      onChange={(e) => setEditCardTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-blue-800"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-purple-700 mb-1">Havale / EFT (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editBankTransferTL}
                      onChange={(e) => setEditBankTransferTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-purple-800"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-purple-700 mb-1">EFT Referans No</label>
                    <input
                      type="text"
                      placeholder="Dekont no"
                      value={editBankTransferRef}
                      onChange={(e) => setEditBankTransferRef(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-amber-800 mb-1">Cari / Veresiye (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editCreditTL}
                      onChange={(e) => setEditCreditTL(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-amber-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-amber-800 mb-1">Cari Müşteri</label>
                    <select
                      value={editCreditCustomerId}
                      onChange={(e) => setEditCreditCustomerId(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    >
                      <option value="">-- Müşteri Seçin --</option>
                      {creditCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seri No / IMEI</label>
                  <input
                    type="text"
                    placeholder="IMEI veya seri numarası"
                    value={editSerialIMEI}
                    onChange={(e) => setEditSerialIMEI(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Müşteri Ad Soyad</label>
                  <input
                    type="text"
                    placeholder="Müşteri adı"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Müşteri Telefon</label>
                  <input
                    type="text"
                    placeholder="05XX XXX XX XX"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-blue-900 uppercase tracking-wider mb-1">
                  Düzeltme Gerekçesi (Zorunlu) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Satış fişinde yapılan düzeltmenin sebebini açıklayın..."
                  value={editJustification}
                  onChange={(e) => setEditJustification(e.target.value)}
                  className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md text-xs disabled:opacity-50"
                >
                  {editLoading ? 'Güncelleniyor...' : 'Düzeltmeyi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YÖNETİCİ İPTAL GEREKÇE MODALI */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Satış İptali Onayı (Yönetici)</h3>
            <p className="text-xs text-slate-600">
              <span className="font-bold">{selectedSale.receipt_no}</span> nolu{' '}
              <span className="font-bold">{selectedSale.product_name}</span> satışı iptal edilecektir.
            </p>

            {cancelError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  İptal Gerekçesi (Zorunlu) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="İptal sebebini açıklayın..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-red-600/20"
                >
                  {cancelLoading ? 'İptal Ediliyor...' : 'Satışı İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
