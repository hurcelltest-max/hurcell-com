'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, CheckCircle2, ShieldAlert, FileText } from 'lucide-react';

function ReturnRequestFormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [emailOrPhoneInput, setEmailOrPhoneInput] = useState('');
  
  const [isValidated, setIsValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Pre-fetched details from order
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [hasCampaignWarning, setHasCampaignWarning] = useState(false);

  // Form Fields
  const [requestType, setRequestType] = useState<'cancel' | 'return' | 'exchange'>('return');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [kvkkApproved, setKvkkApproved] = useState(false);
  const [successResponse, setSuccessResponse] = useState<{ request_id: string; message: string } | null>(null);

  const orderParam = searchParams.get('order') || searchParams.get('orderNumber');

  useEffect(() => {
    if (orderParam) {
      setOrderNumberInput(orderParam);
    }
  }, [orderParam]);

  const validateOrder = async (orderNum: string, emailOrPhoneVal: string) => {
    if (!orderNum.trim() || !emailOrPhoneVal.trim()) {
      setErrorMsg('Sipariş numarası ve iletişim bilgisi (e-posta veya telefon) gereklidir.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/checkout/get-order?order_number=${orderNum.trim()}&emailOrPhone=${encodeURIComponent(emailOrPhoneVal.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Sipariş doğrulanamadı.');
      }

      setCustomerName(data.order.customer_name);
      setCustomerEmail(data.order.customer_email);
      setCustomerPhone(data.order.customer_phone);
      setHasCampaignWarning(data.hasCampaignBenefitWarning || false);
      setIsValidated(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Sipariş sorgulanırken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualValidate = (e: React.FormEvent) => {
    e.preventDefault();
    validateOrder(orderNumberInput, emailOrPhoneInput);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kvkkApproved) {
      alert('KVKK ve İade Koşulları onaylanmalıdır.');
      return;
    }
    if (!reason.trim()) {
      alert('Lütfen iade/iptal nedenini belirtin.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        order_number: orderNumberInput.trim(),
        lookup_token: 'deprecated', // Token is deprecated on client side
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        request_type: requestType,
        reason: reason.trim(),
        description: description.trim() || null,
        kvkk_approved: kvkkApproved
      };

      const res = await fetch('/api/returns/create-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Talep oluşturulamadı.');
      }

      setSuccessResponse({
        request_id: data.request_id,
        message: data.message
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Talep gönderilirken sunucu hatası oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successResponse) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6 text-center max-w-lg mx-auto">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto animate-bounce" />
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Talebiniz Alındı</h2>
          <p className="text-xs text-slate-400 font-mono">Talep Numarası: {successResponse.request_id}</p>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed font-light">
          {successResponse.message}
        </p>
        <div className="pt-4 flex justify-center gap-3">
          <Link
            href="/shop"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-semibold transition-colors shadow-sm"
          >
            Alışverişe Devam Et
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Navigation header */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 hover:text-slate-800 transition-colors uppercase group"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Geri Dön
        </button>
      </div>

      {!isValidated ? (
        /* Order authentication box */
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 max-w-md mx-auto">
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">İade / İptal Portalı</h1>
            <p className="text-xs text-slate-400 font-light">
              Talebinizi oluşturmak için sipariş doğrulama bilgilerini giriniz.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-55 text-rose-800 border border-rose-100 rounded-2xl p-4 text-xs font-semibold flex items-start gap-2.5">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleManualValidate} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Sipariş Numarası</label>
              <input
                type="text"
                placeholder="Örn: HRC-2026-000001"
                value={orderNumberInput}
                onChange={(e) => setOrderNumberInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">E-Posta veya Telefon Numarası</label>
              <input
                type="text"
                placeholder="Siparişte kullandığınız E-Posta veya Telefon..."
                value={emailOrPhoneInput}
                onChange={(e) => setEmailOrPhoneInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Sorgulanıyor...' : 'Siparişi Sorgula'}
            </button>
          </form>
        </div>
      ) : (
        /* Actual Request Form */
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6 max-w-lg mx-auto">
          <div className="border-b border-slate-100 pb-5 space-y-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Doğrulandı · {orderNumberInput}</span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Talebinizi Hazırlayın</h1>
            <p className="text-xs text-slate-450 font-light">
              Müşteri: <strong className="font-bold text-slate-700">{customerName}</strong> ({customerEmail})
            </p>
          </div>

          <div className="bg-amber-50/70 border border-amber-105/80 rounded-2xl p-4 text-[11px] text-amber-800 space-y-1.5 leading-relaxed font-medium">
            <p className="font-bold flex items-center gap-1 text-xs">
              <ShieldAlert size={14} className="text-amber-600" />
              Önemli Bilgilendirme
            </p>
            <ul className="list-disc pl-4 space-y-1 font-light text-slate-600">
              <li>Talep oluşturmak, kartınıza veya hesabınıza **otomatik/anlık para iadesi** yapıldığı anlamına gelmez.</li>
              <li>İlettiğiniz talep mağaza yetkililerimiz tarafından detaylıca incelenir.</li>
              <li>Talebin onaylanması halinde; iade/iptal süreci ödeme kuruluşu ve mağaza prosedürlerine göre yasal süreler içerisinde tamamlanır.</li>
              <li>Talep oluşturulduğunda sistemdeki ürün stoğu ve ödeme durumu otomatik olarak değişmemektedir.</li>
            </ul>
          </div>

          {hasCampaignWarning && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 text-[11px] text-blue-800 space-y-1.5 leading-relaxed font-medium mt-4">
              <p className="font-bold flex items-center gap-1 text-xs">
                <ShieldAlert size={14} className="text-blue-600" />
                Kampanyalı Ürün İadesi
              </p>
              <p className="font-light text-slate-700">
                Siparişinizde kampanyalı olarak satın alınmış bir ürün bulunmaktadır. İade talebinizde, kampanya kapsamında size sağlanan hediye, ek ürün veya avantajın da iade paketine eklenmesi gerekmektedir. Aksi takdirde kampanya faydasının bedeli iade tutarından düşülebilir.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-55 text-rose-800 border border-rose-100 rounded-2xl p-4 text-xs font-semibold flex items-start gap-2.5">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="space-y-5 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Talep Tipi</label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="return">İade Talebi</option>
                <option value="cancel">İptal Talebi</option>
                <option value="exchange">Değişim Talebi</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">İptal / İade Nedeni</label>
              <input
                type="text"
                placeholder="Örn: Kusurlu ürün, yanlış numara, fikrimi değiştirdim"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Detaylı Açıklama (Opsiyonel)</label>
              <textarea
                placeholder="Talebinize ilişkin belirtmek istediğiniz diğer detaylar..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all leading-relaxed"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-2.5">
                <input
                  id="kvkk-approval"
                  type="checkbox"
                  checked={kvkkApproved}
                  onChange={(e) => setKvkkApproved(e.target.checked)}
                  className="rounded border-slate-200 text-blue-600 focus:ring-blue-500/20 cursor-pointer h-4 w-4 shrink-0 mt-0.5"
                  required
                />
                <label htmlFor="kvkk-approval" className="text-slate-550 leading-relaxed font-light select-none cursor-pointer">
                  Kişisel verilerimin işlenmesini, <Link href="/privacy" target="_blank" className="text-blue-600 font-bold hover:underline">Gizlilik Politikası</Link>'nı ve <Link href="/iptal-iade-kosullari" target="_blank" className="text-blue-600 font-bold hover:underline">İptal ve İade Koşulları</Link>'nı kabul ediyorum.
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm font-semibold disabled:opacity-60"
            >
              <Send size={14} />
              {submitting ? 'Gönderiliyor...' : 'Talebi Gönder'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ReturnRequestPage() {
  useEffect(() => {
    document.title = 'İade / İptal Talebi | HurCELL Teknoloji Mağazası'
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-855 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full py-6 space-y-6 flex-1">
        <Suspense fallback={
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-sm text-slate-500 font-light">İade portalı yükleniyor...</p>
            </div>
          </div>
        }>
          <ReturnRequestFormContent />
        </Suspense>
      </div>
    </div>
  );
}
