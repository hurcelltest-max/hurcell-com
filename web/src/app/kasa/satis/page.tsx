'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Wrench,
  Globe,
  Coins,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

export default function FastPOSPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [categoryId, setCategoryId] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPriceTL, setUnitPriceTL] = useState('');
  const [costPriceTL, setCostPriceTL] = useState('');
  const [serviceCostTL, setServiceCostTL] = useState('');

  // Ödeme Türleri State (Nakit TL, Kart TL, USD Nakit, EUR Nakit)
  const [cashPaidTL, setCashPaidTL] = useState('');
  const [cardPaidTL, setCardPaidTL] = useState('');
  const [usdPaid, setUsdPaid] = useState('');
  const [eurPaid, setEurPaid] = useState('');

  // Döviz Kurları (TCMB)
  const [usdRate, setUsdRate] = useState<number>(40.00);
  const [eurRate, setEurRate] = useState<number>(45.00);
  const [fxSource, setFxSource] = useState<string>('TCMB Efektif Alış');

  // Müşteri & Cihaz Bilgileri
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serialImei, setSerialImei] = useState('');
  const [description, setDescription] = useState('');

  // Teknik Servis Özel Alanları
  const [deviceType, setDeviceType] = useState('');
  const [serviceActionTaken, setServiceActionTaken] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function initData() {
      try {
        setLoading(true);
        const res = await fetch('/api/kasa/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
          if (data.categories?.length > 0) {
            setCategoryId(data.categories[0].id);
          }
        }

        const ratesRes = await fetch('/api/kasa/rates');
        if (ratesRes.ok) {
          const rData = await ratesRes.json();
          if (rData.rates) {
            setUsdRate(rData.rates.usdRate);
            setEurRate(rData.rates.eurRate);
            setFxSource(rData.rates.source);
          }
        }
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  const selectedCategoryObj = categories.find((c) => c.id === categoryId);
  const isTechnicalService = selectedCategoryObj?.name === 'Teknik Servis';

  // Hesaplamalar
  const totalTL = Math.round((Number(unitPriceTL) || 0) * (Number(quantity) || 1) * 100) / 100;
  const cashNum = Number(cashPaidTL) || 0;
  const cardNum = Number(cardPaidTL) || 0;
  const usdNum = Number(usdPaid) || 0;
  const eurNum = Number(eurPaid) || 0;

  const usdTLEquivalent = Math.round(usdNum * usdRate * 100) / 100;
  const eurTLEquivalent = Math.round(eurNum * eurRate * 100) / 100;

  const paidTotalTL = Math.round((cashNum + cardNum + usdTLEquivalent + eurTLEquivalent) * 100) / 100;
  const isPaymentMathValid = Math.abs(paidTotalTL - totalTL) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!productName.trim()) return setFormError('Lütfen ürün / işlem adını girin.');
    if (!totalTL || totalTL <= 0) return setFormError('Lütfen geçerli bir birim fiyat girin.');
    if (!isPaymentMathValid) {
      return setFormError(
        `Ödeme toplamı (${paidTotalTL.toLocaleString('tr-TR')} TL), satış tutarına (${totalTL.toLocaleString('tr-TR')} TL) eşit değil.`
      );
    }

    try {
      setSubmitting(true);

      const payload: any = {
        category_id: categoryId,
        product_name: productName.trim(),
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        quantity: Number(quantity),
        unit_price_tl: Number(unitPriceTL),
        cash_paid_tl: cashNum,
        card_paid_tl: cardNum,
        usd_paid: usdNum,
        usd_rate: usdNum > 0 ? usdRate : undefined,
        eur_paid: eurNum,
        eur_rate: eurNum > 0 ? eurRate : undefined,
        description: description.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        serial_imei: serialImei.trim() || undefined,
        cost_price_tl: costPriceTL ? Number(costPriceTL) : undefined,
        idempotency_key: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      };

      if (isTechnicalService) {
        payload.service_cost_tl = serviceCostTL ? Number(serviceCostTL) : undefined;
        payload.technical_service_details = {
          device_type: deviceType.trim() || undefined,
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          action_taken: serviceActionTaken.trim() || undefined,
          service_cost_kurus: serviceCostTL ? Math.round(Number(serviceCostTL) * 100) : undefined,
        };
      }

      const res = await fetch('/api/kasa/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Satış kaydı gerçekleştirilemedi.');

      setFormSuccess(`Satış Başarıyla Oluşturuldu! Fiş No: ${data.sale.receipt_no}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      setTimeout(() => {
        setProductName('');
        setBrand('');
        setModel('');
        setUnitPriceTL('');
        setCostPriceTL('');
        setServiceCostTL('');
        setCashPaidTL('');
        setCardPaidTL('');
        setUsdPaid('');
        setEurPaid('');
        setDescription('');
        setCustomerName('');
        setCustomerPhone('');
        setSerialImei('');
        setDeviceType('');
        setServiceActionTaken('');
        setFormSuccess(null);
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Satış oluşturulurken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFullCash = () => {
    setCashPaidTL(totalTL.toString());
    setCardPaidTL('0');
    setUsdPaid('0');
    setEurPaid('0');
  };

  const handleFullCard = () => {
    setCashPaidTL('0');
    setCardPaidTL(totalTL.toString());
    setUsdPaid('0');
    setEurPaid('0');
  };

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Satış ekranı yükleniyor...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/kasa')}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="text-blue-600" size={26} /> Hızlı Satış & Tahsilat Girişi
            </h1>
            <p className="text-xs text-slate-500">Nakit, Kredi Kartı, USD ($) ve EUR (€) Karma Ödeme Girişi</p>
          </div>
        </div>

        {/* Kur Göstergesi */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 border border-slate-200">
          <Globe size={14} className="text-blue-600" />
          <span>TCMB: <strong>1$ = {usdRate.toFixed(2)} TL</strong> | <strong>1€ = {eurRate.toFixed(2)} TL</strong></span>
        </div>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle size={20} className="shrink-0 text-red-600" />
          {formError}
        </div>
      )}

      {formSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-extrabold rounded-2xl flex items-center gap-2">
          <CheckCircle size={20} className="shrink-0 text-emerald-600" />
          {formSuccess}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        
        {/* KATEGORİ VE ÜRÜN BİLGİLERİ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Satış Kategorisi *</label>
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

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              {isTechnicalService ? 'İşlem / Yapılan Hizmet Adı *' : 'Ürün / Hizmet Adı *'}
            </label>
            <input
              type="text"
              required
              placeholder={isTechnicalService ? 'Örn: iPhone 13 Ekran Değişimi' : 'Örn: Samsung A54 Kılıf'}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
            />
          </div>
        </div>

        {/* TEKNİK SERVİS ÖZEL ALANLARI */}
        {isTechnicalService && (
          <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <Wrench size={18} className="text-blue-600" /> Teknik Servis Detayları
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-blue-800 mb-1">Cihaz Türü</label>
                <input
                  type="text"
                  placeholder="Örn: Telefon / Tablet"
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-blue-800 mb-1">Marka / Model</label>
                <input
                  type="text"
                  placeholder="Örn: Apple iPhone 11"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-blue-800 mb-1">Yedek Parça / Parça Maliyeti (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Örn: 850.00"
                  value={serviceCostTL}
                  onChange={(e) => setServiceCostTL(e.target.value)}
                  className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* ADET, BİRİM FİYAT VE MALİYET */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Satış Adedi *</label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Satış Birim Fiyatı (TL) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={unitPriceTL}
              onChange={(e) => setUnitPriceTL(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-extrabold text-slate-900"
            />
          </div>

          {!isTechnicalService && (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Ürün Alış / Maliyet Fiyatı (TL)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Örn: 150.00 (Boş kalırsa uyarı verir)"
                value={costPriceTL}
                onChange={(e) => setCostPriceTL(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
              />
            </div>
          )}
        </div>

        {/* HESAPLANAN TOPLAM TUTAR BÖLÜMÜ */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-slate-400">Toplam Satış Tutarı:</span>
          <span className="text-2xl font-black text-emerald-400">
            {totalTL.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
          </span>
        </div>

        {/* ÖDEME TÜRLERİ VE KARMA TAHSİLAT (TL, USD, EUR) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase text-slate-700">
              Tahsilat / Ödeme Yöntemi Dağılımı *
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFullCash}
                className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-200"
              >
                Tümü Nakit TL
              </button>
              <button
                type="button"
                onClick={handleFullCard}
                className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg hover:bg-blue-200"
              >
                Tümü Kredi Kartı
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Nakit TL</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cashPaidTL}
                onChange={(e) => setCashPaidTL(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Kredi Kartı TL</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cardPaidTL}
                onChange={(e) => setCardPaidTL(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-blue-700 mb-1 flex items-center justify-between">
                <span>USD Nakit ($)</span>
                <span className="text-[10px] text-slate-400">({usdRate.toFixed(2)} TL)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00 $"
                value={usdPaid}
                onChange={(e) => setUsdPaid(e.target.value)}
                className="w-full p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl text-sm font-extrabold text-blue-900"
              />
              {usdTLEquivalent > 0 && (
                <span className="text-[10px] text-blue-700 font-bold block mt-0.5">
                  = {usdTLEquivalent.toLocaleString('tr-TR')} TL
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-700 mb-1 flex items-center justify-between">
                <span>EUR Nakit (€)</span>
                <span className="text-[10px] text-slate-400">({eurRate.toFixed(2)} TL)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00 €"
                value={eurPaid}
                onChange={(e) => setEurPaid(e.target.value)}
                className="w-full p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl text-sm font-extrabold text-indigo-900"
              />
              {eurTLEquivalent > 0 && (
                <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">
                  = {eurTLEquivalent.toLocaleString('tr-TR')} TL
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 text-xs font-semibold">
            <span>Girilen Toplam Tahsilat:</span>
            <span className={isPaymentMathValid ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold animate-pulse'}>
              {paidTotalTL.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
              {!isPaymentMathValid && ` (Fark: ${(totalTL - paidTotalTL).toLocaleString('tr-TR')} TL)`}
            </span>
          </div>
        </div>

        {/* MÜŞTERİ BİLGİLERİ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Müşteri Ad Soyad (Opsiyonel)</label>
            <input
              type="text"
              placeholder="Müşteri Adı"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Müşteri Telefon (Opsiyonel)</label>
            <input
              type="tel"
              placeholder="05xx xxx xx xx"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Seri No / IMEI (Opsiyonel)</label>
            <input
              type="text"
              placeholder="IMEI / Cihaz Seri No"
              value={serialImei}
              onChange={(e) => setSerialImei(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* BUTONLAR */}
        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => router.push('/kasa')}
            className="w-1/3 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
          >
            {submitting ? 'Kaydediliyor...' : 'Satışı Tamamla ve Kasaya İşle'}
          </button>
        </div>

      </form>
    </div>
  );
}
