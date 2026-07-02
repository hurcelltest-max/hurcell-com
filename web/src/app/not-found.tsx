import React from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="bg-slate-50 p-6 rounded-full mb-8 border border-slate-100">
        <ShoppingBag className="w-16 h-16 text-slate-300" />
      </div>
      
      <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-4">404</h1>
      <h2 className="text-xl font-bold text-slate-700 mb-4">Sayfa bulunamadı</h2>
      
      <p className="text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
        Aradığınız sayfa taşınmış veya kaldırılmış olabilir. Alışverişe devam etmek için ana sayfaya dönebilir veya sepetinizi kontrol edebilirsiniz.
      </p>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
        <Link 
          href="/" 
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Mağazaya Dön</span>
        </Link>
        
        <Link 
          href="/sepet" 
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all border border-slate-200 shadow-sm"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Sepete Git</span>
        </Link>
      </div>
    </div>
  );
}
