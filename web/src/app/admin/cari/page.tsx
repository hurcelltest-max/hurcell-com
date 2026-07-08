'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, CreditCard, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminCariPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // List State
  const [customers, setCustomers] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('pending_review');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError('');

    try {
      const res = await fetch('/api/admin/cari/arama', {
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
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/admin/cari/list?status=${filterStatus}&page=${page}&limit=20`);
      const json = await res.json();
      if (res.ok && json.data) {
        setCustomers(json.data);
        setTotalPages(json.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setListLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'pending_review': return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">İnceleme Bekliyor</span>;
      case 'active': return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Aktif</span>;
      case 'rejected': return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">Reddedildi</span>;
      case 'suspended': return <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">Askıya Alındı</span>;
      case 'closed': return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-medium">Kapalı</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-medium">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Arama Kartı */}
        <div className="md:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Hızlı Arama</h2>
          </div>
          
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <input 
                type="text" 
                placeholder="Telefon No veya Kart Kodu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-4 py-2"
              />
            </div>
            {searchError && <p className="text-red-600 text-sm">{searchError}</p>}
            <button 
              type="submit"
              disabled={searchLoading}
              className="w-full bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {searchLoading ? 'Aranıyor...' : 'Bul ve Aç'}
            </button>
          </form>
        </div>

        {/* Müşteri Listesi Kartı */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Müşteri Listesi</h2>
            <select 
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tümü</option>
              <option value="pending_review">İnceleme Bekleyenler</option>
              <option value="active">Aktif Müşteriler</option>
              <option value="suspended">Askıya Alınanlar</option>
              <option value="rejected">Reddedilenler</option>
            </select>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm text-gray-500">
              <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Ad Soyad / Telefon</th>
                  <th className="px-4 py-3">Limit</th>
                  <th className="px-4 py-3">Müşteri Statüsü</th>
                  <th className="px-4 py-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Yükleniyor...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Kayıt bulunamadı.</td></tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.customer_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.full_name}</div>
                        <div className="text-xs text-gray-500">{c.phone}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {c.limit} TL
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.cust_status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/cari/kart/${c.card_token}`} className="text-blue-600 hover:underline text-sm font-medium">
                          İncele
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Sayfa {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

