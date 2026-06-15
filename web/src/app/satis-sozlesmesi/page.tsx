import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mesafeli Satış Sözleşmesi | HurCELL Teknoloji Mağazası',
  description: 'HurCELL Teknoloji Mağazası online alışverişler için geçerli Mesafeli Satış Sözleşmesi yasal bilgilendirme sayfası.',
}

export default function SalesContractPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[850px] mx-auto px-4 sm:px-6 w-full py-6 space-y-8 flex-1">
        
        {/* Back link */}
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-550 hover:text-slate-800 transition-colors uppercase group"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Mağazaya Geri Dön
        </Link>

        {/* Content Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-5">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Mesafeli Satış Sözleşmesi</h1>
            <p className="text-xs text-slate-400 mt-1.5 font-mono">Son Güncelleme: 13 Haziran 2026</p>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-slate-650 font-light">
            
            {/* Giriş */}
            <p>
              İşbu sözleşme, alıcının satıcıya ait mobil uygulama veya web sitesi üzerinden dijital olarak sipariş ettiği ürünlerin satışı ve teslimi ile ilgili olarak, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca tarafların hak ve yükümlülüklerini düzenler.
            </p>

            {/* 1. Taraflar */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                1. Taraflar ve Satıcı Bilgileri
              </h2>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 font-mono text-xs text-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Satıcı Ünvanı</span>
                  <span className="font-semibold text-slate-900">HurCELL Teknoloji</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Adres</span>
                  <span className="text-slate-800">1390 Sokak 11/A 35320 Alsancak Konak / İZMİR</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Telefon</span>
                    <span className="text-slate-850">0232 421 13 14</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">E-posta</span>
                    <span className="text-slate-850">hurcell@hurcell.com</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Vergi Dairesi</span>
                    <span className="text-slate-850">Kordon</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Vergi No</span>
                    <span className="text-slate-850">1590108328</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Sipariş ve Ödeme */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                2. Ürün Bilgisi ve Ödeme Koşulları
              </h2>
              <p>
                Sözleşme konusu ürünün cinsi, miktarı, satış bedeli ve teslimat detayları alıcının sipariş sonlandırma aşamasındaki seçimine göre belirlenir.
              </p>
              <p>
                Ödeme yöntemi sabit olarak "DHL Kapıda Ödeme" olarak belirlenmiştir. Müşteri alışveriş sırasında online ödeme yapmaz veya kart bilgisi girmez. Sipariş tutarı teslimat anında kapıda DHL kargo görevlisine ödenir. 999 TL altı siparişlerde DHL kargo bedeli 125 TL’dir. 1000 TL ve üzeri siparişlerde kargo ücretsizdir.
              </p>
            </section>

            {/* 3. Teslimat Koşulları */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-blue-600" />
                3. Teslimat ve İfa Esasları
              </h2>
              <p>
                Siparişiniz alındıktan sonra HurCELL tarafından onaylanacaktır. Onaylanan siparişler, alıcının beyan ettiği adrese yasal 30 günlük süreyi aşmamak şartıyla DHL ile teslimat kapsamında güvenli şekilde teslim edilir. DHL kargo süreci başlatıldığında takip bilgisi alıcı ile paylaşılacaktır. Ürünün teslim anına kadar oluşabilecek kargo hasarlarından ve zayiattan satıcı sorumludur.
              </p>
            </section>

            {/* 4. Cayma Hakkı */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                4. Cayma Hakkı ve Ürün İadeleri
              </h2>
              <p>
                Alıcı, ürünü teslim aldığı tarihten itibaren **14 (ondört) gün** içinde hiçbir gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkını kullanabilir.
              </p>
              <p>
                İade edilecek ürünlerin kullanılmamış, ambalajının bozulmamış ve satılabilirlik özelliğini yitirmemiş olması gerekir. Hijyenik risk teşkil eden kulak içi kulaklıklar ve jelatini açılmış/kurulumu yapılmış teknolojik cihazlarda cayma hakkı yönetmelik gereği sınırlandırılmıştır. Detaylar için <Link href="/iptal-iade-kosullari" className="text-blue-600 font-semibold hover:underline">İptal ve İade Koşulları</Link> sayfamızı inceleyebilirsiniz.
              </p>
            </section>

            {/* 5. Yetkili Mahkeme */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                5. Yetkili Mahkeme ve Uyuşmazlıkların Çözümü
              </h2>
              <p>
                İşbu sözleşmeden doğabilecek uyuşmazlıklarda, her yıl Gümrük ve Ticaret Bakanlığı tarafından ilan edilen değere kadar Tüketici Hakem Heyetleri ile satıcının yerleşim yerindeki Tüketici Mahkemeleri yetkilidir.
              </p>
            </section>

          </div>
        </div>

      </div>
    </div>
  )
}
