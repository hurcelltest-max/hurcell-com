import React from 'react';
import KasaHeaderWidget from '@/components/kasa/KasaHeaderWidget';

export default function AdminKasaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Sabit Sol Üst Kasa & Kâr-Zarar Göstergesi */}
      <KasaHeaderWidget />

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}
