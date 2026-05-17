'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-slate-100 text-slate-900 font-sans py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Geri Dönüş Butonu */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-light text-slate-600 hover:text-blue-600 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Anasayfaya Dön
          </Link>
        </div>

        {/* Kurumsal Başlık */}
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200/60 space-y-8">
          <div className="border-b border-slate-100 pb-6 text-center md:text-left">
            <h1 className="text-4xl font-light text-slate-900 tracking-tight">Gizlilik Politikası</h1>
            <p className="text-sm text-slate-500 font-mono mt-2">Son Güncelleme: 17 Mayıs 2026</p>
          </div>

          {/* Sözleşme Maddeleri */}
          <div className="space-y-6 text-slate-600 font-light leading-relaxed text-sm md:text-base">
            <p>
              <strong className="text-slate-900 font-medium">HurCELL</strong> olarak, mobil uygulamamız ve web sitemiz üzerinden kullanıcılarımızın gizliliğine ve kişisel verilerinin korunmasına en üst düzeyde önem veriyoruz. Bu politika, hangi verileri topladığımızı ve bunları nasıl işlediğimizi açıklar.
            </p>

            <section className="space-y-3">
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">1. Toplanan Veriler Modülü</h2>
              <p>
                Uygulamamız içerisinde sunulan üyelik sistemleri, avantajlı paketler ve güvenli ödeme kanallarının (Iyzico) sağlıklı çalışabilmesi adına ad, soyad, e-posta adresi ve iletişim bilgileri işlenebilmektedir. Bu veriler tamamen sipariş süreçlerinizin takibi amacıyla kullanılır.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">2. Anlık Bildirimler (Push Notifications)</h2>
              <p>
                Mağazamızdaki en yeni ürün ve aksesuar kampanyalarından, avantajlı paketlerden anında haberdar olabilmeniz için telefonunuza anlık bildirimler gönderilebilmektedir. Dilediğiniz zaman cihazınızın ayarlar bölümünden bu bildirim izinlerini kapatabilirsiniz.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">3. Ödeme Güvenliği Altyapısı</h2>
              <p>
                Alışverişleriniz esnasında kullanılan kredi kartı ve ödeme bilgileri doğrudan lisanslı ödeme kuruluşu olan <strong className="text-slate-900 font-medium">Iyzico</strong> altyapısı tarafından güvenli sunucularda işlenir. HurCELL, kart bilgilerinizi asla kendi sunucularında saklamaz.
              </p>
            </section>

            <div className="border-t border-slate-100 pt-6 text-center text-xs text-slate-400 font-mono">
              © 2026 HurCELL. Tüm hakları saklıdır.
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}