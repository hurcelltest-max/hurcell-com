'use client';

import React from 'react';

export default function B2bPendingPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-lg shadow-amber-950/5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-3xl">
          ⏳
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
          Başvurunuz Onay Bekliyor
        </h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          Bayilik başvurunuz başarıyla alındı ve yönetici incelemesine gönderildi. 
          Hesabınız **approved (onaylı)** durumuna getirildiğinde toptan satış kataloğuna otomatik olarak erişim kazanacaksınız.
        </p>
        <div className="mt-8 rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-500">
          Lütfen aralıklarla bu sayfayı yenileyerek durumu kontrol edin.
        </div>
      </div>
    </div>
  );
}
