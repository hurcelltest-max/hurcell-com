'use client'

import React, { useState } from 'react'
import { ArrowLeft, UserPlus, Link as LinkIcon, Send } from 'lucide-react'
import Link from 'next/link'

export default function YeniMusteriPage() {
  const [phone, setPhone] = useState('')
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const contractUrl = `${baseUrl}/limitli-alisveris-sozlesmesi`
  
  // WhatsApp Message Generation
  const waMessage = `Değerli müşterimiz, HurCELL mağazalarımızda kullanabileceğiniz limitli alışveriş (veresiye) hesabınızın onay işlemleri için aşağıdaki bağlantıya tıklayarak sözleşmeyi okuyup onaylamanız gerekmektedir:\n\n${contractUrl}\n\nOnayınız sonrasında işleminiz mağazamızda tamamlanacaktır.`
  const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMessage)}`

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/cari" className="text-gray-500 hover:text-gray-900 flex items-center gap-2 w-fit mb-4">
          <ArrowLeft className="w-4 h-4" />
          Listeye Dön
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-blue-600" />
          Yeni Cari Müşteri Kartı Oluştur
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Müşterinin cari alışveriş (veresiye) yapabilmesi için öncelikle sözleşmeyi SMS ile onaylaması gerekir.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Send Contract */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
            Sözleşme Linki Gönder
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Telefon Numarası</label>
              <input 
                type="tel" 
                placeholder="5XXXXXXXXX" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-3">Sözleşme Bağlantısı:</p>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={contractUrl} 
                  className="flex-1 bg-white px-3 py-1.5 rounded border border-gray-200 text-sm text-gray-500"
                />
                <button 
                  onClick={() => navigator.clipboard.writeText(contractUrl)}
                  className="p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-100"
                  title="Kopyala"
                >
                  <LinkIcon className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            <a 
              href={phone.length >= 10 ? waLink : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-medium transition-colors ${
                phone.length >= 10 
                  ? 'bg-green-500 hover:bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              WhatsApp ile Link Gönder
            </a>
          </div>
        </div>

        {/* Step 2: System Check */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
            Sistem Onayı Bekleniyor
          </h2>
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500 text-sm">
              Müşteri linkteki sözleşmeyi okuyup, telefonuna gelen SMS doğrulama kodunu (OTP) girdiğinde cari hesabı otomatik olarak açılacaktır.
            </p>
            <p className="text-blue-600 font-medium text-sm mt-4">
              Onay tamamlandığında Cari Müşteriler listesinde görünecektir.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
