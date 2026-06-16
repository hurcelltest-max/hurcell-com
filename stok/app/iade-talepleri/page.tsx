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
  campaign_benefit_returned?: boolean;
  email_notified_at?: string | null;
  whatsapp_notified_at?: string | null;
  whatsapp_notified_by?: string | null;
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

  const handleToggleCampaignBenefit = async (requestId: string, currentVal: boolean) => {
    try {
      if (!supabase) return;
      const newVal = !currentVal;
      const { error: uError } = await (supabase as any)
        .from("return_requests")
        .update({ campaign_benefit_returned: newVal })
        .eq("id", requestId);
      
      if (uError) throw uError;

      setRequests(requests.map(r => r.id === requestId ? { ...r, campaign_benefit_returned: newVal } : r));
      if (selectedRequest?.id === requestId) {
        setSelectedRequest({ ...selectedRequest, campaign_benefit_returned: newVal });
      }
    } catch (err: any) {
      console.error(err);
      alert("Kampanya faydası durumu güncellenirken hata oluştu: " + err.message);
    }
  };

  const handleWhatsAppNotify = async (request: ReturnRequest) => {
    try {
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      const adminId = session?.user?.id || 'unknown';

      // 1. WhatsApp Mesajını Hazırla
      const phone = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER || '905000000000';
      const msg = `Yeni iade talebi var.
Sipariş No: ${request.order_number_snapshot}
Müşteri: ${request.customer_name}
İletişim: ${request.customer_phone} / ${request.customer_email}
İade Sebebi: ${request.reason}`;

      const encodedMsg = encodeURIComponent(msg);
      const waUrl = `https://wa.me/${phone}?text=${encodedMsg}`;

      // 2. Yeni Sekmede Aç
      window.open(waUrl, '_blank');

      // 3. Veritabanını Güncelle
      const now = new Date().toISOString();
      const { error: uError } = await (supabase as any)
        .from('return_requests')
        .update({ 
          whatsapp_notified_at: now,
          whatsapp_notified_by: adminId
        })
        .eq('id', request.id);

      if (uError) throw uError;

      // 4. State'i Güncelle
      setRequests(requests.map(r => r.id === request.id ? { ...r, whatsapp_notified_at: now, whatsapp_notified_by: adminId } : r));
      if (selectedRequest?.id === request.id) {
        setSelectedRequest({ ...selectedRequest, whatsapp_notified_at: now, whatsapp_notified_by: adminId });
      }

    } catch (err: any) {
      console.error(err);
      alert("WhatsApp bildirim kaydı güncellenirken hata oluştu: " + err.message);
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
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Bildirim & Takip</h4>
                    <button
                      onClick={() => handleWhatsAppNotify(selectedRequest)}
                      className="px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M1.051 21.05a10.96 10.96 0 011.662-5.467L1.135 2.102a1 1 0 011.298-1.298l13.481 1.578a10.96 10.96 0 015.467-1.662C22.684 1.303 23 2.164 23 3.093c0 6.037-4.894 10.93-10.931 10.93a10.96 10.96 0 01-5.467-1.662l-3.957 1.052a1 1 0 01-1.298-1.298l1.052-3.957A10.96 10.96 0 011.303 12c.929 0 1.79.316 2.473.834a9.92 9.92 0 005.155 1.48c5.485 0 9.93-4.445 9.93-9.93 0-2.316-1.127-4.63-2.924-6.332C13.25 1.135 12.389 1.3 12 1.3c-6.037 0-10.93 4.894-10.93 10.93a10.96 10.96 0 001.662 5.467L1.135 21.602a1 1 0 001.298 1.298L4.316 22H1.051z" clipRule="evenodd" />
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      {selectedRequest.whatsapp_notified_at ? "WhatsApp ile Bildirildi" : "WhatsApp ile Bildir"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500">E-Posta Bildirimi</p>
                      <p className="text-[10px] font-bold text-slate-800">
                        {selectedRequest.email_notified_at ? `Gönderildi: ${new Date(selectedRequest.email_notified_at).toLocaleString("tr-TR")}` : "Gönderilmedi veya hata oluştu."}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500">WhatsApp Bildirimi</p>
                      <p className="text-[10px] font-bold text-slate-800">
                        {selectedRequest.whatsapp_notified_at ? `Gönderildi: ${new Date(selectedRequest.whatsapp_notified_at).toLocaleString("tr-TR")}` : "Henüz bildirilmedi."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[9px] font-mono">Kampanya Durumu</h4>
                  <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <input
                      type="checkbox"
                      checked={selectedRequest.campaign_benefit_returned || false}
                      onChange={() => handleToggleCampaignBenefit(selectedRequest.id, selectedRequest.campaign_benefit_returned || false)}
                      className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="font-semibold text-xs text-slate-800">Müşteri kampanya faydasını (hediye vb.) iade etti</span>
                  </label>
                  <p className="text-[9px] text-slate-500">
                    Eğer bu ürün kampanyalı satılmışsa, kampanya faydasının iade edilip edilmediğini buradan takip edebilirsiniz.
                  </p>
                </div>

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
