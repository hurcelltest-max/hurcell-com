import React from 'react'
import Link from 'next/link'
import { ShieldCheck, HelpCircle, ArrowRight, DollarSign, Calendar, Landmark, Info } from 'lucide-react'

export const metadata = {
  title: 'Limitli Alışveriş (Veresiye) Sistemi | HurCELL',
  description: 'Faizsiz/Düşük vade farkı ve 3 aya varan taksit seçenekleriyle HurCELL Limitli Alışveriş sistemini keşfedin.',
}

export default function LimitliAlisverisLandingPage() {
  const faqItems = [
    {
      q: 'Limitli Alışveriş (Veresiye) nedir?',
      a: 'HurCELL müşterilerine özel, nakit veya kredi kartı limiti harcamadan, size özel tanımlanan cari limit dahilinde senetli/veresiye alışveriş yapmanızı sağlayan ödeme yöntemidir.'
    },
    {
      q: 'Minimum alışveriş tutarı ne kadardır?',
      a: 'Veresiye sistemimizi kullanabilmek için sepet tutarınızın en az 750 TL olması gerekmektedir.'
    },
    {
      q: 'En fazla kaç taksit yapabilirim?',
      a: 'Sistemimiz vade farkı yansıtılarak en fazla 3 taksit seçeneği sunmaktadır. Dilerseniz peşinat ödeyerek taksit tutarlarınızı düşürebilirsiniz.'
    },
    {
      q: 'Limitim nasıl belirlenir?',
      a: 'HurCELL mağazalarından veya online platformumuzdan yapacağınız ilk başvuru sonrasında, kredi risk profiliniz incelenerek size özel bir alışveriş limiti tanımlanır.'
    }
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 lg:pt-32 lg:pb-24">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl -z-10"></div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6 animate-pulse">
            <ShieldCheck className="w-4 h-4" />
            <span>Güvenli Cari Ödeme Sistemi</span>
          </div>

          <h1 id="landing-title" className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-blue-400">
            Kredi Kartsız, Kefilsiz <br />
            <span className="text-blue-500">Limitli Alışveriş Keyfi</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            HurCELL'in yenilikçi Cari Hesap sistemiyle tanışın. Alışveriş limitinizi hemen öğrenin, ödemelerinizi bütçenize göre taksitlendirin.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              id="cta-sozlesme"
              href="/limitli-alisveris-sozlesmesi"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              <span>Hemen Başvur & Sözleşmeyi Oku</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-16 bg-slate-950/50 border-y border-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center text-white mb-12">Sistem Nasıl Çalışır?</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl hover:border-blue-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-6 group-hover:bg-blue-500/20 transition-all">
                <Landmark className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">1. Limit Başvurusu</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Limitli Alışveriş ve Cari Hesap Sözleşmesi'ni okuyup telefon numaranızla doğrulayarak ön başvurunuzu gerçekleştirin.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl hover:border-blue-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-6 group-hover:bg-blue-500/20 transition-all">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">2. Hızlı Onay</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Başvurunuz HurCELL finans ekibi tarafından incelenir ve 30 dakika içerisinde limitiniz tanımlanır.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl hover:border-blue-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-6 group-hover:bg-blue-500/20 transition-all">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">3. Taksitle Öde</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Belirlenen limitinizle dilediğiniz ürünü alın, vade farkıyla 3 aya kadar eşit taksitlerle elden veya havaleyle ödeyin.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Payment Plan Example */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
            
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold text-white mb-4">Örnek Ödeme Planı</h2>
              <p className="text-slate-400 mb-8 text-sm sm:text-base">
                1500 TL değerinde bir alışveriş yaptığınızı varsayalım. İşte 3 taksitli örnek ödeme tablosu:
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase text-slate-400 bg-slate-950/40 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Ödeme Türü</th>
                      <th className="px-6 py-4">Vade Farkı</th>
                      <th className="px-6 py-4 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    <tr>
                      <td className="px-6 py-4 font-medium text-white">Alışveriş Tutarı (Anapara)</td>
                      <td className="px-6 py-4 text-slate-400">-</td>
                      <td className="px-6 py-4 text-right font-semibold text-white">1.500,00 TL</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium text-white">Vade Farkı Oranı (%2)</td>
                      <td className="px-6 py-4 text-slate-400">%2.00</td>
                      <td className="px-6 py-4 text-right text-indigo-400">+30,00 TL</td>
                    </tr>
                    <tr className="bg-slate-950/20">
                      <td className="px-6 py-4 font-bold text-white">Toplam Geri Ödenecek Borç</td>
                      <td className="px-6 py-4 text-slate-400">-</td>
                      <td className="px-6 py-4 text-right font-bold text-blue-400">1.530,00 TL</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium text-slate-300">1. Taksit (1. Ay)</td>
                      <td className="px-6 py-4 text-slate-400">-</td>
                      <td className="px-6 py-4 text-right text-white">510,00 TL</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium text-slate-300">2. Taksit (2. Ay)</td>
                      <td className="px-6 py-4 text-slate-400">-</td>
                      <td className="px-6 py-4 text-right text-white">510,00 TL</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-medium text-slate-300">3. Taksit (3. Ay)</td>
                      <td className="px-6 py-4 text-slate-400">-</td>
                      <td className="px-6 py-4 text-right text-white">510,00 TL</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-start gap-3 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hesap kesim tarihlerimiz her ayın 10, 15, 20 veya 25. günü olarak belirlenebilir. Kuruş farkları otomatik olarak son taksite yansıtılır. Gecikme faiz oranları yasal mevzuata uygun olarak uygulanır.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-slate-950/20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center gap-2 mb-12">
            <HelpCircle className="w-8 h-8 text-blue-500" />
            <h2 className="text-3xl font-bold text-white text-center">Sıkça Sorulan Sorular</h2>
          </div>

          <div className="space-y-6">
            {faqItems.map((item, idx) => (
              <div key={idx} className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl">
                <h3 className="text-lg font-semibold text-white mb-2">{item.q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              id="cta-sozlesme-footer"
              href="/limitli-alisveris-sozlesmesi"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold group"
            >
              <span>Hemen Limitinizi Başlatın</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
