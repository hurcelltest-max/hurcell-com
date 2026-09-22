'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, RefreshCw, ShoppingBag } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function KasaSatisError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Kasa Satis Route Error Boundary:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl">
            <AlertCircle className="w-10 h-10" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Satış Sayfası Yüklenemedi</h2>
          <p className="text-slate-500 text-xs leading-relaxed">
            Satış formu yüklenirken beklenmeyen bir hata oluştu. Lütfen yeniden deneyin veya kasa paneline dönün.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw size={14} />
            Yeniden Dene
          </button>

          <Link
            href="/kasa"
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
          >
            <ArrowLeft size={14} />
            Kasa Föyüne Dön
          </Link>
        </div>

        {error.digest && (
          <p className="text-[10px] text-slate-400 font-mono pt-4 border-t border-slate-100">
            Hata Kodu: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
