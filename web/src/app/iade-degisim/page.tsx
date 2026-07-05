import React from 'react';

export default function IadeDegisimPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full space-y-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight border-b pb-4">İade ve Değişim Koşulları</h1>
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm leading-relaxed space-y-6">
          <p>
            Müşterilerimiz, Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca, ürünü teslim aldıkları tarihten itibaren 14 gün içinde hiçbir gerekçe göstermeksizin cayma hakkına sahiptir.
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-4">İade ve Değişim Süreci</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>İade edilmek istenen ürünlerin kutusu, ambalajı ve varsa standart aksesuarları eksiksiz ve hasarsız olarak teslim edilmelidir.</li>
            <li>Kurulumu veya montajı yapılmış cihazlar, ekran koruyucular ve jelatini açılmış ürünlerde iade/değişim belirli şartlara tabidir.</li>
            <li>İade işlemlerinde kargo masrafları (aksi belirtilmedikçe ve arızalı ürün durumları hariç) şirketimiz veya müşteri tarafından anlaşmalı kargo kurallarına göre karşılanır.</li>
          </ul>
          <p>
            Cayma hakkınızı kullanmak ve iade/değişim talebi oluşturmak için sipariş detay sayfanızdaki "İade / İptal Talebi Oluştur" butonunu kullanabilir veya iletişim sayfamızdan destek ekibimize ulaşabilirsiniz.
          </p>
          <p className="text-sm text-slate-500 italic mt-8 border-t pt-4">
            Not: Bu metin taslak niteliğindedir ve mevzuata uygunluk açısından şirket politikaları doğrultusunda güncellenebilir.
          </p>
        </div>
      </div>
    </div>
  );
}
