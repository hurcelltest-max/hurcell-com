'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-slate-100 text-slate-900">
      {/* Hero Section - Large Welcome */}
      <section className="py-32 md:py-48 bg-gradient-to-br from-white via-blue-50 to-slate-100">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">
          <div className="text-center max-w-4xl mx-auto space-y-4">
            <h1 className="text-7xl md:text-8xl font-light text-slate-900 tracking-tight mb-0 leading-tight">
              HurCELL
            </h1>
            <p className="text-2xl md:text-3xl text-slate-600 font-light tracking-wide">
              Teknolojide Seçkin Standartlar.
            </p>
            <div className="flex justify-center">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-8 md:px-10 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-light text-base md:text-lg transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Mağazayı Gez
                <ChevronRight size={20} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category Band 1: Apple Dünyası */}
      <CategoryBand
        title="Apple Dünyası"
        subtitle="Premium iPhone ve iPad aksesuarlarının en seçkin koleksiyonu"
        linkText="Modelleri İnceleyin"
        href="/shop"
        bgGradient="bg-white"
        accentColor="from-white to-white"
      />

      {/* Category Band 2: Android & Xiaomi Dünyası */}
      <CategoryBand
        title="Android Dünyası"
        subtitle="Samsung, Xiaomi ve tüm premium Android telefonlar için profesyonel çözümler"
        linkText="Keşfet"
        href="/shop"
        bgGradient="bg-[#f5f5f7]"
        accentColor="from-[#f5f5f7] to-[#f5f5f7]"
      />

      {/* Category Band 3: Avantajlı Paketler */}
      <CategoryBand
        title="Avantajlı Paketler"
        subtitle="Birlikte Daha Güçlü — Kılıf, Cam, Kablo Setleri"
        linkText="Bundle'ları Keşfet"
        href="/shop"
        bgGradient="bg-white"
        accentColor="from-white to-white"
      />

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 text-center">
          <p className="text-sm text-slate-600 font-light">
            © 2026 HurCELL. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Reusable Category Band Component
function CategoryBand({
  title,
  subtitle,
  linkText,
  href,
  bgGradient,
  accentColor,
}: {
  title: string;
  subtitle: string;
  linkText: string;
  href: string;
  bgGradient: string;
  accentColor: string;
}) {
  return (
    <section className={cn('py-12 md:py-14', bgGradient)}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-8">
        <div className={cn('rounded-3xl p-8 md:p-12 transition-all duration-500 hover:shadow-lg', accentColor)}>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="md:flex-1 space-y-4">
              <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
                {title}
              </h2>
              <p className="text-base md:text-lg text-slate-600 font-light leading-relaxed">
                {subtitle}
              </p>

              <div className="space-y-4">
                <Link
                  href={href}
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-light text-base md:text-lg transition-all duration-300 group"
                >
                  {linkText}
                  <ChevronRight size={20} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            <div className="w-full md:w-1/2 flex-1">
              <div className="w-full h-48 md:h-56 rounded-2xl overflow-hidden bg-white/0 flex items-center justify-center">
                <img src="/images/placeholder.png" alt={title} className="w-full h-full object-cover object-center rounded-2xl opacity-95" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
