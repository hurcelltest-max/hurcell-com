'use client'

import React, { useState } from 'react'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function AgreementOtpForm() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)

  // Checkboxes
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [paymentTermsAccepted, setPaymentTermsAccepted] = useState(false)
  const [kvkkAccepted, setKvkkAccepted] = useState(false)
  const [marketingSms, setMarketingSms] = useState(false)
  const [marketingWhatsapp, setMarketingWhatsapp] = useState(false)

  const attributionPromiseRef = React.useRef<Promise<void> | null>(null)

  const ensureAttribution = () => {
    if (attributionPromiseRef.current) return attributionPromiseRef.current;

    const promise = new Promise<void>((resolve) => {
      try {
        const params = new URLSearchParams(window.location.search);
        const payload = {
          utm_source: params.get('utm_source'),
          utm_medium: params.get('utm_medium'),
          utm_campaign: params.get('utm_campaign'),
          utm_content: params.get('utm_content'),
          campaign_code: params.get('campaign_code'),
          referrer: document.referrer,
          landing_path: window.location.pathname
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        fetch('/api/attribution/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
          signal: controller.signal
        }).then(() => {
          clearTimeout(timeoutId);
          resolve();
        }).catch(() => {
          clearTimeout(timeoutId);
          resolve();
        });
      } catch {
        resolve();
      }
    });

    attributionPromiseRef.current = promise;
    return promise;
  };

  React.useEffect(() => {
    ensureAttribution();
  }, [])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsCompleted(false)

    // Basic validation
    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^5\d{9}$/.test(cleanPhone)) {
      setError('Lütfen telefon numaranızı başında 0 olmadan 5XXXXXXXXX formatında giriniz.')
      return
    }

    setLoading(true)
    await ensureAttribution()
    try {
      const res = await fetch('/api/cari/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Doğrulama kodu gönderilemedi.')
      }

      setSuccess('Doğrulama kodu telefonunuza gönderildi.')
      setStep(2)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!code || code.length !== 6) {
      setError('Lütfen 6 haneli doğrulama kodunu giriniz.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/cari/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
          code
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Doğrulama başarısız.')
      }

      setVerificationToken(data.verificationToken)
      setSuccess('Telefon numaranız başarıyla doğrulandı. Lütfen başvuru bilgilerinizi giriniz.')
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptAgreement = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!verificationToken) {
      setError('Doğrulama eksik. Lütfen sayfayı yenileyip tekrar deneyin.')
      return
    }

    if (!firstName || !lastName || firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError('Lütfen adınızı ve soyadınızı en az 2 karakter olacak şekilde giriniz.')
      return
    }

    if (!termsAccepted || !paymentTermsAccepted || !kvkkAccepted) {
      setError('Lütfen zorunlu tüm şartları onaylayınız.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/cari/accept-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
          verificationToken,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          checkbox_terms_accepted: termsAccepted,
          checkbox_payment_terms_accepted: paymentTermsAccepted,
          checkbox_kvkk_notice_read: kvkkAccepted,
          marketing_sms_consent: marketingSms,
          marketing_whatsapp_consent: marketingWhatsapp
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Sözleşme onayı kaydedilemedi.')
      }

      setStep(1) // Hide form
      setIsCompleted(true)

      if (data.existingCustomer) {
        setSuccess('Bu telefon numarasıyla daha önce bir cari / limitli alışveriş kaydı oluşturulmuş. Yeni başvuru açılmadı. Limit veya cari işlem talepleriniz için HurCELL ile iletişime geçebilirsiniz.')
      } else {
        setSuccess('Sözleşme onayınız ve limitli alışveriş başvurunuz başarıyla alınmıştır. Başvurunuz HurCELL tarafından incelendikten sonra uygun görülürse limit tanımlanacaktır.')
      }

      // Reset form
      setPhone('')
      setCode('')
      setVerificationToken('')
      setFirstName('')
      setLastName('')
      setTermsAccepted(false)
      setPaymentTermsAccepted(false)
      setKvkkAccepted(false)
      setMarketingSms(false)
      setMarketingWhatsapp(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const isStep2Completed = step === 3 && firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const isStep3Completed = isStep2Completed && termsAccepted && paymentTermsAccepted && kvkkAccepted;

  return (
    <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Telefon Doğrulama ve Başvuru Onayı</h3>

      {/* Süreç Göstergesi */}
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="flex items-center justify-between">
          {/* Adım 1: Telefon Doğrulama */}
          <div className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step === 3 || isCompleted
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 text-white'
            }`}>
              {step === 3 || isCompleted ? '✓' : '1'}
            </div>
            <span className={`text-[10px] sm:text-xs mt-2 font-semibold text-center ${step === 3 || isCompleted ? 'text-green-700' : 'text-blue-600'}`}>
              Telefon Doğrulama
            </span>
          </div>
          <div className={`h-0.5 flex-1 -mt-4 transition-colors ${step === 3 || isCompleted ? 'bg-green-200' : 'bg-gray-200'}`} />

          {/* Adım 2: Başvuru Bilgileri */}
          <div className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              isCompleted
                ? 'bg-green-100 text-green-700'
                : (step === 3
                    ? (isStep2Completed ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white')
                    : 'bg-gray-100 text-gray-400')
            }`}>
              {isCompleted || isStep2Completed ? '✓' : '2'}
            </div>
            <span className={`text-[10px] sm:text-xs mt-2 font-semibold text-center ${
              isCompleted
                ? 'text-green-700'
                : (step === 3
                    ? (isStep2Completed ? 'text-green-700' : 'text-blue-600')
                    : 'text-gray-400')
            }`}>
              Başvuru Bilgileri
            </span>
          </div>
          <div className={`h-0.5 flex-1 -mt-4 transition-colors ${isCompleted || isStep2Completed ? 'bg-green-200' : 'bg-gray-200'}`} />

          {/* Adım 3: Sözleşme Onayı */}
          <div className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              isCompleted || isStep3Completed
                ? 'bg-green-600 text-white'
                : (step === 3 && isStep2Completed ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400')
            }`}>
              {isCompleted || isStep3Completed ? '✓' : '3'}
            </div>
            <span className={`text-[10px] sm:text-xs mt-2 font-semibold text-center ${
              isCompleted || isStep3Completed
                ? 'text-green-700'
                : (step === 3 && isStep2Completed ? 'text-blue-600' : 'text-gray-400')
            }`}>
              Sözleşme Onayı
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg flex gap-3 text-red-700 items-start">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {success && step === 1 && !phone && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg flex gap-3 text-green-700 items-start">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      {(!success || phone) && step === 1 && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefon Numaranız
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">+90</span>
              </div>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-12 sm:text-sm border-gray-300 rounded-md py-3 border px-4 outline-none transition-colors"
                placeholder="5XXXXXXXXX"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Başında 0 olmadan 10 haneli olarak giriniz.
            </p>
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-blue-800 text-xs leading-normal">
              Bu SMS kodu yalnızca telefon numaranızı doğrular. Sözleşme onayı, sonraki adımda ad-soyad bilgileriniz ve ayrı onay kutuları ile tamamlanacaktır.
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !/^5\d{9}$/.test(phone)}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Doğrulama Kodu Gönder'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          {success && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md font-medium">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Doğrulama Kodu (SMS)
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-3 border px-4 outline-none text-center tracking-widest text-lg"
              placeholder="XXXXXX"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Doğrula'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep(1);
              setCode('');
              setError('');
              setSuccess('');
            }}
            disabled={loading}
            className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Telefon numarasını değiştir
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleAcceptAgreement} className="space-y-6">
          {success && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md font-medium">
              {success}
            </div>
          )}

          <div className="space-y-3">
            <div className="p-4 bg-blue-50 text-blue-800 text-sm rounded-lg mb-4 leading-normal">
              Ad ve soyad bilgilerinizi doğru girdiğinizi beyan edersiniz. Başvurunuz HurCELL tarafından incelendikten sonra sonuçlandırılır.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Doğrulanmış Telefon Numarası
              </label>
              <input
                type="text"
                readOnly
                value={`+90 ${phone}`}
                className="bg-gray-50 border border-gray-200 text-gray-500 focus:outline-none block w-full sm:text-sm rounded-md py-2 px-3 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adınız <span className="text-red-500">*</span></label>
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border outline-none" placeholder="Örn: Ali" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soyadınız <span className="text-red-500">*</span></label>
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border outline-none" placeholder="Örn: Yılmaz" />
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="terms" className="font-medium text-gray-700">
                  <a href="/limitli-alisveris-sozlesmesi#sozlesme-metni" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Sözleşme şartlarını</a> okudum ve kabul ediyorum. <span className="text-red-500">*</span>
                </label>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="paymentTerms"
                  type="checkbox"
                  required
                  checked={paymentTermsAccepted}
                  onChange={(e) => setPaymentTermsAccepted(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="paymentTerms" className="font-medium text-gray-700">
                  <a href="/limitli-alisveris-sozlesmesi#hesap-kesim-ve-odeme-sartlari" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Cari/limitli alışveriş ödeme şartlarını</a> kabul ediyorum. <span className="text-red-500">*</span>
                </label>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="kvkk"
                  type="checkbox"
                  required
                  checked={kvkkAccepted}
                  onChange={(e) => setKvkkAccepted(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="kvkk" className="font-medium text-gray-700">
                  <a href="/gizlilik-politikasi" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">KVKK bilgilendirmesini</a> okudum ve anladım. <span className="text-red-500">*</span>
                </label>
              </div>
            </div>

            <div className="flex items-start pt-2 border-t border-gray-100">
              <div className="flex items-center h-5">
                <input
                  id="marketingSms"
                  type="checkbox"
                  checked={marketingSms}
                  onChange={(e) => setMarketingSms(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="marketingSms" className="text-gray-600">
                  SMS ile kampanya ve bilgilendirme mesajları almak istiyorum. (İsteğe Bağlı)
                </label>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="marketingWhatsapp"
                  type="checkbox"
                  checked={marketingWhatsapp}
                  onChange={(e) => setMarketingWhatsapp(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="marketingWhatsapp" className="text-gray-600">
                  WhatsApp ile kampanya ve bilgilendirme mesajları almak istiyorum. (İsteğe Bağlı)
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !termsAccepted || !paymentTermsAccepted || !kvkkAccepted || firstName.trim().length < 2 || lastName.trim().length < 2 || !verificationToken}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Başvuruyu ve Sözleşmeyi Onayla'}
          </button>
        </form>
      )}
    </div>
  )
}
