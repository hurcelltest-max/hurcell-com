'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';
import KredimetreBadge from '@/components/admin/KredimetreBadge';

export default function AdminCariPage() {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filter & pagination state
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterRisk, setFilterRisk] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string>('');

  // Data states
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customers, setCustomers] = useState<any[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    pendingReview: 0,
    active: 0,
    overdue: 0,
    critical: 0,
    noData: 0
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({
        status: filterStatus,
        risk: filterRisk,
        search: debouncedSearch,
        page: page.toString(),
        limit: '20'
      });
      const res = await fetch(`/api/admin/cari/list?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Müşteri listesi yüklenemedi.');
      }

      if (json.data) {
        setCustomers(json.data);
        setTotalPages(json.pagination?.totalPages || 1);
        setTotalResults(json.pagination?.total || 0);
        if (json.counts) {
          setCounts(json.counts);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Müşteriler yüklenirken bir hata oluştu.';
      console.error('[FETCH CARI LIST ERROR]', errMsg);
      setListError(errMsg);
      setCustomers([]); // Clear old list on failure
    } finally {
      setListLoading(false);
    }
  }, [filterStatus, filterRisk, debouncedSearch, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchList();
  }, [fetchList]);

  // Helper date formatter
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'pending_review':
        return <span className="px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-100 text-xs rounded-full font-medium">İnceleme Bekliyor</span>;
      case 'active':
        return <span className="px-2 py-1 bg-green-50 text-green-700 border border-green-100 text-xs rounded-full font-medium">Aktif</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-50 text-red-700 border border-red-100 text-xs rounded-full font-medium">Reddedildi</span>;
      case 'suspended':
        return <span className="px-2 py-1 bg-orange-50 text-orange-700 border border-orange-100 text-xs rounded-full font-medium">Askıya Alındı</span>;
      case 'closed':
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-medium">Kapalı</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-medium">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cari & Veresiye Sistemi</h1>
          <p className="text-gray-500 mt-1">Limitli alışveriş müşterilerini ve Kredimetre risk durumlarını yönetin.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/cari/qr-okut"
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <Search className="w-4 h-4" />
            <span>QR Okut</span>
          </Link>
          <Link
            href="/admin/cari/yeni-musteri"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Yeni Müşteri Oluştur</span>
          </Link>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-gray-50 text-gray-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Toplam Müşteri</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts.all}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-yellow-50 text-yellow-600 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-yellow-600 font-medium uppercase tracking-wider">Bekleyen Başvuru</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts.pendingReview}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-green-50 text-green-600 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-green-600 font-medium uppercase tracking-wider">Aktif Müşteri</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts.active}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-orange-600 font-medium uppercase tracking-wider">Gecikenler</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts.overdue}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-red-600 font-medium uppercase tracking-wider">Kritik</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts.critical}</div>
          </div>
        </div>
      </div>

      {/* Main Table & Filter Area */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters Top Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ad, telefon veya kart kodu ile arayın..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Customer Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium uppercase">Müşteri Statüsü:</span>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg text-xs font-medium py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Tümü</option>
                <option value="pending_review">Başvuru Bekleyenler</option>
                <option value="active">Aktif</option>
                <option value="suspended">Askıya Alınanlar</option>
                <option value="rejected">Reddedilenler</option>
              </select>
            </div>

            {/* Risk / Kredimetre Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium uppercase">Risk / Skor:</span>
              <select
                value={filterRisk}
                onChange={(e) => { setFilterRisk(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg text-xs font-medium py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Tümü</option>
                <option value="regular">Düzenli (Skor &gt;= 80)</option>
                <option value="follow">Takip (Skor 60-79)</option>
                <option value="risky">Riskli (Skor 40-59)</option>
                <option value="critical">Kritik (Skor &lt; 40)</option>
                <option value="overdue">Gecikenler (Açık Gecikme Var)</option>
                <option value="has_debt">Borcu Olanlar (Bakiye &gt; 0)</option>
                <option value="no_data">Veri Olmayanlar</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error message block */}
        {listError && (
          <div className="m-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-xs font-medium flex gap-2 items-center">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{listError}</span>
          </div>
        )}

        {/* Table Content Area */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-500 border-collapse min-w-[1000px]">
            <thead className="bg-gray-50 text-gray-700 uppercase font-bold border-b border-gray-100">
              <tr>
                <th className="px-4 py-3.5">Müşteri / Telefon</th>
                <th className="px-4 py-3.5">Başvuru Tarihi</th>
                <th className="px-4 py-3.5">Müşteri Statüsü</th>
                <th className="px-4 py-3.5">Hesap Statüsü</th>
                <th className="px-4 py-3.5 text-right">Limit</th>
                <th className="px-4 py-3.5 text-right">Bakiye</th>
                <th className="px-4 py-3.5 text-right">Kullanılabilir</th>
                <th className="px-4 py-3.5 text-right">Gecikmiş Borç</th>
                <th className="px-4 py-3.5 text-right">Maks. Gecikme</th>
                <th className="px-4 py-3.5 text-center">Son Ödeme</th>
                <th className="px-4 py-3.5 text-center">Kredimetre</th>
                <th className="px-4 py-3.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {listLoading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-400 font-medium">
                    Yükleniyor...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-400 font-medium">
                    {listError ? 'Hata nedeniyle veriler yüklenemedi.' : 'Kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.customer_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-gray-900 text-sm">{c.full_name}</div>
                      <div className="text-gray-400 mt-0.5 font-medium">{c.phone}</div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 font-medium">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.cust_status} /></td>
                    <td className="px-4 py-3.5">
                      {c.acc_status ? (
                        <span className="px-2 py-0.5 border rounded-full text-[10px] font-medium bg-gray-50 border-gray-200 text-gray-600 uppercase">
                          {c.acc_status === 'active' ? 'Aktif Hesap' : c.acc_status}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                      {Number(c.credit_limit).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                      {Number(c.current_balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                      {Number(c.available_limit).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </td>
                    <td className={`px-4 py-3.5 text-right font-bold ${Number(c.current_overdue_amount) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {Number(c.current_overdue_amount) > 0
                        ? `${Number(c.current_overdue_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
                        : '0.00 TL'}
                    </td>
                    <td className={`px-4 py-3.5 text-right font-semibold ${c.maximum_days_overdue > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {c.maximum_days_overdue > 0 ? `${c.maximum_days_overdue} Gün` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 font-medium">{formatDate(c.last_payment_at)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <KredimetreBadge
                        score={c.credit_score}
                        label={c.credit_label}
                        color={c.credit_color}
                        paidInstallments={c.paid_installment_count}
                        onTimePaidInstallments={c.on_time_paid_installment_count}
                        currentOverdueAmount={c.current_overdue_amount}
                        maximumDaysOverdue={c.maximum_days_overdue}
                        limitUtilizationPercent={c.limit_utilization_percent}
                        lastPaymentAt={c.last_payment_at}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/admin/cari/kart/${c.card_token}`}
                        className="inline-flex items-center justify-center px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded transition-colors"
                      >
                        İncele
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bottom Bar */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-gray-500 bg-gray-50/50">
          <span>
            Sayfa {totalPages === 0 ? 1 : page} / {totalPages === 0 ? 1 : totalPages} (Toplam {totalResults} kayıt)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || listLoading}
              className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || listLoading}
              className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
