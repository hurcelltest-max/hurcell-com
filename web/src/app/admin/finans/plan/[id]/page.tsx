'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, AlertCircle, Receipt, Trash2 } from 'lucide-react';
import { FinancePlanRow, FinanceCustomerRow, FinanceInstallmentRow, FinanceCollectionRow } from '@/lib/finance/types';

export default function AdminFinansPlanDetay() {
  const params = useParams();
  const id = params.id as string;

  const [plan, setPlan] = useState<(FinancePlanRow & { credit_customers?: FinanceCustomerRow }) | null>(null);
  const [installments, setInstallments] = useState<Array<FinanceInstallmentRow>>([]);
  const [collections, setCollections] = useState<Array<FinanceCollectionRow>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; actor: string; reason?: string; created_at: string }>>([]);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Collection Form State
  const [colAmount, setColAmount] = useState('');
  const [colMethod, setColMethod] = useState('cash');
  const [colKind, setColKind] = useState('installment_payment');
  const [colNote, setColNote] = useState('Taksit Ödemesi');
  const [colLoading, setColLoading] = useState(false);

  // Cancellation State
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finance/plans/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Plan yüklenemedi.');
      
      setPlan(json.plan);
      setInstallments(json.installments || []);
      setCollections(json.collections || []);
      setAuditLogs(json.auditLogs || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err) || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => fetchDetail(), 0);
    return () => clearTimeout(t);
  }, [fetchDetail]);

  const handleRecordCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;

    const amount = parseFloat(colAmount);
    if (amount <= 0 || isNaN(amount)) {
      setErrorMsg('Ödeme tutarı sıfırdan büyük olmalıdır.');
      return;
    }

    setColLoading(true);
    setErrorMsg('');

    try {
      const idempotencyKey = `pay:${plan.id}:${Date.now()}`;
      const res = await fetch('/api/admin/finance/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          amount,
          paymentMethod: colMethod,
          collectionKind: colKind,
          idempotencyKey,
          note: colNote
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ödeme alınamadı.');

      setColAmount('');
      fetchDetail();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err) || 'Ödeme alınırken hata oluştu.');
    } finally {
      setColLoading(false);
    }
  };

  const handleCancelPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !cancelReason.trim()) return;

    setCancelLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/admin/finance/plans/${plan.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Plan iptal edilemedi.');

      setShowCancelModal(false);
      setCancelReason('');
      fetchDetail();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err) || 'İptal işlemi sırasında hata oluştu.');
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Veriler yükleniyor...</div>;
  }

  if (errorMsg && !plan) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/finans" className="text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 font-sans">
            Plan Detay: <span className="text-blue-600">{plan.source_reference}</span>
          </h1>
        </div>
        {plan.status !== 'cancelled' && plan.amount_paid === 0 && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 rounded-lg font-semibold transition-colors border border-red-200"
          >
            <Trash2 className="w-4 h-4" />
            <span>Planı İptal Et</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Plan Info Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase">Müşteri & Hesap Bilgileri</h2>
          <div>
            <div className="text-xs text-gray-500">Müşteri Adı</div>
            <div className="font-semibold text-gray-900 mt-0.5">{plan.credit_customers?.full_name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Telefon Numarası</div>
            <div className="font-semibold text-gray-900 mt-0.5">{plan.credit_customers?.phone}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Kalan Toplam Borç</div>
            <div className="text-lg font-bold text-red-600 mt-0.5">{plan.remaining_amount.toFixed(2)} TL</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase">Finansal Detaylar</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Finanse Edilen Ana Tutar</div>
              <div className="font-semibold text-gray-900 mt-0.5">{plan.financed_principal.toFixed(2)} TL</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Peşinat Ödemesi</div>
              <div className="font-semibold text-gray-900 mt-0.5">{plan.down_payment_amount.toFixed(2)} TL</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Vade Farkı Tutarı</div>
              <div className="font-semibold text-gray-900 mt-0.5">{plan.finance_charge_amount.toFixed(2)} TL</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Taksit Sayısı</div>
              <div className="font-semibold text-gray-900 mt-0.5">{plan.installment_count} Ay</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase">Sözleşme Bilgileri</h2>
          <div>
            <div className="text-xs text-gray-500">Kaynak Satış Kodu / Referans</div>
            <div className="font-semibold text-gray-900 mt-0.5">{plan.source_reference} ({plan.source_type})</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Oluşturulma Tarihi</div>
            <div className="font-semibold text-gray-900 mt-0.5">{new Date(plan.created_at).toLocaleDateString('tr-TR')}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Sözleşme Durumu</div>
            <div className="mt-1">
              {plan.status === 'active' && <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-semibold">Aktif</span>}
              {plan.status === 'paid' && <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs rounded-full font-semibold">Ödendi</span>}
              {plan.status === 'overdue' && <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs rounded-full font-semibold">Gecikmiş</span>}
              {plan.status === 'cancelled' && <span className="px-2.5 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-semibold">İptal Edildi</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Installments, Right Pay Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Installment Plan */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-md font-bold text-gray-900">Taksit Planı ve Ödeme Durumu</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {installments.map(inst => (
              <div key={inst.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <div className="font-bold text-gray-900">{inst.installment_no}. Taksit</div>
                  <div className="text-xs text-gray-500 mt-0.5">Vade Tarihi: {new Date(inst.due_date).toLocaleDateString('tr-TR')}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{inst.amount_due.toFixed(2)} TL</div>
                  <div className="text-xs text-gray-500 mt-0.5">Ödenen: {inst.amount_paid.toFixed(2)} TL</div>
                </div>
                <div>
                  {inst.status === 'pending' && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">Bekliyor</span>}
                  {inst.status === 'partial' && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded font-medium">Kısmi Ödendi</span>}
                  {inst.status === 'paid' && <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded font-medium">Ödendi</span>}
                  {inst.status === 'overdue' && <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded font-medium">Gecikmiş</span>}
                  {inst.status === 'cancelled' && <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded font-medium">İptal</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collection / Pay Form */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-md font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gray-600" />
            <span>Ödeme Al (Tahsilat)</span>
          </h2>
          
          {plan.status === 'paid' ? (
            <div className="p-4 bg-green-50 border border-green-100 text-green-800 rounded-lg text-sm font-medium">
              Sözleşmenin tüm taksitleri ödenmiştir. Yeni tahsilat yapılamaz.
            </div>
          ) : plan.status === 'cancelled' ? (
            <div className="p-4 bg-gray-50 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium">
              İptal edilmiş planlarda işlem yapılamaz.
            </div>
          ) : (
            <form onSubmit={handleRecordCollection} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tutar (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ör. 333.33"
                  value={colAmount}
                  onChange={e => setColAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tahsilat Türü</label>
                <select
                  value={colKind}
                  onChange={e => setColKind(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="installment_payment">Taksit Ödemesi</option>
                  <option value="early_closure">Erken Kapatma</option>
                  <option value="adjustment">Düzeltme</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ödeme Yöntemi</label>
                <select
                  value={colMethod}
                  onChange={e => setColMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="cash">Nakit</option>
                  <option value="card">Banka / Kredi Kartı</option>
                  <option value="bank_transfer">Havale / EFT</option>
                  <option value="other">Diğer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Açıklama / Not</label>
                <input
                  type="text"
                  value={colNote}
                  onChange={e => setColNote(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={colLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>Tahsilat Kaydet</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Collections History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-md font-bold text-gray-900">Tahsilat Geçmişi</h2>
        </div>
        {collections.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Henüz bir tahsilat yapılmamıştır.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                  <th className="p-4">Tarih</th>
                  <th className="p-4">Makbuz No</th>
                  <th className="p-4">Tür / Yöntem</th>
                  <th className="p-4">Açıklama</th>
                  <th className="p-4 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {collections.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{new Date(c.collected_at).toLocaleString('tr-TR')}</td>
                    <td className="p-4 font-mono font-bold text-gray-900">{c.receipt_number}</td>
                    <td className="p-4 font-medium uppercase text-xs">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700 mr-2">{c.collection_kind.replace('_', ' ')}</span>
                      <span className="px-2 py-0.5 bg-blue-50 rounded text-blue-700">{c.payment_method}</span>
                    </td>
                    <td className="p-4 text-gray-700">{c.note}</td>
                    <td className="p-4 text-right font-bold text-green-600">
                      {c.amount.toFixed(2)} TL
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-md font-bold text-gray-900">İşlem Geçmişi (Audit Logs)</h2>
        </div>
        <div className="divide-y divide-gray-200 text-sm max-h-60 overflow-y-auto">
          {auditLogs.map(log => (
            <div key={log.id} className="p-4 hover:bg-gray-50 flex justify-between items-start gap-4">
              <div>
                <div className="font-semibold text-gray-900 capitalize">{log.action.replace('_', ' ')}</div>
                <div className="text-xs text-gray-500 mt-0.5">{log.reason}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-medium text-gray-800">{log.actor}</div>
                <div className="text-xs text-gray-500 mt-0.5">{new Date(log.created_at).toLocaleString('tr-TR')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel Plan Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Planı İptal Et</h3>
            <p className="text-sm text-gray-500">Plan iptal edildiğinde tüm taksitler iptal edilecek, cari bakiye azaltılacak ve ledger&apos;a ters kayıtlar girilecektir.</p>
            <form onSubmit={handleCancelPlan} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">İptal Gerekçesi (Zorunlu)</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  placeholder="İptal sebebini açıklayın..."
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {cancelLoading ? 'İptal Ediliyor...' : 'Planı İptal Et'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
