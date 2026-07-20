/* eslint-disable */
'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Search, Save, AlertCircle } from 'lucide-react';
import { FinanceCustomerRow } from '@/lib/finance/types';
import {
  calculateFinanceAmounts,
  FINANCE_MONTHLY_RATE_PERCENT,
  getFinanceTermRatePercent
} from '@/lib/finance/tariff';

export default function AdminFinansYeniSozlesme() {
  const router = useRouter();
  const searchRequestIdRef = useRef(0);

  // Search Customer State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [customer, setCustomer] = useState<FinanceCustomerRow | null>(null);
  const [account, setAccount] = useState<{ id: string; available_limit: number; statement_day: number; credit_limit: number; current_balance: number; status: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [sourceType, setSourceType] = useState('store_sale');
  const [sourceReference, setSourceReference] = useState('');
  const [cashPrice, setCashPrice] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [installmentCount, setInstallmentCount] = useState(3);
  const [statementDay, setStatementDay] = useState(10);
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);

  const resetPlanDraft = () => {
    setSourceType('store_sale');
    setSourceReference('');
    setCashPrice('');
    setDownPayment('0');
    setInstallmentCount(3);
    setStatementDay(10);

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setFirstDueDate(nextMonth.toISOString().slice(0, 10));
  };

  const handleSearchQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;

    // Devam eden eski aramaları geçersiz kıl.
    searchRequestIdRef.current += 1;

    setSearchQuery(nextValue);
    setSearchLoading(false);
    setErrorMsg('');
    setCustomer(null);
    setAccount(null);
    resetPlanDraft();
  };

  const handleSearchCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const requestId = ++searchRequestIdRef.current;

    setSearchLoading(true);
    setErrorMsg('');
    setCustomer(null);
    setAccount(null);
    resetPlanDraft();

    try {
      const res = await fetch('/api/admin/cari/arama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      if (requestId !== searchRequestIdRef.current) return;
      const json = await res.json();
      if (requestId !== searchRequestIdRef.current) return;
      if (!res.ok) throw new Error(json.error || 'Cari müşteri bulunamadı.');

      const cardToken =
        typeof json?.card_token === 'string'
          ? json.card_token.trim()
          : '';

      if (!cardToken) {
        throw new Error('Müşteri kart bilgisi alınamadı.');
      }

      if (requestId !== searchRequestIdRef.current) return;
      // Fetch customer detail & account details
      const detailRes = await fetch(`/api/admin/cari/musteri/${encodeURIComponent(cardToken)}`);
      if (requestId !== searchRequestIdRef.current) return;
      const detailJson = await detailRes.json();
      if (requestId !== searchRequestIdRef.current) return;
      if (!detailRes.ok) throw new Error(detailJson.error || 'Hesap ayrıntıları alınamadı.');

      const detailCustomer = detailJson?.customer;
      if (!detailCustomer) {
        throw new Error('Cari müşteri bilgileri alınamadı.');
      }

      const rawAccount =
        detailJson?.account ??
        detailCustomer?.credit_accounts?.[0] ??
        null;

      if (!rawAccount) {
        throw new Error('Müşteriye ait cari hesap bulunamadı.');
      }

      const normalizedAccount = {
        ...rawAccount,
        id: String(rawAccount.id ?? ''),
        credit_limit: Number(rawAccount.credit_limit ?? 0),
        current_balance: Number(rawAccount.current_balance ?? 0),
        available_limit: Number(
          rawAccount.available_limit ??
          Number(rawAccount.credit_limit ?? 0) -
          Number(rawAccount.current_balance ?? 0)
        ),
        statement_day: Number(rawAccount.statement_day ?? 10),
        status: String(rawAccount.status ?? '')
      };

      if (requestId !== searchRequestIdRef.current) return;
      setCustomer(detailCustomer);
      if (requestId !== searchRequestIdRef.current) return;
      setAccount(normalizedAccount);
      if (requestId !== searchRequestIdRef.current) return;
      if ([10, 15, 20, 25].includes(normalizedAccount.statement_day)) {
        setStatementDay(normalizedAccount.statement_day);
      }
    } catch (err: unknown) {
      if (requestId !== searchRequestIdRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err) || 'Müşteri bulunurken hata oluştu.');
    } finally {
      if (requestId !== searchRequestIdRef.current) return;
      setSearchLoading(false);
    }
  };

  // Preview calculations
  const priceVal = parseFloat(cashPrice || '0');
  const downPayVal = parseFloat(downPayment || '0');

  let financedPrincipal = 0;
  let termRatePercent = 0;
  let chargeAmount = 0;
  let totalDueAmount = 0;
  let calculatedInstallments: Array<{ installmentNo: number; amount: number }> = [];
  let calculatedMonthlyRate = FINANCE_MONTHLY_RATE_PERCENT;

  if (priceVal >= 0 && downPayVal >= 0 && priceVal >= downPayVal) {
    try {
      const result = calculateFinanceAmounts(priceVal, downPayVal, installmentCount);
      financedPrincipal = result.financedPrincipal;
      termRatePercent = result.termRatePercent;
      chargeAmount = result.chargeAmount;
      totalDueAmount = result.totalDueAmount;
      calculatedInstallments = result.installments;
      calculatedMonthlyRate = result.monthlyRatePercent;
    } catch (e) {
      // ignore
    }
  }

  const monthlyRateLabel = FINANCE_MONTHLY_RATE_PERCENT.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const tariffRatesList = [1, 2, 3].map(count => ({
    count,
    rate: getFinanceTermRatePercent(count)
  }));

  const previewInstallments = () => {
    if (totalDueAmount <= 0 || installmentCount <= 0) return [];

    const list = [];
    const baseDate = new Date(firstDueDate);
    for (let i = 1; i <= installmentCount; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));

      const calcInst = calculatedInstallments.find(x => x.installmentNo === i);
      const amount = calcInst ? calcInst.amount : 0;

      list.push({
        num: i,
        date: dueDate.toLocaleDateString('tr-TR'),
        amount: amount
      });
    }
    return list;
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !account) return;

    const principal = parseFloat(cashPrice || '0');
    const downPay = parseFloat(downPayment || '0');

    if (principal < 750) {
      setErrorMsg('Taksitli satış bedeli en az 750,00 TL olmalıdır.');
      return;
    }
    if (downPay > principal) {
      setErrorMsg('Peşinat satış bedelinden büyük olamaz.');
      return;
    }
    
    const usableLimit = account.credit_limit - account.current_balance;
    if (totalDueAmount > usableLimit) {
      setErrorMsg('Kullanılabilir limit yetersizdir.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const idempotencyKey = `${customer.id}:${sourceType}:${sourceReference}:${Date.now()}`;
      
      const res = await fetch('/api/admin/finance/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          sourceType,
          sourceReference,
          principalAmount: principal,
          downPaymentAmount: downPay,
          installmentCount,
          statementDay,
          firstDueDate,
          idempotencyKey
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Plan kaydedilemedi.');

      router.push(`/admin/finans/plan/${json.result.plan.id}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err) || 'Plan oluşturulurken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/finans" className="text-gray-500 hover:text-gray-800 transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 font-sans">Yeni Taksitli Satış Planı</h1>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. Müşteri Arama Formu */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Cari Müşteri Seçimi</h2>
        <form onSubmit={handleSearchCustomer} className="flex gap-3">
          <input
            type="text"
            placeholder="Telefon no, kart kodu veya QR token..."
            value={searchQuery}
            onChange={handleSearchQueryChange}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            <span>Müşteri Ara</span>
          </button>
        </form>

        {customer && account && (
          <div className="mt-5 p-4 bg-blue-50 border border-blue-100 rounded-lg grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-gray-500 font-medium">Müşteri Adı</div>
              <div className="font-semibold text-gray-900 mt-0.5">{customer.full_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium">Kart Kodu</div>
              <div className="font-semibold text-gray-900 mt-0.5">{customer.customer_card_code}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium">Müşteri Statüsü</div>
              <div className={`font-semibold mt-0.5 capitalize ${
                customer.status === 'active'
                  ? 'text-green-700'
                  : customer.status === 'pending_review'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}>{customer.status}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium">Cari Hesap Durumu</div>
              <div className={`font-semibold mt-0.5 capitalize ${
                account.status === 'active'
                  ? 'text-green-700'
                  : account.status === 'pending_review'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}>{account.status}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium">Kullanılabilir Limit</div>
              <div className="font-bold text-gray-900 mt-0.5">{(account.credit_limit - account.current_balance).toFixed(2)} / {account.credit_limit.toFixed(2)} TL</div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Satış ve Taksit Bilgileri Formu */}
      {customer && account && (
        customer.status !== 'active' || account.status !== 'active' ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-6 rounded-xl shadow-sm mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-gray-900">Hesap Aktif Değil</h3>
              <p className="text-sm mt-0.5">Müşteri durumu &quot;{customer.status}&quot; ve cari hesap durumu &quot;{account.status}&quot; şeklindedir. Taksit planı oluşturmak için her ikisinin de &quot;active&quot; olması zorunludur.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateContract} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <h2 className="text-lg font-bold text-gray-900">Plan & Taksit Parametreleri</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Satış Kaynak Türü</label>
              <select
                value={sourceType}
                onChange={e => setSourceType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="store_sale">Mağaza Satışı / Ürün</option>
                <option value="web_order">İnternet Siparişi</option>
                <option value="service_order">Servis / İşçilik / Yedek Parça</option>
                <option value="manual">Manuel Borçlandırma</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Kaynak Referans Kodu (Zorunlu)</label>
              <input
                type="text"
                placeholder="Ör. HRC-104928 veya Servis Form ID"
                value={sourceReference}
                onChange={e => setSourceReference(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Satış Bedeli (TL)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Ör. 1250.00"
                value={cashPrice}
                onChange={e => setCashPrice(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Peşinat Bedeli (TL)</label>
              <input
                type="number"
                step="0.01"
                value={downPayment}
                onChange={e => setDownPayment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Otomatik Vade Farkı</label>
              <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm space-y-1">
                <div><span className="font-semibold">Aylık Referans Oran:</span> %{monthlyRateLabel}</div>
                <div><span className="font-semibold">Toplam Vade Farkı Oranı:</span></div>
                <ul className="list-disc list-inside pl-2 text-xs text-gray-600">
                  {tariffRatesList.map(item => (
                    <li key={item.count}>
                      {item.count} Taksit: %{item.rate.toLocaleString('tr-TR', {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4
                      })}
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-gray-500 pt-1 leading-normal">
                  Vade farkı, HurCELL’in aylık %{monthlyRateLabel} standart tarifesine göre taksit sayısı üzerinden bileşik olarak otomatik hesaplanır.
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Taksit Sayısı</label>
              <select
                value={installmentCount}
                onChange={e => setInstallmentCount(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="1">1 Taksit</option>
                <option value="2">2 Taksit</option>
                <option value="3">3 Taksit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Hesap Kesim Günü</label>
              <select
                value={statementDay}
                onChange={e => setStatementDay(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="10">Ayın 10&apos;u</option>
                <option value="15">Ayın 15&apos;i</option>
                <option value="20">Ayın 20&apos;si</option>
                <option value="25">Ayın 25&apos;i</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">İlk Vade Tarihi</label>
              <input
                type="date"
                value={firstDueDate}
                onChange={e => setFirstDueDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          </div>

          {/* Taksit Önizleme */}
          {totalDueAmount > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Taksit Planı Önizleme (Otomatik Tarife Hesabı)</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs text-gray-600 border-b border-gray-200 pb-3">
                <div>
                  <span className="block font-medium text-gray-500">Satış Bedeli</span>
                  <span className="font-semibold text-gray-900 text-sm">{priceVal.toFixed(2)} TL</span>
                </div>
                <div>
                  <span className="block font-medium text-gray-500">Peşinat</span>
                  <span className="font-semibold text-gray-900 text-sm">{downPayVal.toFixed(2)} TL</span>
                </div>
                <div>
                  <span className="block font-medium text-gray-500">Kalan Ana Para</span>
                  <span className="font-semibold text-gray-900 text-sm">{financedPrincipal.toFixed(2)} TL</span>
                </div>
                <div>
                  <span className="block font-medium text-gray-500">Aylık Referans Oran</span>
                  <span className="font-semibold text-gray-900 text-sm">
                    %{calculatedMonthlyRate.toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
                <div>
                  <span className="block font-medium text-gray-500">Toplam Vade Farkı Oranı</span>
                  <span className="font-semibold text-gray-900 text-sm">%{termRatePercent.toFixed(4)}</span>
                </div>
                <div>
                  <span className="block font-medium text-gray-500">Vade Farkı Tutarı</span>
                  <span className="font-semibold text-gray-900 text-sm">{chargeAmount.toFixed(2)} TL</span>
                </div>
              </div>

              <div className="space-y-2">
                {previewInstallments().map(inst => (
                  <div key={inst.num} className="flex justify-between text-sm text-gray-700 border-b border-gray-200 pb-1.5 last:border-0 last:pb-0">
                    <span>{inst.num}. Taksit (Vade: {inst.date})</span>
                    <span className="font-bold text-gray-900">{inst.amount.toFixed(2)} TL</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold text-blue-800 pt-2 border-t border-dashed border-gray-300">
                  <span>Toplam Plan Borcu (Vade Farkı Dahil)</span>
                  <span>{totalDueAmount.toFixed(2)} TL</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Link
              href="/admin/finans"
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              <span>Planı Kaydet ve Başlat</span>
            </button>
          </div>
        </form>
        )
      )}
    </div>
  );
}
