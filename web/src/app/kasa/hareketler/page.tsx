'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface Sale {
  id: string;
  receipt_no: string;
  category_name: string;
  product_name: string;
  quantity: number;
  unit_price_kurus: number;
  total_price_kurus: number;
  cash_paid_kurus: number;
  card_paid_kurus: number;
  status: 'completed' | 'returned' | 'cancelled';
  created_by_name: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  serial_imei?: string;
}

interface User {
  id: string;
  role: 'yonetici' | 'personel';
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function KasaHareketlerPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // İptal Modalı State'leri
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [justification, setJustification] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const loadSales = async () => {
    try {
      setLoading(true);
      setError(null);

      const meRes = await fetch('/api/kasa/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
      }

      const res = await fetch('/api/kasa/sales');
      if (!res.ok) throw new Error('Satış hareketleri yüklenemedi.');
      const data = await res.json();
      setSales(data.sales || []);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale || !justification.trim()) return;

    try {
      setCancelLoading(true);
      setCancelError(null);

      const res = await fetch(`/api/kasa/sales/${selectedSale.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: justification.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İptal işlemi başarısız.');

      setSelectedSale(null);
      setJustification('');
      loadSales();
    } catch (err: any) {
      setCancelError(err.message || 'İptal sırasında bir hata oluştu.');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kasa"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-lg text-slate-900">Günlük Satış Hareketleri</h1>
              <p className="text-xs text-slate-500">Bugün gerçekleşen satışlar ve işlem detayları</p>
            </div>
          </div>

          <button
            onClick={loadSales}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-2 text-xs font-semibold transition-all"
          >
            <RefreshCw size={16} /> Yenile
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Fiş No</th>
                  <th className="py-3.5 px-4">Tarih / Saat</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Ürün Adı</th>
                  <th className="py-3.5 px-3 text-center">Adet</th>
                  <th className="py-3.5 px-4 text-right">Nakit</th>
                  <th className="py-3.5 px-4 text-right">Kredi Kartı</th>
                  <th className="py-3.5 px-4 text-right">Toplam</th>
                  <th className="py-3.5 px-4 text-center">Personel</th>
                  <th className="py-3.5 px-4 text-center">Durum</th>
                  {user?.role === 'yonetici' && <th className="py-3.5 px-4 text-center">İşlem</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400">
                      Bugün henüz satış kaydı bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-xs">{s.receipt_no}</td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs">
                        {new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-semibold">{s.category_name}</td>
                      <td className="py-3.5 px-4 text-slate-900">
                        {s.product_name}
                        {s.serial_imei && (
                          <span className="block text-[11px] font-mono text-slate-400">IMEI: {s.serial_imei}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800">{s.quantity}</td>
                      <td className="py-3.5 px-4 text-right text-emerald-600">{formatTL(s.cash_paid_kurus)}</td>
                      <td className="py-3.5 px-4 text-right text-blue-600">{formatTL(s.card_paid_kurus)}</td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                        {formatTL(s.total_price_kurus)}
                      </td>
                      <td className="py-3.5 px-4 text-center text-xs text-slate-600">{s.created_by_name}</td>
                      <td className="py-3.5 px-4 text-center">
                        {s.status === 'completed' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            Tamamlandı
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            İptal Edildi
                          </span>
                        )}
                      </td>
                      {user?.role === 'yonetici' && (
                        <td className="py-3.5 px-4 text-center">
                          {s.status === 'completed' && (
                            <button
                              onClick={() => setSelectedSale(s)}
                              className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              İptal Et
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* YÖNETİCİ İPTAL GEREKÇE MODALI */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Satış İptali Onayı (Yönetici)</h3>
            <p className="text-xs text-slate-600">
              <span className="font-bold">{selectedSale.receipt_no}</span> nolu{' '}
              <span className="font-bold">{selectedSale.product_name}</span> satışı iptal edilecektir.
            </p>

            {cancelError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  İptal Gerekçesi (Zorunlu) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="İptal sebebini açıklayın..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-red-600/20"
                >
                  {cancelLoading ? 'İptal Ediliyor...' : 'Satışı İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
