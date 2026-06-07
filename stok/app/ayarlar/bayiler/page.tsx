'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Dealer = {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string;
  tax_number: string | null;
  city: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'passive';
  created_at: string;
};

export default function B2bDealersAdminPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'passive'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  const fetchDealers = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('b2b_dealers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching B2B dealers:', error);
      } else {
        setDealers(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDealers();
  }, []);

  const handleUpdateStatus = async (dealerId: string, newStatus: 'approved' | 'rejected' | 'passive') => {
    if (!supabase) return;
    setActionLoading(dealerId);
    setStatusMsg({ type: '', text: '' });

    try {
      const { error } = await (supabase as any)
        .from('b2b_dealers')
        .update({ status: newStatus })
        .eq('id', dealerId);

      if (error) {
        console.error('Error updating dealer status:', error);
        setStatusMsg({ type: 'error', text: `Durum güncellenirken hata oluştu: ${error.message}` });
      } else {
        setStatusMsg({ type: 'success', text: 'Bayilik durumu başarıyla güncellendi.' });
        // Refresh local state
        setDealers((prev) =>
          prev.map((d) => (d.id === dealerId ? { ...d, status: newStatus } : d))
        );
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Sistem hatası.' });
    } finally {
      setActionLoading(null);
    }
  };

  // Filter list by active tab status
  const filteredDealers = dealers.filter((d) => d.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
          Yönetim Paneli
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">B2B Bayi Yönetimi</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bayi adaylarının başvurularını onaylayabilir, reddedebilir veya bayilik durumlarını yönetebilirsiniz.
        </p>
      </div>

      {/* Status Alert */}
      {statusMsg.text && (
        <div
          className={`rounded-2xl p-4 text-sm border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 bg-white rounded-3xl p-1.5 border gap-1 shadow-sm shadow-slate-900/5">
        {(['pending', 'approved', 'rejected', 'passive'] as const).map((tab) => {
          const count = dealers.filter((d) => d.status === tab).length;
          const labelMap = {
            pending: 'Bekleyenler',
            approved: 'Onaylananlar',
            rejected: 'Reddedilenler',
            passive: 'Pasifler',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-2xl py-3 text-xs font-semibold tracking-wide transition cursor-pointer ${
                activeTab === tab
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {labelMap[tab]} ({count})
            </button>
          );
        })}
      </div>

      {/* List content */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
            <p className="text-sm text-slate-500">Bayi listesi yükleniyor...</p>
          </div>
        </div>
      ) : filteredDealers.length === 0 ? (
        <div className="flex min-h-[20vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="text-3xl">👥</span>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Kayıt Bulunmamaktadır</h3>
          <p className="mt-1 text-xs text-slate-500">Bu sekmede gösterilecek bir bayi başvurusu bulunmuyor.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDealers.map((d) => (
            <div
              key={d.id}
              className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col md:flex-row md:items-start md:justify-between gap-6"
            >
              {/* Info Column */}
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{d.company_name}</h3>
                  <p className="text-xs text-sky-600 font-semibold mt-0.5">Yetkili: {d.contact_name}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>📞</span>
                    <span>{d.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>✉️</span>
                    <span>{d.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🏢</span>
                    <span>Vergi No: {d.tax_number || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📍</span>
                    <span>Bölge: {d.city || '—'}</span>
                  </div>
                </div>

                {d.note && (
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-600">
                    <p className="font-bold text-slate-500 mb-1">Aday Notu:</p>
                    <p className="leading-relaxed">{d.note}</p>
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400">
                  Başvuru Tarihi: {new Date(d.created_at).toLocaleString('tr-TR')}
                </p>
              </div>

              {/* Action Buttons Column */}
              <div className="flex flex-wrap md:flex-col gap-2 shrink-0 md:justify-start">
                {d.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(d.id, 'approved')}
                      disabled={actionLoading !== null}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/10 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === d.id ? 'İşleniyor...' : '✓ Onayla'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(d.id, 'rejected')}
                      disabled={actionLoading !== null}
                      className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-rose-600/10 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === d.id ? 'İşleniyor...' : '✕ Reddet'}
                    </button>
                  </>
                )}

                {d.status === 'approved' && (
                  <button
                    onClick={() => handleUpdateStatus(d.id, 'passive')}
                    disabled={actionLoading !== null}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-amber-600/10 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading === d.id ? 'İşleniyor...' : 'Pasife Al'}
                  </button>
                )}

                {(d.status === 'rejected' || d.status === 'passive') && (
                  <button
                    onClick={() => handleUpdateStatus(d.id, 'approved')}
                    disabled={actionLoading !== null}
                    className="rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-sky-600/10 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading === d.id ? 'İşleniyor...' : 'Tekrar Aktif Et'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
