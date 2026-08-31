'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, ArrowLeft, PlusCircle, ArrowRightLeft, CreditCard, Banknote, History, Lock } from 'lucide-react';
import { KasaBankAccount, KasaBankTransaction } from '@/lib/kasa/types';

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function AdminBankaPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<KasaBankAccount[]>([]);
  const [transactions, setTransactions] = useState<KasaBankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [accRes, txRes] = await Promise.all([
        fetch('/api/admin/kasa/bank-accounts'),
        fetch('/api/admin/kasa/bank-transactions'),
      ]);

      if (!accRes.ok || !txRes.ok) throw new Error('Banka verileri yüklenemedi.');

      const accData = await accRes.json();
      const txData = await txRes.json();

      setAccounts(accData.items || []);
      setTransactions(txData.items || []);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Banka verileri yükleniyor...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/kasa')}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Landmark className="text-blue-600" size={26} /> Banka Hesapları ve Hareket Yönetimi
          </h1>
          <p className="text-xs text-slate-500">Banka Bakiyeleri, Virman, Gider Çıkışları ve POS Settlement Yönetimi</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl">
          {error}
        </div>
      )}

      {/* BANKA HESAPLARI KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-500">{acc.bank_name || 'Banka'}</span>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                {acc.currency_code}
              </span>
            </div>
            <div className="text-lg font-black text-slate-900">{acc.account_name}</div>
            <div className="text-2xl font-extrabold text-blue-900">{acc.formatted_balance}</div>
            {acc.iban_masked && <div className="text-xs font-mono text-slate-500">IBAN: {acc.iban_masked}</div>}
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full p-8 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center text-slate-500 font-medium">
            Henüz tanımlı bir banka hesabı bulunmuyor.
          </div>
        )}
      </div>

      {/* HAREKET DETAYLARI TABLOSU */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="font-extrabold text-slate-900 flex items-center gap-2 text-base">
            <History size={18} className="text-blue-600" /> Banka Hareket Defteri
          </h2>
          <span className="text-xs font-bold text-slate-500">Toplam {transactions.length} Kayıt</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <th className="p-3">Tarih</th>
                <th className="p-3">Banka Hesabı</th>
                <th className="p-3">İşlem Türü</th>
                <th className="p-3">Açıklama</th>
                <th className="p-3 text-right">Tutar</th>
                <th className="p-3 text-center">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{tx.transaction_date}</td>
                  <td className="p-3 font-bold text-slate-800">{tx.account_name}</td>
                  <td className="p-3 uppercase font-bold text-[11px] text-slate-600">{tx.transaction_type}</td>
                  <td className="p-3 text-slate-700">{tx.description}</td>
                  <td className={`p-3 text-right font-black ${tx.direction === 'in' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {tx.formatted_amount}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${tx.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {tx.status === 'active' ? 'Aktif' : 'İptal'}
                    </span>
                  </td>
                </tr>
              ))}

              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 font-medium">
                    Henüz banka hareketi bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
