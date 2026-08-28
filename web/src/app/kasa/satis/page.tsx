'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingBag,
  CheckCircle,
  AlertTriangle,
  Coins,
  CreditCard,
  Banknote,
  Search,
  UserCheck,
  UserX,
  ArrowLeft,
} from 'lucide-react';
import { KasaCategory, KasaCreditCustomer, KasaFXRatesResponse } from '@/lib/kasa/types';

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function KasaSatisPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<KasaCategory[]>([]);
  const [fxRates, setFxRates] = useState<KasaFXRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [categoryId, setCategoryId] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [productCode, setProductCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPriceTL, setUnitPriceTL] = useState('');
  const [costPriceTL, setCostPriceTL] = useState('');
  const [serviceCostPaymentStatus, setServiceCostPaymentStatus] = useState<'paid_from_cash' | 'previously_paid_or_stock' | 'unpaid'>('previously_paid_or_stock');
  const [description, setDescription] = useState('');
  const [serialImei, setSerialImei] = useState('');

  // Ödeme Seçenekleri State (Nakit, Kart, Havale/EFT, USD, EUR, Cari)
  const [cashPaidTL, setCashPaidTL] = useState('');
  const [cardPaidTL, setCardPaidTL] = useState('');
  const [bankTransferPaidTL, setBankTransferPaidTL] = useState('');
  const [bankTransferReference, setBankTransferReference] = useState('');
  const [usdPaid, setUsdPaid] = useState('');
  const [eurPaid, setEurPaid] = useState('');
  const [creditPaidTL, setCreditPaidTL] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Cari Müşteri Arama & Seçim State
  const [creditCustomerSearch, setCreditCustomerSearch] = useState('');
  const [creditCustomers, setCreditCustomers] = useState<KasaCreditCustomer[]>([]);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState<KasaCreditCustomer | null>(null);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedCategoryObj = categories.find((c) => c.id === categoryId);
  const isTechnicalService = selectedCategoryObj?.name === 'Teknik Servis';

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [catRes, rateRes] = await Promise.all([
          fetch('/api/kasa/categories'),
          fetch('/api/kasa/rates'),
        ]);

        if (catRes.ok) {
          const cData = await catRes.json();
          setCategories(cData.categories || []);
          if (cData.categories?.length > 0) setCategoryId(cData.categories[0].id);
        }

        if (rateRes.ok) {
          const rData = await rateRes.json();
          setFxRates(rData.rates);
        }
      } catch (err: any) {
        setError('İlk veriler yüklenirken hata oluştu.');
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Toplam Tutar Matematiksel Hesaplama
  const qtyNum = Math.max(parseInt(quantity) || 1, 1);
  const unitPriceNum = Number(unitPriceTL) || 0;
  const totalPriceNum = qtyNum * unitPriceNum;

  const usdRate = fxRates?.usdRate || 0;
  const eurRate = fxRates?.eurRate || 0;

  const usdPaidNum = Number(usdPaid) || 0;
  const eurPaidNum = Number(eurPaid) || 0;
  const usdTLEquivalent = usdPaidNum * usdRate;
  const eurTLEquivalent = eurPaidNum * eurRate;

  const cashNum = Number(cashPaidTL) || 0;
  const cardNum = Number(cardPaidTL) || 0;
  const bankTransferNum = Number(bankTransferPaidTL) || 0;
  const creditNum = Number(creditPaidTL) || 0;

  const totalPaymentsEntered = cashNum + cardNum + bankTransferNum + usdTLEquivalent + eurTLEquivalent + creditNum;
  const paymentDiff = totalPriceNum - totalPaymentsEntered;

  // Hızlı Ödeme Yöntemi Seçimi
  const handleQuickPaymentFill = (type: 'cash' | 'card' | 'bank_transfer' | 'usd' | 'eur' | 'credit') => {
    setCashPaidTL('');
    setCardPaidTL('');
    setBankTransferPaidTL('');
    setBankTransferReference('');
    setUsdPaid('');
    setEurPaid('');
    setCreditPaidTL('');

    if (type === 'cash') setCashPaidTL(totalPriceNum.toString());
    if (type === 'card') setCardPaidTL(totalPriceNum.toString());
    if (type === 'bank_transfer') setBankTransferPaidTL(totalPriceNum.toString());
    if (type === 'usd' && usdRate > 0) setUsdPaid((totalPriceNum / usdRate).toFixed(2));
    if (type === 'eur' && eurRate > 0) setEurPaid((totalPriceNum / eurRate).toFixed(2));
    if (type === 'credit') {
      setCreditPaidTL(totalPriceNum.toString());
      setShowCustomerModal(true);
    }
  };

  // Cari Müşteri Arama
  const handleSearchCustomers = async (q: string) => {
    setCreditCustomerSearch(q);
    try {
      setSearchingCustomers(true);
      const res = await fetch(`/api/kasa/credit-customers?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setCreditCustomers(data.customers || []);
      }
    } catch {
      // Hata yok
    } finally {
      setSearchingCustomers(false);
    }
  };

  const handleSelectCustomer = (customer: KasaCreditCustomer) => {
    if (!customer.is_approved) {
      alert('Bu müşterinin cari hesabı onaylı değildir veya limiti sıfırdır. Cari satış yapılamaz!');
      return;
    }
    setSelectedCreditCustomer(customer);
    setCustomerName(customer.full_name);
    setShowCustomerModal(false);
  };

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (totalPriceNum <= 0) {
      return setError('Lütfen geçerli bir ürün birim fiyatı girin.');
    }

    if (Math.abs(paymentDiff) > 0.05) {
      return setError(`Girilen ödemeler toplamı (${totalPaymentsEntered.toFixed(2)} TL), satış toplamından (${totalPriceNum.toFixed(2)} TL) farklıdır. Fark: ${paymentDiff.toFixed(2)} TL`);
    }

    const trimmedCustomerName = customerName.trim();
    if (isTechnicalService) {
      if (!trimmedCustomerName || trimmedCustomerName.length < 2 || trimmedCustomerName.length > 120) {
        return setError('Teknik servis işlemlerinde müşteri adı soyadı zorunludur.');
      }
    }

    if (creditNum > 0) {
      if (!selectedCreditCustomer) {
        return setError('Cari / Veresiye ödemeli satışlarda bir cari müşteri seçilmesi zorunludur.');
      }
      if (creditNum > selectedCreditCustomer.available_limit_tl + 0.05) {
        return setError(`Müşterinin kullanılabilir cari limiti (${selectedCreditCustomer.available_limit_tl.toFixed(2)} TL), veresiye tutarından (${creditNum.toFixed(2)} TL) yetersizdir!`);
      }
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/kasa/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          product_name: productName.trim(),
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          product_code: productCode.trim() || undefined,
          quantity: qtyNum,
          unit_price_tl: unitPriceNum,
          cost_price_tl: isTechnicalService ? undefined : (costPriceTL ? Number(costPriceTL) : undefined),
          service_cost_tl: isTechnicalService ? (costPriceTL ? Number(costPriceTL) : undefined) : undefined,
          service_cost_payment_status: isTechnicalService ? serviceCostPaymentStatus : undefined,
          cash_paid_tl: cashNum,
          card_paid_tl: cardNum,
          bank_transfer_paid_tl: bankTransferNum,
          bank_transfer_reference: bankTransferReference.trim() || undefined,
          usd_paid: usdPaidNum > 0 ? usdPaidNum : undefined,
          eur_paid: eurPaidNum > 0 ? eurPaidNum : undefined,
          credit_paid_tl: creditNum > 0 ? creditNum : undefined,
          credit_customer_id: creditNum > 0 ? selectedCreditCustomer?.id : undefined,
          customer_name: trimmedCustomerName || undefined,
          customer_phone: customerPhone.trim() || undefined,
          serial_imei: serialImei.trim() || undefined,
          description: description.trim() || undefined,
          idempotency_key: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış kaydı gerçekleştirilemedi.');

      setSuccess(`Satış Kaydı Oluşturuldu! Fiş No: ${data.sale.receipt_no}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      // Formu Temizle
      setProductName('');
      setBrand('');
      setModel('');
      setProductCode('');
      setQuantity('1');
      setUnitPriceTL('');
      setCostPriceTL('');
      setDescription('');
      setCustomerName('');
      setCustomerPhone('');
      setSerialImei('');
      setCashPaidTL('');
      setCardPaidTL('');
      setBankTransferPaidTL('');
      setBankTransferReference('');
      setUsdPaid('');
      setEurPaid('');
      setCreditPaidTL('');
      setSelectedCreditCustomer(null);
    } catch (err: any) {
      setError(err.message || 'Satış tamamlanamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ShoppingBag className="text-blue-600" size={26} /> Hızlı Satış Fişi Girişi
          </h1>
          <p className="text-xs text-slate-500">Nakit, Kart, USD, EUR ve Cari / Veresiye Satış Kaydı</p>
        </div>
        <Link
          href="/kasa"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition shadow-sm"
        >
          <ArrowLeft size={18} /> Kasa Föyüne Dön
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl flex items-center gap-2">
          <AlertTriangle size={18} className="shrink-0 text-red-600" /> {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-extrabold rounded-2xl flex items-center gap-2">
          <CheckCircle size={18} className="shrink-0 text-emerald-600" /> {success}
        </div>
      )}

      <form onSubmit={handleSubmitSale} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        
        {/* ÜRÜN BİLGİLERİ */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2">1. Ürün ve Kategori Bilgisi</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Gelir Kategorisi *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Ürün / Hizmet Adı *</label>
              <input
                type="text"
                required
                placeholder="Örn: iPhone 13 Pro Kılıf"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Adet *</label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Birim Satış Fiyatı (TL) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={unitPriceTL}
                onChange={(e) => setUnitPriceTL(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                {isTechnicalService ? 'Teknik Servis Doğrudan Maliyeti (TL)' : 'Birim Alış Maliyeti (TL)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={isTechnicalService ? '0.00 (Maliyet yoksa 0 girin)' : 'Opsiyonel'}
                value={costPriceTL}
                onChange={(e) => setCostPriceTL(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
              />
              {isTechnicalService && (
                <p className="text-[10px] text-slate-500 mt-1">Parça, dış servis, teknisyen veya bu iş için doğrudan oluşan maliyet.</p>
              )}
            </div>

            {isTechnicalService && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-extrabold uppercase text-purple-900 mb-1">
                  Maliyet Nasıl Karşılandı? *
                </label>
                <select
                  required
                  value={serviceCostPaymentStatus}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'no_cost') {
                      setCostPriceTL('0');
                      setServiceCostPaymentStatus('previously_paid_or_stock');
                    } else {
                      setServiceCostPaymentStatus(val as any);
                    }
                  }}
                  className="w-full p-3 bg-purple-50 border border-purple-300 rounded-xl text-xs font-bold text-purple-950 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="paid_from_cash">Şimdi TL kasadan ödendi (Kasadan nakit düşer)</option>
                  <option value="previously_paid_or_stock">Önceden ödendi / stoktan kullanıldı (Bugünkü kasayı etkilemez)</option>
                  <option value="unpaid">Henüz ödenmedi (Ödenmemiş Maliyet Borcu)</option>
                  <option value="no_cost">Bu işlemde maliyet yok (0 TL Maliyet)</option>
                </select>
              </div>
            )}

            <div className="p-3 bg-slate-900 text-white rounded-xl flex flex-col justify-center items-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">Satış Toplamı</span>
              <span className="text-lg font-black text-emerald-400">{totalPriceNum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
            </div>
          </div>
        </div>

        {/* ÖDEME YÖNTEMİ SEÇİMİ VE CARİ ÖDEME */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">2. Ödeme Yöntemi Dağılımı</h2>
            <div className="flex gap-1.5 flex-wrap">
              <button type="button" onClick={() => handleQuickPaymentFill('cash')} className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg hover:bg-emerald-200">
                Tamamı Nakit
              </button>
              <button type="button" onClick={() => handleQuickPaymentFill('card')} className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-lg hover:bg-blue-200">
                Tamamı Kart
              </button>
              <button type="button" onClick={() => handleQuickPaymentFill('bank_transfer')} className="px-2.5 py-1 bg-purple-100 text-purple-900 text-[11px] font-bold rounded-lg hover:bg-purple-200">
                Tamamı Havale/EFT
              </button>
              <button type="button" onClick={() => handleQuickPaymentFill('credit')} className="px-2.5 py-1 bg-amber-100 text-amber-900 text-[11px] font-bold rounded-lg hover:bg-amber-200">
                Tamamı Cari / Veresiye
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <label className="block text-xs font-bold uppercase text-slate-700">Nakit TL</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cashPaidTL}
                onChange={(e) => setCashPaidTL(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-sm"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <label className="block text-xs font-bold uppercase text-slate-700">Kredi Kartı TL</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cardPaidTL}
                onChange={(e) => setCardPaidTL(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-sm"
              />
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
              <label className="block text-xs font-extrabold text-purple-950 uppercase">Havale / EFT TL</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={bankTransferPaidTL}
                onChange={(e) => setBankTransferPaidTL(e.target.value)}
                className="w-full p-2.5 bg-white border border-purple-300 rounded-lg font-bold text-sm text-purple-900"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-extrabold text-amber-950 uppercase">Cari / Veresiye TL</label>
                <button
                  type="button"
                  onClick={() => {
                    handleSearchCustomers('');
                    setShowCustomerModal(true);
                  }}
                  className="text-[10px] font-bold text-blue-700 underline"
                >
                  {selectedCreditCustomer ? 'Değiştir' : 'Müşteri Seç'}
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={creditPaidTL}
                onChange={(e) => setCreditPaidTL(e.target.value)}
                className="w-full p-2.5 bg-white border border-amber-300 rounded-lg font-extrabold text-sm text-amber-900"
              />
              {selectedCreditCustomer && (
                <div className="text-[11px] text-amber-900 font-semibold flex items-center justify-between pt-1">
                  <span className="truncate max-w-[140px]">👤 {selectedCreditCustomer.full_name}</span>
                  <span className="text-[10px] bg-amber-200 px-1.5 py-0.5 rounded">Limit: {selectedCreditCustomer.available_limit_tl.toFixed(0)} TL</span>
                </div>
              )}
            </div>
          </div>

          {Number(bankTransferPaidTL) > 0 && (
            <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-1">
              <label className="block text-xs font-bold uppercase text-purple-900">Havale / EFT Referansı (Opsiyonel)</label>
              <input
                type="text"
                maxLength={200}
                placeholder="Örn: Garanti Bankası - Dekont No: 12345 / Ahmet Yılmaz"
                value={bankTransferReference}
                onChange={(e) => setBankTransferReference(e.target.value)}
                className="w-full p-2.5 bg-white border border-purple-200 rounded-lg text-xs font-medium"
              />
            </div>
          )}

          {/* DÖVİZ SEÇENEKLERİ (USD & EUR) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
              <div className="flex justify-between text-xs font-bold text-blue-900">
                <span>USD Nakit ($)</span>
                <span>1 USD = {usdRate.toFixed(2)} TL</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={usdPaid}
                onChange={(e) => setUsdPaid(e.target.value)}
                className="w-full p-2 bg-white border border-blue-300 rounded-lg font-bold text-sm"
              />
              {usdPaidNum > 0 && (
                <div className="text-[11px] text-blue-700 font-bold">
                  TL Karşılığı: {usdTLEquivalent.toFixed(2)} TL
                </div>
              )}
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
              <div className="flex justify-between text-xs font-bold text-indigo-900">
                <span>EUR Nakit (€)</span>
                <span>1 EUR = {eurRate.toFixed(2)} TL</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={eurPaid}
                onChange={(e) => setEurPaid(e.target.value)}
                className="w-full p-2 bg-white border border-indigo-300 rounded-lg font-bold text-sm"
              />
              {eurPaidNum > 0 && (
                <div className="text-[11px] text-indigo-700 font-bold">
                  TL Karşılığı: {eurTLEquivalent.toFixed(2)} TL
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MÜŞTERİ BİLGİLERİ & DETAYLAR */}
        <div className="space-y-4 pt-2">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b pb-2 flex items-center justify-between">
            <span>3. MÜŞTERİ & CİHAZ BİLGİLERİ</span>
            {isTechnicalService && (
              <span className="text-[11px] text-amber-800 font-bold bg-amber-100 px-2.5 py-0.5 rounded border border-amber-300">
                * Teknik Serviste Müşteri Adı Soyadı Zorunludur
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Müşteri Adı Soyadı {isTechnicalService ? <span className="text-red-500 font-extrabold">*</span> : <span className="text-slate-400 font-normal">(Opsiyonel)</span>}
              </label>
              <input
                type="text"
                required={isTechnicalService}
                minLength={isTechnicalService ? 2 : undefined}
                maxLength={120}
                placeholder={isTechnicalService ? "Müşteri Adı Soyadı * (Zorunlu)" : "Müşteri Adı Soyadı (Opsiyonel)"}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={`w-full p-3 bg-slate-50 border rounded-xl text-sm ${
                  isTechnicalService && !customerName.trim()
                    ? 'border-amber-400 focus:border-amber-600 focus:ring-1 focus:ring-amber-200'
                    : 'border-slate-200 focus:border-blue-500'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                IMEI / Seri No
              </label>
              <input
                type="text"
                placeholder="IMEI / Seri No"
                value={serialImei}
                onChange={(e) => setSerialImei(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Satış Notu / Açıklama
              </label>
              <input
                type="text"
                placeholder="Satış Notu / Açıklama"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-base shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CheckCircle size={20} /> {submitting ? 'Satış Kaydediliyor...' : 'Satış Kaydını Tamamla'}
        </button>

      </form>

      {/* CARİ MÜŞTERİ SEÇİM MODALI */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
                <UserCheck className="text-amber-600" size={22} /> Cari Müşteri Seçimi
              </h3>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="text"
                autoFocus
                placeholder="İsim veya Telefon No Arayın..."
                value={creditCustomerSearch}
                onChange={(e) => handleSearchCustomers(e.target.value)}
                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchingCustomers ? (
                <div className="p-4 text-center text-xs text-slate-500 font-medium">Aranıyor...</div>
              ) : creditCustomers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">Müşteri bulunamadı veya arama yapın.</div>
              ) : (
                creditCustomers.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className={`w-full p-3 text-left rounded-xl border flex items-center justify-between transition-all ${
                      c.is_approved
                        ? 'bg-slate-50 border-slate-200 hover:border-amber-400 hover:bg-amber-50'
                        : 'bg-red-50 border-red-200 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900">{c.full_name}</div>
                      <div className="text-xs text-slate-500">{c.phone}</div>
                    </div>
                    <div className="text-right">
                      {c.is_approved ? (
                        <>
                          <div className="text-xs font-black text-amber-900">Kullanılabilir: {c.available_limit_tl.toFixed(0)} TL</div>
                          <div className="text-[10px] text-slate-500">Limit: {c.credit_limit_tl.toFixed(0)} TL</div>
                        </>
                      ) : (
                        <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                          Onaylı Limit Yok
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
