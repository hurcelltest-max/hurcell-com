import React from 'react';

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full space-y-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight border-b pb-4">Mesafeli Satış Sözleşmesi</h1>
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm leading-relaxed space-y-6">
          <h2 className="text-xl font-bold text-slate-900 mt-4">1. Taraflar</h2>
          <p>
            İşbu sözleşme, bir tarafta HurCELL Teknoloji Mağazası ("Satıcı") ile diğer tarafta www.hurcell.com internet sitesinden ("Site") ürün veya hizmet satın alan alıcı ("Alıcı") arasında, elektronik ortamda onaylanmak suretiyle akdedilmiştir.
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-4">2. Sözleşmenin Konusu</h2>
          <p>
            İşbu Sözleşmenin konusu, Alıcı'nın Satıcı'ya ait internet sitesinden elektronik ortamda siparişini yaptığı, özellikleri ve satış fiyatı belirtilen ürünlerin satışı ve teslimi ile ilgili olarak yürürlükteki Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin saptanmasıdır.
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-4">3. Teslimat ve Kargo</h2>
          <p>
            Satın alınan ürünler, sipariş onayından sonra belirtilen yasal süre içerisinde Alıcı'nın beyan ettiği teslimat adresine anlaşmalı kargo firmaları (DHL, MNG vb.) aracılığıyla teslim edilecektir. Kapıda ödeme veya kredi kartı ile ödeme seçeneklerinde belirtilen hizmet bedelleri sipariş aşamasında Alıcı'ya bildirilir.
          </p>
          <p className="text-sm text-slate-500 italic mt-8 border-t pt-4">
            Not: Bu metin taslak niteliğindedir. İşletme detayları ve tam hukuki geçerlilik için düzenlenmelidir.
          </p>
        </div>
      </div>
    </div>
  );
}
