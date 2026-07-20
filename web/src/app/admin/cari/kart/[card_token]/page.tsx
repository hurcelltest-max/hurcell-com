'use client';

import React, { useEffect, useState, use, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { Phone, MapPin, AlertCircle, FileText, Calendar, CreditCard, ChevronLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import TransactionList from '@/components/admin/cari/TransactionList';
import TransactionForm from '@/components/admin/cari/TransactionForm';
import KredimetreDetailCard from '@/components/admin/KredimetreDetailCard';

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

export default function CariKartPage(props: { params: Promise<{ card_token: string }> }) {
  const params = use(props.params);
  const token = params.card_token;
  const [customer, setCustomer] = useState<{ id: string; full_name: string; phone: string; tc_kimlik: string; city: string; district: string; address: string; notes: string; status: string; created_at: string; customer_card_code: string; credit_accounts?: { available_limit: number; credit_limit: number; current_balance: number; statement_day: number; status: string }[]; credit_audit_logs?: Array<{ id: string; action_type: string; new_value?: Record<string, unknown>; admin_users?: { username: string }; created_at: string }>; credit_agreement_acceptances?: Array<Record<string, unknown>>; account?: { available_limit: number; credit_limit: number; current_balance: number; statement_day: number; status: string } } | null>(null);
  const [transactions, setTransactions] = useState<Array<{ id: string; transaction_type: string; amount_cents: number; description: string; created_at: string; status: string }>>([]);
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_by: string; created_at: string; admin_users: { username: string } }>>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Kredimetre State
  const [kredimetre, setKredimetre] = useState<{
    credit_score: number | null;
    credit_label: string;
    credit_color: string;
    paid_installment_count: number;
    on_time_paid_installment_count: number;
    current_overdue_amount: number;
    maximum_days_overdue: number;
    limit_utilization_percent: number;
    last_payment_at: string | null;
    total_plan_count: number;
    due_installment_count: number;
  } | null>(null);
  const [kredimetreLoading, setKredimetreLoading] = useState(true);
  const [kredimetreError, setKredimetreError] = useState(false);

  const [financeSummary, setFinanceSummary] = useState<{
    plans: Array<{
      id: string;
      source_reference: string;
      source_type: string;
      principal_amount: number;
      down_payment_amount: number;
      finance_charge_amount: number;
      total_due_amount: number;
      status: string;
      created_at: string;
    }>;
    installments: Array<{
      id: string;
      finance_plan_id: string;
      installment_no: number;
      due_date: string;
      principal_amount: number;
      finance_charge_amount: number;
      amount_due: number;
      amount_paid: number;
      remaining_amount: number;
      status: string;
      finance_plans?: { source_reference: string };
    }>;
    collections: Array<{
      id: string;
      amount: number;
      collected_at: string;
    }>;
  }>({ plans: [], installments: [], collections: [] });
  
  // Review Form State
  const [decision, setDecision] = useState<'approve'|'reject'|'suspend'|''>('');
  const [limit, setLimit] = useState<string>('0');
  const getInitialStatementDay = () => {
    const day = new Date().getDate();
    if (day <= 10) return 10;
    if (day <= 15) return 15;
    if (day <= 20) return 20;
    if (day <= 25) return 25;
    return 10;
  };

  const [statementDay, setStatementDay] = useState<number>(getInitialStatementDay());
  const [reason, setReason] = useState<string>('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Race condition guard
  const requestIdRef = useRef(0);

  const fetchNotes = async (customerId: string, reqId: number) => {
    try {
      const res = await fetch(`/api/admin/cari/notlar?customerId=${customerId}`);
      const data = await res.json();
      if (res.ok && reqId === requestIdRef.current) {
        setNotes(data.notes);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomer = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    // Reset review states immediately
    setDecision('');
    setReason('');
    setReviewError('');

    // Clear stale Kredimetre / Customer data before fetching new customer
    setLoading(true);
    setError('');
    setCustomer(null);
    setTransactions([]);
    setNotes([]);
    setFinanceSummary({
      plans: [],
      installments: [],
      collections: []
    });

    setKredimetre(null);
    setKredimetreError(false);
    setKredimetreLoading(true);

    try {
      const res = await fetch(`/api/admin/cari/musteri/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (requestId !== requestIdRef.current) return;

      setCustomer(data.customer);
      setTransactions(data.transactions || []);
      fetchNotes(data.customer.id, requestId);
      
      const account = data.customer.credit_accounts?.[0];
      if (account) {
        setLimit(account.credit_limit.toString());
        setStatementDay(account.statement_day || getInitialStatementDay());
      }

      // Card code validation
      const customerCardCode = typeof data.customer.customer_card_code === 'string'
        ? data.customer.customer_card_code.trim()
        : '';

      if (!customerCardCode) {
        setKredimetre(null);
        setKredimetreError(true);
        setKredimetreLoading(false);
      } else {
        // Fetch Kredimetre details from /api/admin/cari/list?search=
        try {
          const krRes = await fetch(`/api/admin/cari/list?search=${encodeURIComponent(customerCardCode)}`);
          const krJson = await krRes.json();

          if (requestId !== requestIdRef.current) return;

          if (krRes.ok && Array.isArray(krJson?.data)) {
            const matchingCustomer = krJson.data.find(
              (c: {
                customer_id: string;
                customer_card_code: string;
                credit_score: number | null;
                credit_label: string;
                credit_color: string;
                paid_installment_count: number;
                on_time_paid_installment_count: number;
                current_overdue_amount: number;
                maximum_days_overdue: number;
                limit_utilization_percent: number;
                last_payment_at: string | null;
                total_plan_count: number;
                due_installment_count: number;
              }) => c.customer_id === data.customer.id && c.customer_card_code === customerCardCode
            );
            if (matchingCustomer) {
              setKredimetre({
                credit_score: matchingCustomer.credit_score,
                credit_label: matchingCustomer.credit_label,
                credit_color: matchingCustomer.credit_color,
                paid_installment_count: matchingCustomer.paid_installment_count,
                on_time_paid_installment_count: matchingCustomer.on_time_paid_installment_count,
                current_overdue_amount: matchingCustomer.current_overdue_amount,
                maximum_days_overdue: matchingCustomer.maximum_days_overdue,
                limit_utilization_percent: matchingCustomer.limit_utilization_percent,
                last_payment_at: matchingCustomer.last_payment_at,
                total_plan_count: matchingCustomer.total_plan_count,
                due_installment_count: matchingCustomer.due_installment_count,
              });
            } else {
              setKredimetre(null);
              setKredimetreError(true);
            }
          } else {
            setKredimetre(null);
            setKredimetreError(true);
          }
        } catch (kErr) {
          console.error('Error fetching customer Kredimetre details:', kErr);
          if (requestId === requestIdRef.current) {
            setKredimetreError(true);
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setKredimetreLoading(false);
          }
        }
      }

      // Fetch Finance Summary
      try {
        const finRes = await fetch(`/api/admin/finance/summary/${data.customer.id}`);
        const finJson = await finRes.json();

        if (requestId !== requestIdRef.current) return;

        if (finRes.ok && finJson.success) {
          setFinanceSummary(finJson);
        }
      } catch (fErr) {
        console.error('Error fetching customer finance summary:', fErr);
      }
    } catch (err: unknown) {
      if (requestId === requestIdRef.current) {
        setError((err instanceof Error ? err.message : String(err)));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [token]);


  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNoteLoading(true);
    try {
      const res = await fetch('/api/admin/cari/notlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer?.id, note: newNote })
      });
      if (res.ok) {
        setNewNote('');
        if (customer) {
          await fetchNotes(customer.id, requestIdRef.current);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision) {
      setReviewError('Lütfen bir karar seçiniz.');
      return;
    }
    if (!reason.trim()) {
      setReviewError('Sebep girmek zorunludur.');
      return;
    }
    
    // Warning for approve with 0 limit
    if (decision === 'approve' && parseFloat(limit) === 0) {
      if (!window.confirm("Dikkat! Müşteriyi 0 limitle onaylıyorsunuz. Emin misiniz?")) {
        return;
      }
    }

    setReviewLoading(true);
    setReviewError('');
    try {
      const payloadLimit = decision === 'reject' || decision === '' ? '0' : limit;
      
      const res = await fetch('/api/admin/cari/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          decision,
          limit: payloadLimit,
          statementDay,
          reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Refresh customer data
      alert('İnceleme başarıyla kaydedildi.');
      setDecision('');
      setReason('');
      fetchCustomer();
    } catch (err: unknown) {
      setReviewError((err instanceof Error ? err.message : String(err)));
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchCustomer();
    };
    void loadData();
  }, [fetchCustomer]);

  if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;
  if (error || !customer) return <div className="p-8 text-center text-red-500">{error || 'Bulunamadı'}</div>;

  const account = customer.credit_accounts?.[0];
  const auditLogs = customer.credit_audit_logs || [];
  const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/cari/kart/${token}`;



  const renderDigitalCardModal = () => {
    if (!showCard) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden relative">
          <button 
            onClick={() => setShowCard(false)} 
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 z-10"
          >
            ✕
          </button>
          
          <div id="printable-card" className="bg-white p-8 text-center relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
            <h2 className="text-3xl font-extrabold text-blue-600 mb-1 tracking-tight mt-2">HurCELL</h2>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-8 font-semibold">Dijital Müşteri Kartı</p>
            
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 inline-block mb-4 shadow-sm">
              <QRCodeSVG value={qrUrl} size={160} level="M" />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight">{customer.full_name}</h3>
            <div className="flex justify-center mb-6">
              {customer.customer_card_code && (
                <div className="flex flex-col items-center">
                  <Barcode 
                    value={customer.customer_card_code} 
                    format="CODE128" 
                    width={1.5} 
                    height={40} 
                    displayValue={true} 
                    fontSize={14}
                    margin={0}
                  />
                  <p className="text-[10px] text-gray-400 mt-2">Barkod: Mağaza içi hızlı arama için kart kodu</p>
                </div>
              )}
            </div>
            
            <div className="text-xs text-gray-600 space-y-3 px-2 border-t border-gray-100 pt-6">
              <p className="font-medium">Mağaza içi işlemlerde bu QR kodu okutunuz.</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Bu kart ödeme aracı değildir. Limit ve kullanım hakkı HurCELL onayına tabidir.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center gap-3">
            <button 
              onClick={() => setShowCard(false)} 
              className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Kapat
            </button>
            <button 
              onClick={() => {
                const printContent = document.getElementById('printable-card');
                const windowPrint = window.open('', '', 'width=600,height=800');
                windowPrint?.document.write(`
                  <html><head><title>HurCELL Dijital Kart - ${customer.full_name}</title>
                  <script src="https://cdn.tailwindcss.com"></script>
                  <style>
                    body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f9fafb; font-family: ui-sans-serif, system-ui, sans-serif; }
                    @media print {
                      body { background: white; }
                      .print-wrapper { box-shadow: none !important; border: 2px solid #e5e7eb; }
                    }
                  </style>
                  </head><body>
                  <div class="print-wrapper bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-lg relative overflow-hidden">
                    ${printContent?.innerHTML}
                  </div>
                  <script>setTimeout(() => { window.print(); window.close(); }, 800);</script>
                  </body></html>
                `);
                windowPrint?.document.close();
              }} 
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" /> Kartı Yazdır
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {renderDigitalCardModal()}
      <Link href="/admin/cari" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />
        Aramaya Dön
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Kolon: Profil & QR */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center">
              <div className="bg-white/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/20">
                <span className="text-2xl font-bold text-white">
                  {customer.full_name?.substring(0, 2).toUpperCase() || 'MR'}
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mb-1">{customer.full_name}</h1>
              <p className="text-blue-100 font-mono tracking-wider">{customer.customer_card_code}</p>
              
              <div className="mt-3 flex justify-center gap-2">
                <StatusBadge status={customer.status} />
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <span>{customer.phone}</span>
                </div>
                {customer.city && (
                  <div className="flex items-start gap-3 text-gray-600">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span>{customer.address}, {customer.district}/{customer.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-gray-600">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className={customer.credit_agreement_acceptances?.length ? "text-green-600 font-medium" : "text-amber-500 font-medium"}>
                    {customer.credit_agreement_acceptances?.length ? 'Sözleşme Onaylı' : 'Sözleşme Bekliyor'}
                  </span>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col items-center">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Müşteri QR Kodu</h3>
                <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                  <QRCodeSVG value={qrUrl} size={150} level="M" />
                </div>
                <button 
                  onClick={() => setShowCard(true)}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  Kartı Yazdır / Dijital Kart
                </button>
                <p className="text-xs text-center text-gray-500 mt-4 leading-relaxed max-w-[200px]">
                  Mağaza içi işlemlerde bu QR kodu okutarak hızlı erişim sağlayabilirsiniz.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sağ Kolon: Finans & İnceleme Formu & Geçmiş */}
        <div className="lg:col-span-2 space-y-6">
          {/* Finansal Özet */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
              <CreditCard className="w-5 h-5 text-blue-500" />
              Finansal Özet
              <div className="ml-auto">
                {account && <StatusBadge status={account.status} />}
              </div>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Cari Limit</p>
                <p className="text-xl font-bold text-gray-900">₺{account?.credit_limit || 0}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-600 mb-1">Kullanılan</p>
                <p className="text-xl font-bold text-blue-700">₺{account?.current_balance || 0}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-sm text-green-600 mb-1">Kalan Limit</p>
                <p className="text-xl font-bold text-green-700">₺{account?.available_limit ?? ((account?.credit_limit || 0) - (account?.current_balance || 0))}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-600 mb-1">Hesap Kesim</p>
                <p className="text-lg font-bold text-amber-700 flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> Her ayın {account?.statement_day || 10}&apos;u
                </p>
              </div>
            </div>
          </div>

          {/* Kredimetre Detay */}
          <KredimetreDetailCard
            score={kredimetre?.credit_score ?? null}
            label={kredimetre?.credit_label ?? 'Veri Yok'}
            color={kredimetre?.credit_color ?? 'gray'}
            paidInstallments={kredimetre?.paid_installment_count ?? 0}
            onTimePaidInstallments={kredimetre?.on_time_paid_installment_count ?? 0}
            currentOverdueAmount={kredimetre?.current_overdue_amount ?? 0}
            maximumDaysOverdue={kredimetre?.maximum_days_overdue ?? 0}
            limitUtilizationPercent={kredimetre?.limit_utilization_percent ?? 0}
            lastPaymentAt={kredimetre?.last_payment_at ?? null}
            totalPlans={kredimetre?.total_plan_count ?? 0}
            dueInstallments={kredimetre?.due_installment_count ?? 0}
            loading={kredimetreLoading}
            error={kredimetreError}
          />

          {/* Taksitli Satış Planları ve Sözleşmeler (Finans MVP) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-indigo-500" />
              Taksit Planları & Sözleşmeler ({financeSummary.plans?.length || 0})
            </h2>

            {financeSummary.plans?.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">Müşterinin henüz aktif taksitli satış sözleşmesi bulunmamaktadır.</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 pb-2">
                        <th className="pb-2 font-semibold">Referans Kodu</th>
                        <th className="pb-2 font-semibold">Tür</th>
                        <th className="pb-2 text-right font-semibold">Toplam Borç</th>
                        <th className="pb-2 font-semibold text-center">Durum</th>
                        <th className="pb-2 text-center font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {financeSummary.plans.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 font-bold text-indigo-600">{p.source_reference}</td>
                          <td className="py-2.5 text-gray-600 font-mono uppercase">{p.source_type}</td>
                          <td className="py-2.5 text-right font-semibold">₺{p.total_due_amount.toFixed(2)}</td>
                          <td className="py-2.5 text-center">
                            {p.status === 'active' && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full font-bold">Aktif</span>}
                            {p.status === 'paid' && <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full font-bold">Ödendi</span>}
                            {p.status === 'overdue' && <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] rounded-full font-bold">Gecikmiş</span>}
                            {p.status === 'cancelled' && <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-[10px] rounded-full font-bold">İptal</span>}
                          </td>
                          <td className="py-2.5 text-center">
                            <Link href={`/admin/finans/plan/${p.id}`} className="text-blue-600 hover:text-blue-800 font-bold">
                              Yönet
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Yaklaşan / Geciken Taksit Detayları */}
                {financeSummary.installments?.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Açık Taksit Kalemleri</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {financeSummary.installments
                        .filter((inst) => inst.status !== "paid" && inst.status !== "cancelled")
                        .map((inst) => (
                          <div key={inst.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center text-xs">
                            <div>
                              <div className="font-semibold text-gray-900">{inst.finance_plans?.source_reference || 'Ref'} • Taksit {inst.installment_no}</div>
                              <div className="text-gray-500 mt-0.5">Vade: {new Date(inst.due_date).toLocaleDateString('tr-TR')}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-gray-900">₺{inst.remaining_amount.toFixed(2)}</div>
                              <div className="mt-0.5">
                                {inst.status === 'overdue' ? (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded font-bold uppercase">Gecikmiş</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-[9px] rounded font-bold uppercase">Bekliyor</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cari Hareketler */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
              <FileText className="w-5 h-5 text-blue-500" />
              Cari Hareketler
            </h2>
            
            <div className="mb-8">
              <TransactionForm cardToken={token} onSuccess={fetchCustomer} />
            </div>
            
            <TransactionList transactions={transactions} />
          </div>

          {/* İnceleme ve Onay Formu */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-purple-500" />
              Başvuru / Statü İnceleme
            </h2>
            
            <form onSubmit={handleReview} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Karar</label>
                  <select 
                    value={decision}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDecision(e.target.value as "approve" | "reject" | "suspend" | "")}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="" disabled>Karar Seçiniz</option>
                    <option value="approve">Onayla (Active)</option>
                    <option value="suspend">Askıya Al (Suspend)</option>
                    <option value="reject">Reddet (Reject)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Limit (TL)</label>
                  <input 
                    type="number"
                    min="0"
                    step="1"
                    value={decision === 'reject' || decision === '' ? '0' : limit}
                    onChange={(e) => setLimit(e.target.value)}
                    disabled={decision === 'reject' || decision === ''}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hesap Kesim Günü</label>
                  <select 
                    value={statementDay}
                    onChange={(e) => setStatementDay(Number(e.target.value))}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value={10}>Her ayın 10&apos;u</option>
                    <option value={15}>Her ayın 15&apos;i</option>
                    <option value={20}>Her ayın 20&apos;si</option>
                    <option value={25}>Her ayın 25&apos;i</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sebep (Zorunlu)</label>
                <textarea 
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mernis onayı yapıldı, limit atandı vs."
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 h-20 resize-none"
                />
              </div>

              {reviewError && <p className="text-red-600 text-sm">{reviewError}</p>}

              <button 
                type="submit"
                disabled={reviewLoading || !decision || !reason.trim()}
                className="w-full bg-purple-600 text-white font-medium py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {reviewLoading ? 'İşleniyor...' : 'Kararı Kaydet'}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Audit Log Geçmişi */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                İşlem Tarihçesi
              </h2>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Henüz işlem yapılmamış.</p>
                ) : (
                  auditLogs.map((log: { id: string; action_type: string; new_value?: Record<string, unknown>; admin_username?: string; created_at: string; reason?: string }) => (
                    <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-4 py-1">
                      <p className="font-medium text-gray-900">
                        {log.action_type === 'application_review' 
                          ? (log.new_value?.decision === 'approve' ? 'Onaylandı' : log.new_value?.decision === 'reject' ? 'Reddedildi' : 'Askıya Alındı')
                          : log.action_type}
                      </p>
                      <p className="text-gray-600 mt-1">{log.reason}</p>
                      {log.new_value?.limit !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">Limit: {String(log.new_value.limit)} TL</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(log.created_at).toLocaleString('tr-TR')} • İşlem: {log.admin_username}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Admin Notları */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-indigo-500" />
                Yönetici Notları
              </h2>
              <form onSubmit={handleAddNote} className="mb-4 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Müşteri hakkında not ekle..."
                    className="flex-1 text-sm border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={noteLoading || !newNote.trim()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Ekle
                  </button>
                </div>
              </form>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {notes.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Henüz not eklenmemiş.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                      <p className="text-sm text-gray-800">{note.note}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(note.created_at).toLocaleString('tr-TR')} (Admin Sadece)
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
