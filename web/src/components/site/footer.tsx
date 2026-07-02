import React from 'react'
import Link from 'next/link'
import { FOOTER_LINKS } from '@/lib/navigation'

export function Footer() {
  return (
    <footer className="py-12 bg-slate-100 border-t border-slate-200 text-xs text-slate-500 font-light mt-auto">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 font-semibold text-slate-600">
          {FOOTER_LINKS.map((item) => (
            <Link key={item.label} href={item.href} className="hover:text-blue-600 transition-colors">
              {item.label}
            </Link>
          ))}
        </div>

        {/* Security & Trust Text */}
        <p className="text-center max-w-xl mx-auto text-[11px] text-slate-450 leading-relaxed">
          Ödemelerimiz DHL Kapıda Ödeme modeli ile teslimat anında gerçekleştirilmektedir. Alışverişleriniz sırasında herhangi bir ön ödeme veya tahsilat alınmamaktadır.
        </p>

        {/* Copyright */}
        <p className="text-center text-[10px] text-slate-400">
          &copy; {new Date().getFullYear()} HurCELL Teknoloji. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  )
}
