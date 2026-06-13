'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ShieldAlert, ArrowLeft, HelpCircle } from 'lucide-react'

export default function OrderTrackingPage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState('')
  const [token, setToken] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const cleanOrderNum = orderNumber.trim()
    const cleanToken = token.trim()

    if (!cleanOrderNum) {
      setErrorMsg('Lütfen sipariş numaranızı girin.')
      return
    }

    if (!cleanToken) {
      setErrorMsg('Güvenliğiniz için sipariş takip tokenı gereklidir.')
      return
    }

    // Redirect to the actual order details route with token
    router.push(`/siparis/${encodeURIComponent(cleanOrderNum)}?token=${encodeURIComponent(cleanToken)}`)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full py-6 space-y-6 flex-1">
        
        {/* Navigation header */}
        <div className="flex justify-between items-center">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 hover:text-slate-800 transition-colors uppercase group"
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            Mağazaya Dön
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left: Input Form */}
          <div className="md:col-span-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sipariş Takip</h1>
              <p className="text-xs text-slate-400 font-light">
                Sipariş durumunuzu güvenli bir şekilde sorgulayın.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 text-rose-800 border border-rose-100 rounded-2xl p-4 text-xs font-semibold flex items-start gap-2.5">
                <ShieldAlert size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="order-number" className="font-bold text-slate-700">Sipariş Numarası</label>
                <input
                  id="order-number"
                  type="text"
                  placeholder="Örn: HRC-2026-000001"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="order-token" className="font-bold text-slate-700">Sipariş Güvenlik Tokenı</label>
                <input
                  id="order-token"
                  type="text"
                  placeholder="Güvenli bağlantı tokenı..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm font-semibold"
              >
                <Search size={14} />
                Sorgula
              </button>
            </form>
          </div>

          {/* Right: Security & Instructions */}
          <div className="md:col-span-6 bg-slate-100/60 border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2 text-slate-900">
              <HelpCircle size={18} className="text-blue-600" />
              <h3 className="font-bold text-sm">Güvenli Bağlantı Bilgisi</h3>
            </div>

            <div className="space-y-4 text-xs text-slate-650 leading-relaxed font-light">
              <p>
                Müşteri güvenliği ve kişisel verilerin korunması amacıyla, sipariş detaylarınızı görüntülemek için siparişe özel üretilen güvenlik tokenı gereklidir.
              </p>
              
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                <h4 className="font-bold text-slate-800">Token Bilgisine Nasıl Ulaşabilirim?</h4>
                <ul className="list-disc pl-4 space-y-1 text-slate-500">
                  <li>Siparişiniz alındığında tarafınıza gönderilen SMS/WhatsApp veya e-posta bildirimindeki bağlantıda tokenınız otomatik yer alır.</li>
                  <li>İletişim kanallarımız aracılığıyla da sipariş numaranızı belirterek tokenınızı talep edebilirsiniz.</li>
                </ul>
              </div>

              <p className="text-[11px] text-slate-450 italic">
                * Güvenlik tokenınız bulunmuyorsa sipariş detaylarınız ve kişisel bilgileriniz hiçbir şekilde sorgulanamaz.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
