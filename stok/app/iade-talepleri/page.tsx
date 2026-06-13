"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface ReturnRequest {
  id: string;
  order_id: string;
  order_number_snapshot: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  request_type: "cancel" | "return" | "exchange";
  reason: string;
  description: string | null;
  status: "pending" | "reviewing" | "approved" | "rejected" | "completed";
  created_at: string;
  updated_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  cancel: "İptal Talebi",
  return: "İade Talebi",
  exchange: "Değişim Talebi"
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Beklemede",
  reviewing: "İncelemede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  completed: "Tamamlandı"
};

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  reviewing: "bg-blue-50 text-blue-700 border-blue-100",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
  completed: "bg-slate-50 text-slate-600 border-slate-200"
};

export default function ReturnRequestsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [filterType, setFilterType] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) return;
      const { data, error: rError } = await (supabase as any)
        .from("return_requests")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (rError) throw rError;
      setRequests(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    try {
      if (!supabase) return;
      const { error: uError } = await (supabase as any)
        .from("return_requests")
        .update({ status: newStatus })
        .eq("id", requestId);
      if (uError) throw uError;

      alert("Talep durumu başarıyla güncellendi.");
      
      // Update local states
      setRequests(requests.map(r => r.id === requestId ? { ...r, status: newStatus as any } : r));
      if (selectedRequest?.id === requestId) {
        setSelectedRequest({ ...selectedRequest, status: newStatus as any });
      }
    } catch (err: any) {
      console.error(err);
      alert("Durum güncellenirken hata oluştu: " + err.message);
    }
  };

  const filteredRequests = requests.filter(r => {
    const matchesType = filterType === "All" || r.request_type === filterType;
    const matchesStatus = filterStatus === "All" || r.status === filterStatus;
    return matchesType && matchesStatus;
  });

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-6 py-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">MÜŞTERİ TALEPLERİ</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">İade & İptal Talepleri</h2>
          </div>
          <button
            onClick={loadRequests}
            className="rounded-2xl border border-slate-250 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-5 py-3 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">Talep Tipi:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="All">Tümü</option>
            <option value="cancel">İptal Talebi</option>
            <option value="return">İade Talebi</option>
            <option value="exchange">Değişim Talebi</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">Durum:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="All">Tümü</option>
            <option value="pending">Beklemede</option>
            <option value="reviewing">İncelemede</option>
            <option value="approved">Onaylandı</option>
            <option value="rejected">Reddedildi</option>
            <option value="completed">Tamamlandı</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Yükleniyor...</div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* List panel */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-sm font-mono tracking-wider uppercase text-slate-450">Talepler ({filteredRequests.length})</h3>
            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {filteredRequests.length === 0 ? (
                  <p className="p-8 text-sm text-slate-450 text-center">Talep bulunamadı.</p>
                ) : (
                  filteredRequests.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className={`p-5 transition-all cursor-pointer flex justify-between items-start gap-4 ${
                        selectedRequest?.id === req.id ? "bg-slate-50/80 border-l-4 border-blue-600 pl-4" : "hover:bg-slate-50/30"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-800">{req.order_number_snapshot}</h4>
                          <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5">
                            {TYPE_LABELS[req.request_type]}
                          </span>
                          <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-lg ${STATUS_BADGES[req.status]}`}>
                            {STATUS_LABELS[req.status]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">{req.customer_name}</p>
                        <p className="text-[10px] text-slate-450">Neden: {req.reason}</p>
                        <p className="text-[9px] text-slate-400 font-light">{new Date(req.created_at).toLocaleString("tr-TR")}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Details panel */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-sm font-mono tracking-wider uppercase text-slate-450">Talep Detayları</h3>
            {selectedRequest ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 text-xs">
                <div className="pb-3 border-b border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900">{selectedRequest.order_number_snapshot}</span>
                    <span className={`text-[10px] font-bold border px-2 py-1 rounded-lg ${STATUS_BADGES[selectedRequest.status]}`}>
                      {STATUS_LABELS[selectedRequest.status]}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">Talep ID: {selectedRequest.id}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Müşteri İletişim Bilgileri</h4>
                  <p className="font-bold text-slate-800">{selectedRequest.customer_name}</p>
                  <p className="text-slate-600">Telefon: {selectedRequest.customer_phone}</p>
                  <p className="text-slate-600">E-Posta: {selectedRequest.customer_email}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Talep Tipi</h4>
                  <p className="font-semibold text-slate-700">{TYPE_LABELS[selectedRequest.request_type]}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Neden / Sebep</h4>
                  <p className="text-slate-700 leading-relaxed font-semibold">{selectedRequest.reason}</p>
                </div>

                {selectedRequest.description && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Açıklama / Notlar</h4>
                    <p className="text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">{selectedRequest.description}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Durumu Güncelle</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(STATUS_LABELS).map((statusKey) => (
                      <button
                        key={statusKey}
                        onClick={() => handleUpdateStatus(selectedRequest.id, statusKey)}
                        disabled={selectedRequest.status === statusKey}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer border ${
                          selectedRequest.status === statusKey
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {STATUS_LABELS[statusKey]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-light italic mt-2">
                    * Bu panel üzerinden yapılan onaylama işlemleri bilgilendirme amaçlıdır. Ödeme kuruluşu üzerinden otomatik iade işlemi tetiklenmez.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white/50 border-dashed p-12 text-center text-xs text-slate-400 space-y-1">
                <p>Talep detaylarını görüntülemek ve durumu güncellemek için listeden bir talep seçin.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
