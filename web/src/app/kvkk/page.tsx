import React from 'react';

export default function KVKKPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full space-y-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight border-b pb-4">KVKK Aydınlatma Metni</h1>
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm leading-relaxed space-y-6">
          <p>
            Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, HurCELL Teknoloji Mağazası ("Şirket") veri sorumlusu sıfatıyla, kişisel verilerinizi aşağıda açıklanan çerçevede kaydetmekte, saklamakta, güncellemekte ve işlemektedir.
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-4">Kişisel Verilerin İşlenme Amacı</h2>
          <p>
            Toplanan kişisel verileriniz; ürün ve hizmetlerimizin sizlere sunulabilmesi, sipariş süreçlerinin yönetimi, teslimat işlemlerinin gerçekleştirilmesi, ödeme işlemlerinin yapılması ve gerektiğinde iade/değişim süreçlerinin yönetilmesi amacıyla işlenmektedir.
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-4">Kişisel Verilerin Aktarımı</h2>
          <p>
            Sipariş süreçlerinin tamamlanabilmesi için kişisel verileriniz, iş ortaklarımız olan kargo şirketleri (örn. DHL, MNG Kargo), ödeme altyapı sağlayıcıları ve kanunen yetkili kamu kurumları ile paylaşılabilmektedir.
          </p>
          <p className="text-sm text-slate-500 italic mt-8 border-t pt-4">
            Not: Bu metin taslak niteliğindedir ve mevzuata tam uygunluk açısından şirket yetkilileri ve hukuk danışmanları tarafından incelenmelidir.
          </p>
        </div>
      </div>
    </div>
  );
}
