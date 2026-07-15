'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, FileSpreadsheet, ArrowRight, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import { FinancePlanRow, FinanceCustomerRow } from '@/lib/finance/types';

export default function AdminFinansDashboard() {
  const [metrics, setMetrics] = useState({
    activeCount: 0,
    paidCount: 0,
    overdueCount: 0,
    totalFinanced: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    totalInterestCharge: 0,
    dueToday: 0,
    dueNext7Days: 0,
    overdueCustomersCount: 0
  });

  const [plans, setPlans] = useState<Array<FinancePlanRow & { credit_customers: FinanceCustomerRow }>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        // Fetch Metrics & Plans from reports endpoint
        const reportsRes = await fetch(`/api/admin/finance/reports?status=${statusFilter}`);
        const reportsJson = await reportsRes.json();
        if (active && reportsRes.ok && reportsJson.success) {
          setMetrics(reportsJson.metrics);
          setPlans(reportsJson.plans || []);
        }
      } catch (err) {
        console.error('Error fetching finance reports data:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [statusFilter]);

  const handleExportCSV = () => {
    // Redirect to the CSV reports endpoint which triggers native CSV download from the server
    window.location.href = `/api/admin/finance/reports.csv?status=${statusFilter}&searchQuery=${searchQuery}`;
  };

  const filteredPlans = plans.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.source_reference.toLowerCase().includes(query) ||
      (p.credit_customers?.full_name || '').toLowerCase().includes(query) ||
      (p.credit_customers?.phone || '').includes(query)
    );
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Taksitli Satış Yönetimi (Finans MVP)</h1>
          <p className="text-gray-500 mt-1">Cari taksit planlarını, ödemeleri ve gecikmeleri takip edin.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Excel / CSV Aktar</span>
          </button>
          <Link
            href="/admin/finans/yeni"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Yeni Taksitli Plan</span>
          </Link>
        </div>
      </div>

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 uppercase">Aktif Planlar</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{metrics.activeCount}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 uppercase">Toplam Açık Alacak</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{metrics.totalOutstanding.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
        </div>
        <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
          <div className="text-sm font-medium text-red-700 uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span>Gecikmiş Planlar</span>
          </div>
          <div className="text-2xl font-bold text-red-900 mt-2">{metrics.overdueCount} ({metrics.overdueCustomersCount} Müşteri)</div>
        </div>
        <div className="bg-green-50 p-6 rounded-xl border border-green-100 shadow-sm">
          <div className="text-sm font-medium text-green-700 uppercase flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span>Toplam Tahsilat</span>
          </div>
          <div className="text-2xl font-bold text-green-900 mt-2">{metrics.totalCollected.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
        </div>
      </div>

      {/* Daily Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
          <div>
            <div className="text-sm font-medium text-gray-500">Bugün Vadesi Gelen (Açık Taksitler)</div>
            <div className="text-xl font-bold text-gray-900 mt-1">{metrics.dueToday.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
          </div>
          <Clock className="w-8 h-8 text-gray-400" />
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
          <div>
            <div className="text-sm font-medium text-gray-500">7 Gün İçinde Vadesi Gelen</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{metrics.dueNext7Days.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
          </div>
          <CheckCircle className="w-8 h-8 text-blue-400" />
        </div>
      </div>

      {/* Plans Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <h2 className="text-lg font-bold text-gray-900">Taksit Planı Listesi</h2>
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="Kaynak ref, müşteri adı veya telefon..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tüm Durumlar</option>
              <option value="active">Aktif</option>
              <option value="paid">Ödendi</option>
              <option value="overdue">Gecikmiş</option>
              <option value="cancelled">İptal</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">Veriler yükleniyor...</div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Aranan kriterlere uygun finans planı bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                  <th className="p-4">Referans / Kaynak</th>
                  <th className="p-4">Müşteri / Telefon</th>
                  <th className="p-4">Tür</th>
                  <th className="p-4 text-right">Ana Tutar</th>
                  <th className="p-4 text-right">Kalan Borç</th>
                  <th className="p-4">Durum</th>
                  <th className="p-4">Tarih</th>
                  <th className="p-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredPlans.map(p => {
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-semibold text-blue-600">{p.source_reference}</td>
                      <td className="p-4">
                        <div className="font-semibold text-gray-900">{p.credit_customers?.full_name}</div>
                        <div className="text-xs text-gray-500">{p.credit_customers?.phone}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono uppercase">{p.source_type}</span>
                      </td>
                      <td className="p-4 text-right font-medium">{p.principal_amount.toFixed(2)} TL</td>
                      <td className="p-4 text-right font-bold text-red-600">{p.remaining_amount.toFixed(2)} TL</td>
                      <td className="p-4">
                        {p.status === 'active' && <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-semibold">Aktif</span>}
                        {p.status === 'paid' && <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs rounded-full font-semibold">Ödendi</span>}
                        {p.status === 'overdue' && <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs rounded-full font-semibold">Gecikmiş</span>}
                        {p.status === 'cancelled' && <span className="px-2.5 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-semibold">İptal</span>}
                      </td>
                      <td className="p-4 text-gray-500">{new Date(p.created_at).toLocaleDateString('tr-TR')}</td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/admin/finans/${p.id}`}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          <span>Detay</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
