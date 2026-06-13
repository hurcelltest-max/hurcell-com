import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, RefreshCw, AlertTriangle, PhoneCall } from 'lucide-react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'İptal ve İade Koşulları | HurCELL Teknoloji Mağazası',
  description: 'HurCELL Teknoloji Mağazası iptal, iade, değişim şartları ve tüketici hakları bilgilendirme sayfası.',
}

export default function RefundTermsPage() {
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
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">İptal ve İade Koşulları</h1>
            <p className="text-xs text-slate-400 mt-1.5 font-mono">Son Güncelleme: 13 Haziran 2026</p>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-slate-650 font-light">
            
            {/* 1. İptal Talebi */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                1. İptal Talebi Prosedürü
              </h2>
              <p>
                Sipariş ettiğiniz ürünlerin henüz kargoya teslim edilmemiş olması durumunda iptal talebinde bulunabilirsiniz. İptal talebi için web sitemizdeki **İade / İptal Talebi** sayfasından talep oluşturabilir ya da destek kanallarımız üzerinden bizimle irtibata geçebilirsiniz.
              </p>
              <p>
                Kargoya verilmiş olan siparişler için iptal prosedürü uygulanamaz; bu durumda ürün teslim alındıktan sonra iade prosedürü başlatılmalıdır.
              </p>
            </section>

            {/* 2. İade ve Değişim Talebi */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                2. İade ve Değişim Talebi Prosedürü
              </h2>
              <p>
                Tüketicinin Korunması Hakkında Kanun kapsamında, satın aldığınız ürünleri teslim aldığınız tarihten itibaren **14 (ondört) gün** içerisinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin iade edebilir veya değişimini talep edebilirsiniz.
              </p>
              <p>
                İade veya değişim sürecini başlatmak için `/iade-talebi` sayfası üzerinden sipariş numaranız ve güvenlik tokenınızla başvuru yapmanız gerekmektedir.
              </p>
            </section>

            {/* 3. Ürün İade Şartları ve Hijyen/Kullanım Kısıtlamaları */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                3. Ürün İade Şartları & Özel Kısıtlamalar
              </h2>
              <p>
                İade edilecek ürünün tekrar satılabilirlik özelliğini kaybetmemiş olması, ambalajının hasar görmemiş olması ve varsa tüm standart aksesuarları ile birlikte eksiksiz gönderilmesi zorunludur.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-slate-700 font-light">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider">Dikkat Edilmesi Gereken Ürün Grupları:</h4>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li>
                    <strong>Kulak İçi Kulaklıklar ve Hijyenik Ürünler:</strong> Ambalajı, bandı, mührü veya paketi açılmış olan kulak içi kulaklıklar, kişisel bakım ürünleri ve hijyen riski barındıran diğer sarf malzemeleri cayma hakkı kapsamında **iade alınamaz**.
                  </li>
                  <li>
                    <strong>Ambalajı Açılmış Teknolojik Cihazlar:</strong> Jelatini veya mühür etiketi sökülmüş cep telefonu, tablet ve bilgisayarlar, kurulumu yapılmış veya kullanıcı hesabı (Apple ID, Google vb.) tanımlanmış cihazlar ancak yetkili teknik servis raporu doğrultusunda kusurlu bulunması halinde iade veya değişim sürecine dahil edilebilir.
                  </li>
                  <li>
                    <strong>Aksesuar ve Sarf Ürünleri:</strong> Şarj cihazları, şarj kabloları, kılıflar ve koruyucu camlar gibi aksesuarların kutularının yırtılmamış, ürünlerin kullanılmamış ve fiziki hasar görmemiş olması durumunda iade değerlendirmesi koşullu olarak yapılır.
                  </li>
                </ul>
              </div>
            </section>

            {/* 4. Geri Ödeme Süreci */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw size={18} className="text-emerald-600" />
                4. Geri Ödemeler ve POS Süreci
              </h2>
              <p>
                Gönderilen iade ürünlerinin ön fiziki kontrolleri ve iade şartlarına uygunluğu mağaza yetkililerimiz tarafından onaylandıktan sonra geri ödeme talimatı verilir. Geri ödeme işlemleri, ödemenin alındığı ödeme yöntemi ve ilgili ödeme kuruluşu prosedürlerine göre tamamlanır.
              </p>
              <p className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-650 font-mono">
                <strong>İade Adresi:</strong> 1390 Sokak 11/A 35320 Alsancak Konak / İZMİR
                <br />
                <strong>ÖNEMLİ:</strong> Bankaların iç süreçleri sebebiyle taksitli yapılan alışverişlerin iadesi kartınıza bankanız tarafından taksitler halinde yansıtılabilir. Bu süreç tamamen bankaların sorumluluğundadır.
              </p>
            </section>

            {/* 5. İletişim Kanalları */}
            <section className="space-y-2.5 border-t border-slate-100 pt-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <PhoneCall size={18} className="text-slate-700" />
                5. Destek ve İletişim Kanallarımız
              </h2>
              <p>
                İptal, iade ve değişim süreçlerinizle ilgili her türlü sorunuz için aşağıdaki kanallardan bize ulaşabilirsiniz:
              </p>
              <ul className="list-disc pl-5 text-xs sm:text-sm">
                <li><strong>E-posta:</strong> hurcell@hurcell.com</li>
                <li><strong>Müşteri Hizmetleri:</strong> 0232 421 13 14</li>
                <li><strong>WhatsApp Destek:</strong> 0532 226 93 62</li>
              </ul>
            </section>

          </div>
        </div>

      </div>
    </div>
  )
}
