'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle,
  Banknote,
  Coins,
  ShieldAlert,
  ArrowLeft,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { KasaCreditCustomer, KasaFXRatesResponse } from '@/lib/kasa/types';

function formatTL(tl: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(tl);
}

function AdminKasaCariContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'all';

  const [customers, setCustomers] = useState<KasaCreditCustomer[]>([]);
  const [fxRates, setFxRates] = useState<KasaFXRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(initialFilter);

  // Tahsilat Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<KasaCreditCustomer | null>(null);
  const [amountTL, setAmountTL] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'usd' | 'eur'>('cash');
  const [usdPaid, setUsdPaid] = useState('');
  const [eurPaid, setEurPaid] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cRes, rRes] = await Promise.all([
        fetch('/api/admin/kasa/credit-customers'),
        fetch('/api/kasa/rates'),
      ]);

      if (cRes.ok) {
        const cData = await cRes.json();
        setCustomers(cData.customers || []);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setFxRates(rData.rates);
      }
    } catch {
      setError('Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCollectionModal = (customer: KasaCreditCustomer) => {
    setSelectedCustomer(customer);
    setAmountTL(customer.current_balance_tl.toString());
    setPaymentMethod('cash');
    setUsdPaid('');
    setEurPaid('');
    setDescription('');
    setError(null);
    setSuccess(null);
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setError(null);
    setSuccess(null);

    const amtNum = Number(amountTL) || 0;
    if (amtNum <= 0) return setError('Lütfen geçerli bir tahsilat tutarı girin.');
    if (amtNum > selectedCustomer.current_balance_tl + 0.05) {
      return setError(`Tahsilat tutarı müşterinin mevcut açık borcundan (${formatTL(selectedCustomer.current_balance_tl)}) fazla olamaz.`);
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/kasa/credit-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credit_customer_id: selectedCustomer.id,
          amount_tl: amtNum,
          payment_method: paymentMethod,
          usd_paid: paymentMethod === 'usd' ? Number(usdPaid) : undefined,
          usd_rate: paymentMethod === 'usd' ? fxRates?.usdRate : undefined,
          eur_paid: paymentMethod === 'eur' ? Number(eurPaid) : undefined,
          eur_rate: paymentMethod === 'eur' ? fxRates?.eurRate : undefined,
          description: description.trim() || `Cari Borç Tahsilatı (${selectedCustomer.full_name})`,
          idempotency_key: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tahsilat kaydedilemedi.');

      setSuccess(`Tahsilat Başarıyla Kaydedildi! Kalan Borç: ${formatTL(selectedCustomer.current_balance_tl - amtNum)}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      setTimeout(() => {
        setSelectedCustomer(null);
        loadData();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Tahsilat başarısız.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtreleme
  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQ = q === '' || c.full_name.toLowerCase().includes(q) || c.phone.includes(q);

    if (!matchesQ) return false;
    if (filterType === 'open') return c.current_balance_tl > 0;
    if (filterType === 'overdue') return c.is_overdue && c.current_balance_tl > 0;
    if (filterType === 'closed') return c.current_balance_tl === 0;
    return true;
  });

  const totalOpenCredit = customers.reduce((sum, c) => sum + c.current_balance_tl, 0);
  const totalOverdueCredit = customers.filter((c) => c.is_overdue).reduce((sum, c) => sum + c.current_balance_tl, 0);
  const overdueCount = customers.filter((c) => c.is_overdue && c.current_balance_tl > 0).length;

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Cari takip verileri yükleniyor...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/kasa')}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <CreditCard className="text-amber-600" size={26} /> Cari Müşteri Borç & Tahsilat Yönetimi
          </h1>
          <p className="text-xs text-slate-500">Müşteri cari limitleri, açık veresiyeler ve 7 günlük gecikme takibi</p>
        </div>
      </div>

      {/* METRİK ÖZET KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Toplam Açık Cari Alacak</span>
          <div className="text-2xl font-black text-amber-900">{formatTL(totalOpenCredit)}</div>
          <div className="text-[11px] text-slate-500">Tahsilat bekleyen veresiye bakiyeleri</div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm space-y-1 ${totalOverdueCredit > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <span className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1">
            <Clock size={14} /> 7+ Gün Geciken Cari Alacak
          </span>
          <div className="text-2xl font-black text-red-950">{formatTL(totalOverdueCredit)}</div>
          <div className="text-[11px] font-bold text-red-800">{overdueCount} Müşteride 7 günü geçmiş alacak var</div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">İhtiyatlı Risk Metriği</span>
          <div className="text-2xl font-black text-amber-400">-{formatTL(totalOpenCredit)}</div>
          <div className="text-[11px] text-slate-300">Ödenene kadar tamamı risk olarak izlenir</div>
        </div>
      </div>

      {/* ARAMA VE FİLTRE TABS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Müşteri Adı veya Telefon Ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Tüm Cariler ({customers.length})
            </button>

            <button
              onClick={() => setFilterType('open')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'open' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Açık Borçlular ({customers.filter((c) => c.current_balance_tl > 0).length})
            </button>

            <button
              onClick={() => setFilterType('overdue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'overdue' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              ⚠️ 7+ Gün Gecikenler ({overdueCount})
            </button>

            <button
              onClick={() => setFilterType('closed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'closed' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Borcu Kapananlar ({customers.filter((c) => c.current_balance_tl === 0).length})
            </button>
          </div>
        </div>
      </div>

      {/* MÜŞTERİ TABLOSU */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                <th className="p-3">Müşteri Adı & Telefon</th>
                <th className="p-3">Cari Limit</th>
                <th className="p-3">Açık Borç</th>
                <th className="p-3">Gecikme Durumu</th>
                <th className="p-3">Durum</th>
                <th className="p-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-medium text-xs">
                    Kriterlere uygun cari müşteri kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${c.is_overdue ? 'bg-red-50/40' : ''}`}>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{c.full_name}</div>
                      <div className="text-xs text-slate-500">{c.phone}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-semibold text-slate-700">{formatTL(c.credit_limit_tl)}</div>
                      <div className="text-[10px] text-slate-400">Kullanılabilir: {formatTL(c.available_limit_tl)}</div>
                    </td>

                    <td className="p-3">
                      <div className={`font-black ${c.current_balance_tl > 0 ? 'text-amber-900' : 'text-slate-500'}`}>
                        {formatTL(c.current_balance_tl)}
                      </div>
                    </td>

                    <td className="p-3">
                      {c.current_balance_tl > 0 ? (
                        c.is_overdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 font-extrabold text-xs rounded-xl border border-red-300">
                            <Clock size={14} /> {c.max_overdue_days} GÜNDÜR GECİKTİ (7+ Gün)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 font-medium">
                            {c.max_overdue_days > 0 ? `${c.max_overdue_days} gündür takipte` : 'Yeni veresiye'}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-emerald-600 font-bold">✅ Borç Yok</span>
                      )}
                    </td>

                    <td className="p-3">
                      {c.is_approved ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg">
                          Aktif Onaylı
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-lg">
                          Limit Tanımsız
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      {c.current_balance_tl > 0 && (
                        <button
                          onClick={() => handleOpenCollectionModal(c)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-1"
                        >
                          <Banknote size={14} /> Tahsilat Al
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TAHSİLAT MODALI */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Banknote className="text-emerald-600" size={22} /> Cari Borç Tahsilatı Al
            </h3>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <div>Müşteri: <strong>{selectedCustomer.full_name}</strong></div>
              <div>Mevcut Açık Borç: <strong>{formatTL(selectedCustomer.current_balance_tl)}</strong></div>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">{error}</div>}
            {success && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">{success}</div>}

            <form onSubmit={handleCollectPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Tahsil Edilecek Tutar (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountTL}
                  onChange={(e) => setAmountTL(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Ödeme Yöntemi *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-2 font-bold rounded-xl text-xs border ${paymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    💵 Nakit TL
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`py-2 font-bold rounded-xl text-xs border ${paymentMethod === 'card' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    💳 Kredi Kartı
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usd')}
                    className={`py-2 font-bold rounded-xl text-xs border ${paymentMethod === 'usd' ? 'bg-cyan-700 text-white border-cyan-700' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    💲 USD Nakit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('eur')}
                    className={`py-2 font-bold rounded-xl text-xs border ${paymentMethod === 'eur' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    💶 EUR Nakit
                  </button>
                </div>
              </div>

              {paymentMethod === 'usd' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">USD Miktarı ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Örn: 100"
                    value={usdPaid}
                    onChange={(e) => setUsdPaid(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                  />
                </div>
              )}

              {paymentMethod === 'eur' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">EUR Miktarı (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Örn: 100"
                    value={eurPaid}
                    onChange={(e) => setEurPaid(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Açıklama</label>
                <input
                  type="text"
                  placeholder="Tahsilat notu..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Kaydediliyor...' : 'Tahsilatı Onayla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminKasaCariPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 font-medium">Yükleniyor...</div>}>
      <AdminKasaCariContent />
    </Suspense>
  );
}
