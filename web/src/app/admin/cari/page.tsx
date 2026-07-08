'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, CreditCard, ShieldAlert } from 'lucide-react';

export default function AdminCariPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/cari/arama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Müşteri bulunamadı.');

      if (data.card_token) {
        router.push(`/admin/cari/kart/${data.card_token}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cari & Veresiye Sistemi</h1>
          <p className="text-gray-500 mt-1">Limitli alışveriş müşterilerini ve hesaplarını yönetin.</p>
        </div>
        <Link 
          href="/admin/cari/yeni-musteri" 
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          <span>Yeni Müşteri Oluştur</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Arama Kartı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Müşteri Ara</h2>
          </div>
          
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefon No veya Kart Kodu
              </label>
              <input 
                type="text" 
                placeholder="Örn: 532... veya HRC-CARI-..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-4 py-2"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Aranıyor...' : 'Müşteri Bul ve Kartı Aç'}
            </button>
          </form>
        </div>

        {/* Bilgi Kartı */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-sm border border-blue-500 p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <CreditCard className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold">Müşteri Kartı Sistemi</h2>
          </div>
          <p className="text-blue-100 mb-4 leading-relaxed">
            Müşterilerinize özel oluşturulan dijital kartlar ile mağaza içi veresiye alışverişlerinizi hızlı ve güvenli bir şekilde gerçekleştirebilirsiniz.
          </p>
          <ul className="space-y-2 text-sm text-blue-50">
            <li className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-300 flex-shrink-0" />
              <span>QR Kodlar güvenlik amacıyla dinamik tokenlar içerir.</span>
            </li>
            <li className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-300 flex-shrink-0" />
              <span>Müşteri notları kalıcıdır ve sadece adminler tarafından görülebilir.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
