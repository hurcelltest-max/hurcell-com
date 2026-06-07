'use client';

import React from 'react';

export default function B2bRejectedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-lg shadow-rose-950/5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-3xl">
          🚫
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
          Bayilik Durumu Aktif Değil
        </h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          Bayilik başvurunuz onaylanmamış ya da mevcut bayilik hesabınız geçici olarak **pasife** alınmış olabilir.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Detaylı bilgi edinmek ve hesabınızı tekrar aktif hale getirmek için lütfen HurCELL Elite Tech yönetimi ile iletişime geçin.
        </p>
        <div className="mt-8">
          <a
            href="mailto:destek@hurcell.com"
            className="inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Destek Ekibiyle İletişime Geçin
          </a>
        </div>
      </div>
    </div>
  );
}
