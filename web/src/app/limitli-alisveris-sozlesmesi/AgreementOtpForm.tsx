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

  // Checkboxes
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [paymentTermsAccepted, setPaymentTermsAccepted] = useState(false)
  const [kvkkAccepted, setKvkkAccepted] = useState(false)
  const [marketingSms, setMarketingSms] = useState(false)
  const [marketingWhatsapp, setMarketingWhatsapp] = useState(false)

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    
    // Basic validation
    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^5\d{9}$/.test(cleanPhone)) {
      setError('Lütfen telefon numaranızı başında 0 olmadan 5XXXXXXXXX formatında giriniz.')
      return
    }

    setLoading(true)
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
    } catch (err: any) {
      setError(err.message || 'Beklenmeyen bir hata oluştu.')
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
      setSuccess('Telefon numaranız doğrulandı. Lütfen sözleşmeyi onaylayınız.')
      setStep(3)
    } catch (err: any) {
      setError(err.message || 'Beklenmeyen bir hata oluştu.')
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
      setError('Lütfen adınızı ve soyadınızı tam giriniz.')
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
          firstName,
          lastName,
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
    } catch (err: any) {
      setError(err.message || 'Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Dijital Onay ve Kimlik Doğrulama</h3>
      
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
          </div>

          <button
            type="submit"
            disabled={loading || !/^5\d{9}$/.test(phone)}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SMS Kodu Gönder'}
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
            <div className="p-4 bg-blue-50 text-blue-800 text-sm rounded-lg mb-4">
              Ad soyad bilgisi başvuru beyanıdır. Limit tanımı HurCELL incelemesi ve onayı sonrası yapılır.
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
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
                  SMS ile kampanya ve bilgilendirme mesajları almak istiyorum.
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
                  WhatsApp ile kampanya ve bilgilendirme mesajları almak istiyorum.
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !termsAccepted || !paymentTermsAccepted || !kvkkAccepted || !firstName.trim() || !lastName.trim()}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sözleşmeyi Onaylıyorum'}
          </button>
        </form>
      )}
    </div>
  )
}
