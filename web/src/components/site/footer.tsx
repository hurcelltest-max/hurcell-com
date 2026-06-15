import React from 'react'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="py-12 bg-slate-100 border-t border-slate-200 text-xs text-slate-500 font-light mt-auto">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 font-semibold text-slate-600">
          <Link href="/shop" className="hover:text-blue-600 transition-colors">Mağaza</Link>
          <Link href="/iletisim" className="hover:text-blue-600 transition-colors">İletişim</Link>
          <Link href="/siparis" className="hover:text-blue-600 transition-colors">Sipariş Takip</Link>
          <Link href="/iade-talebi" className="hover:text-blue-600 transition-colors">İade / İptal Talebi</Link>
          <Link href="/iptal-iade-kosullari" className="hover:text-blue-600 transition-colors">İptal ve İade Koşulları</Link>
          <Link href="/gizlilik-politikasi" className="hover:text-blue-600 transition-colors">Gizlilik Politikası</Link>
          <Link href="/satis-sozlesmesi" className="hover:text-blue-600 transition-colors">Mesafeli Satış Sözleşmesi</Link>
        </div>

        {/* Security & Trust Text */}
        <p className="text-center max-w-xl mx-auto text-[11px] text-slate-450 leading-relaxed">
          Ödemelerimiz DHL Kapıda Ödeme modeli ile teslimat anında gerçekleştirilmektedir. Alışverişleriniz sırasında herhangi bir ön ödeme veya tahsilat alınmamaktadır.
        </p>

        {/* Copyright */}
        <p className="text-center text-[10px] text-slate-400">
          © 2026 HurCELL Teknoloji. Tüm hakları saklıdır.
        </p>

      </div>
    </footer>
  )
}
