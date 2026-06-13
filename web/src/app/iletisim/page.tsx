import React from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { Phone, Mail, MapPin, Clock, MessageSquare, Building2, ShieldAlert } from 'lucide-react'
import { WHATSAPP_NUMBER } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'İletişim | HurCELL Teknoloji Mağazası',
  description: 'HurCELL Teknoloji Mağazası iletişim bilgileri, adres, e-posta, WhatsApp hattı ve çalışma saatleri.',
}

export default function ContactPage() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Merhaba, bilgi almak istiyorum.')}`

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 w-full py-6 space-y-8 flex-1">
        
        {/* Page Header */}
        <div className="border-b border-slate-200 pb-5 text-center sm:text-left">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">İletişim</h1>
          <p className="text-xs text-slate-500 mt-1.5">
            Sorularınız, iş birlikleriniz veya destek talepleriniz için bizimle iletişime geçebilirsiniz.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Left Column: Contact Cards */}
          <div className="md:col-span-7 space-y-4">
            
            {/* Store Name Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Building2 size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-sm">Mağaza Bilgileri</h3>
                <p className="text-sm font-medium text-slate-700">HurCELL Teknoloji Mağazası</p>
                <p className="text-xs text-slate-450 leading-relaxed font-light">
                  En yeni mobil cihazlar, tabletler, bilgisayarlar ve aksesuarlar.
                </p>
              </div>
            </div>

            {/* Phone & WhatsApp Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Phone size={20} />
              </div>
              <div className="space-y-1 w-full">
                <h3 className="font-bold text-slate-900 text-sm">Telefon & WhatsApp</h3>
                <div className="flex flex-col gap-2 pt-1">
                  <a href={`tel:+905322362242`} className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors flex items-center gap-1.5">
                    +90 532 236 2242
                  </a>
                  <a 
                    href={whatsappUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-semibold hover:bg-emerald-100/70 transition-all self-start"
                  >
                    <MessageSquare size={13} />
                    WhatsApp Destek Hattı
                  </a>
                </div>
              </div>
            </div>

            {/* Email Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Mail size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-sm">E-Posta</h3>
                <a href="mailto:info@hurcell.com" className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors block pt-1">
                  info@hurcell.com
                </a>
              </div>
            </div>

            {/* Address & Hours Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <MapPin size={20} />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 text-sm">Adres & Çalışma Saatleri</h3>
                <p className="text-xs text-slate-650 leading-relaxed font-light">
                  HurCELL tarafından güncellenecektir (Adres TODO)
                </p>
                <div className="flex items-center gap-1 text-slate-500 font-mono text-[11px] pt-1 border-t border-slate-100">
                  <Clock size={12} />
                  <span>Çalışma Saatleri: HurCELL tarafından güncellenecektir (Saatler TODO)</span>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Official Corporate Info */}
          <div className="md:col-span-5">
            <div className="bg-slate-100 border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Building2 size={18} className="text-blue-600" />
                <h3 className="font-bold text-sm">Firma Resmi Bilgileri</h3>
              </div>
              <p className="text-[11px] text-slate-450 leading-relaxed">
                Yasal mevzuat gereği şirketimize ait resmi bilgiler aşağıda yer almaktadır.
              </p>

              <div className="space-y-3 pt-2 text-xs border-t border-slate-200/60 font-mono">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">Ticari Ünvan</span>
                  <span className="text-slate-800 font-medium font-mono">HurCELL tarafından eklenecektir (TODO)</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">Vergi Dairesi</span>
                  <span className="text-slate-800 font-medium font-mono">HurCELL tarafından eklenecektir (TODO)</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">Vergi Numarası</span>
                  <span className="text-slate-800 font-medium font-mono">HurCELL tarafından eklenecektir (TODO)</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">MERSİS Numarası</span>
                  <span className="text-slate-800 font-medium font-mono">HurCELL tarafından eklenecektir (TODO)</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">Adres</span>
                  <span className="text-slate-800 font-medium font-sans font-light leading-relaxed">HurCELL tarafından eklenecektir (TODO)</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
