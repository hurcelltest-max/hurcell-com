import React from 'react';

export default function HakkimizdaPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full space-y-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight border-b pb-4">Hakkımızda</h1>
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm leading-relaxed space-y-6">
          <p>
            HurCELL Teknoloji Mağazası, en yeni teknoloji ürünlerini, telefon, tablet ve bilgisayar aksesuarlarını müşterileriyle buluşturmak amacıyla İzmir'de kurulmuştur.
          </p>
          <p>
            Kuruluşumuzdan bu yana temel ilkemiz; kaliteyi uygun fiyatlarla sunmak, satış öncesi ve sonrasında güvenilir teknik destek sağlamak ve müşteri memnuniyetini en üst düzeyde tutmaktır.
          </p>
          <p>
            Alanında uzman ekibimizle, teknoloji dünyasındaki yenilikleri yakından takip ediyor, ürün portföyümüzü sürekli güncelliyoruz. İhtiyacınız olan her an yanınızda olmak için çalışıyoruz.
          </p>
          <p className="text-sm text-slate-500 italic mt-8 border-t pt-4">
            Not: Bu metin bilgilendirme amaçlıdır.
          </p>
        </div>
      </div>
    </div>
  );
}
