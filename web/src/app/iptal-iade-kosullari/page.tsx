import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react'

export default function RefundTermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[850px] mx-auto px-4 sm:px-6 w-full py-6 space-y-8 flex-1">
        
        {/* Back link */}
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 hover:text-slate-800 transition-colors uppercase group"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Mağazaya Geri Dön
        </Link>

        {/* Content Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-5">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">İptal ve İade Koşulları</h1>
            <p className="text-xs text-slate-400 mt-1.5">Son Güncelleme: 13 Haziran 2026</p>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-slate-650 font-light">
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                1. Cayma Hakkı (Tüketici Kanunu 14 Gün Mesafeli Satış)
              </h2>
              <p>
                Alıcı, satın aldığı ürünün kendisine veya gösterdiği adresteki kişi/kuruluşa teslim tarihinden itibaren **14 (ondört) gün** içinde, herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkını kullanarak iade edebilir.
              </p>
              <p>
                Cayma hakkının kullanılması için bu süre içinde satıcıya yazılı olarak veya web sitesindeki **İade / İptal Talebi** portalı üzerinden bildirimde bulunulması gerekmektedir.
              </p>
            </section>

            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                2. Cayma Hakkının Geçerli Olmadığı İstisnalar
              </h2>
              <p>
                Aşağıdaki ürün gruplarında kanunen cayma hakkı kullanılamaz:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
                <li>Alıcının istekleri veya açıkça kişisel ihtiyaçları doğrultusunda hazırlanan ürünler.</li>
                <li>Ambalajı, bandı, mührü veya paketi açılmış ve hijyen/sağlık açısından iadesi uygun olmayan ürünler (Kulak içi kulaklıklar vb.).</li>
                <li>Tesliminden sonra başka ürünlerle karışan ve doğası gereği ayrıştırılması mümkün olmayan ürünler.</li>
                <li>Kullanılmış, fiziksel hasar görmüş, kutusu yırtılmış veya aksesuarları eksik olan teknolojik cihazlar.</li>
              </ul>
            </section>

            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw size={18} className="text-emerald-600" />
                3. İade ve Geri Ödeme Süreci
              </h2>
              <p>
                İade talebiniz mağazamız tarafından incelenip onaylandıktan sonra, iade edilen ürünlerin fiziksel kontrolleri sağlanır. Ürünün iade şartlarına uygunluğu doğrulandıktan sonra geri ödeme süreci başlatılır.
              </p>
              <p className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 font-mono">
                [TODO: Firma Yetkilisi Bilgisi ve Adres Buraya Eklenecektir]
                <br />
                <strong>ÖNEMLI:</strong> Geri ödemeler, ödeme kuruluşunun ve bankaların işlem süreçlerine bağlı olarak yasal süreler içerisinde kartınıza iade edilir. POS sağlayıcı veya banka kaynaklı gecikmelerden satıcı sorumlu tutulamaz.
              </p>
            </section>
          </div>
        </div>

      </div>
      
      {/* Footer */}
      <footer className="py-8 bg-slate-100 border-t border-slate-200 text-center text-[10px] text-slate-400 font-light mt-auto">
        <p>© 2026 HurCELL Teknoloji Mağazası. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  )
}
