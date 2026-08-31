'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, ArrowLeft, PlusCircle, History, Edit, CheckCircle2, AlertTriangle, Power, Trash2 } from 'lucide-react';
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
  const [success, setSuccess] = useState<string | null>(null);

  // Modal State'leri
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<KasaBankAccount | null>(null);

  // Form State'leri (Yeni Hesap)
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [currencyCode, setCurrencyCode] = useState<'TRY' | 'USD' | 'EUR'>('TRY');
  const [iban, setIban] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [openingBalanceTL, setOpeningBalanceTL] = useState('0');
  const [balanceStartDate, setBalanceStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  const openCreateModal = () => {
    setAccountName('');
    setBankName('');
    setCurrencyCode('TRY');
    setIban('');
    setAccountNo('');
    setOpeningBalanceTL('0');
    setBalanceStartDate(new Date().toISOString().split('T')[0]);
    setIsActive(true);
    setNotes('');
    setModalError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (acc: KasaBankAccount) => {
    setEditingAccount(acc);
    setAccountName(acc.account_name);
    setBankName(acc.bank_name);
    setCurrencyCode((acc.currency_code as any) || 'TRY');
    setIban(acc.iban || '');
    setAccountNo(acc.account_no || '');
    setIsActive(acc.is_active);
    setNotes(acc.notes || '');
    setModalError(null);
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!accountName.trim()) {
      setModalError('Lütfen hesap görünen adını girin (Örn: QNB Ana TL).');
      return;
    }
    if (!bankName.trim()) {
      setModalError('Lütfen banka adını girin (Örn: QNB Finansbank).');
      return;
    }

    const cleanBalanceStr = openingBalanceTL.replace(',', '.').trim();
    const balanceNum = Number(cleanBalanceStr);
    if (isNaN(balanceNum) || balanceNum < 0) {
      setModalError('Açılış bakiyesi geçerli pozitif veya 0 bir tutar olmalıdır.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/kasa/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_name: accountName.trim(),
          bank_name: bankName.trim(),
          currency_code: currencyCode,
          iban: iban.trim() || undefined,
          account_no: accountNo.trim() || undefined,
          opening_balance_tl: balanceNum,
          balance_start_date: balanceStartDate,
          is_active: isActive,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Banka hesabı kaydedilemedi.');

      setSuccess(`Banka hesabı başarıyla oluşturuldu: ${accountName}`);
      setShowCreateModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Banka hesabı oluşturulurken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setModalError(null);

    if (!accountName.trim()) {
      setModalError('Lütfen hesap görünen adını girin.');
      return;
    }
    if (!bankName.trim()) {
      setModalError('Lütfen banka adını girin.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/kasa/bank-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccount.id,
          account_name: accountName.trim(),
          bank_name: bankName.trim(),
          currency_code: currencyCode,
          iban: iban.trim() || undefined,
          account_no: accountNo.trim() || undefined,
          is_active: isActive,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Banka hesabı güncellenemedi.');

      setSuccess(`Banka hesabı güncellendi: ${accountName}`);
      setShowEditModal(false);
      setEditingAccount(null);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Banka hesabı güncellenirken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (acc: KasaBankAccount) => {
    try {
      const res = await fetch('/api/admin/kasa/bank-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: acc.id,
          is_active: !acc.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Durum değiştirilemedi.');
      setSuccess(`Hesap durumu değiştirildi: ${acc.account_name} (${!acc.is_active ? 'Aktif' : 'Pasif'})`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Durum değiştirilemedi.');
    }
  };

  const handleDelete = async (acc: KasaBankAccount) => {
    if (!window.confirm(`"${acc.account_name}" hesabını silmek / pasife almak istediğinizden emin misiniz?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/kasa/bank-accounts?id=${encodeURIComponent(acc.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
      setSuccess(data.message || 'İşlem başarıyla tamamlandı.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Hesap silinemedi.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Banka Verileri Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* BAŞLIK VE EYLEM BUTONU */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 shrink-0"
        >
          <PlusCircle size={18} />
          <span>Yeni Banka Hesabı Ekle</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:underline">Kapat</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-xs text-emerald-600 hover:underline">Kapat</button>
        </div>
      )}

      {/* BANKA HESAPLARI KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className={`bg-white p-5 rounded-2xl border shadow-sm space-y-3 relative transition-all ${
              acc.is_active ? 'border-slate-200 hover:border-blue-300' : 'border-slate-200 opacity-60 bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                {acc.bank_name || 'Banka'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                  acc.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {acc.is_active ? 'Aktif' : 'Pasif'}
                </span>
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                  {acc.currency_code}
                </span>
              </div>
            </div>

            <div>
              <div className="text-base font-bold text-slate-900 line-clamp-1">{acc.account_name}</div>
              <div className="text-2xl font-black text-blue-950 mt-0.5">{acc.formatted_balance}</div>
            </div>

            <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-500 font-medium">
              {acc.iban_masked && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">IBAN:</span>
                  <span className="font-mono text-slate-700">{acc.iban_masked}</span>
                </div>
              )}
              {acc.account_no_masked && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">Hesap No:</span>
                  <span className="font-mono text-slate-700">{acc.account_no_masked}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[11px] text-slate-400">
                <span>Açılış Bakiyesi:</span>
                <span>{formatTL(acc.opening_balance_kurus || 0)}</span>
              </div>
            </div>

            {/* KART İÇİ EYLEMLER */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => openEditModal(acc)}
                className="w-1/2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1 transition"
              >
                <Edit size={13} />
                <span>Düzenle</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(acc)}
                className={`w-1/2 py-1.5 font-bold rounded-lg text-xs flex items-center justify-center gap-1 transition ${
                  acc.is_active
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                }`}
              >
                <Power size={13} />
                <span>{acc.is_active ? 'Pasife Al' : 'Aktife Al'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(acc)}
                title="Hesabı Sil / Pasife Al"
                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs transition shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full p-12 bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl text-center space-y-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
              <Landmark size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Henüz Tanımlı Bir Banka Hesabı Bulunmuyor</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Banka giderleri, POS aktarımları ve virman işlemlerini takip etmek için ilk banka hesabınızı oluşturun.
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition shadow-md inline-flex items-center gap-2"
            >
              <PlusCircle size={18} />
              <span>İlk Banka Hesabını Ekle</span>
            </button>
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
                  <td className="p-3 font-bold text-slate-800">{tx.account_name || tx.bank_account_name}</td>
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

      {/* YENİ BANKA HESABI EKLE MODALI */}
      {showCreateModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Landmark className="text-blue-600" size={20} />
                <span>Yeni Banka Hesabı Ekle</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Hesap Görünen Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: QNB Ana TL Hesabı"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Banka Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: QNB Finansbank / Garanti BBVA"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Para Birimi *</label>
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="TRY">TRY (Türk Lirası)</option>
                    <option value="USD">USD (Amerikan Doları)</option>
                    <option value="EUR">EUR (Euro)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Açılış Bakiyesi ({currencyCode}) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={openingBalanceTL}
                    onChange={(e) => setOpeningBalanceTL(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">IBAN (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="TR..."
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Hesap No / Son 4 Hane (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Örn: 1234"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Bakiye Başlangıç Tarihi *</label>
                <input
                  type="date"
                  required
                  value={balanceStartDate}
                  onChange={(e) => setBalanceStartDate(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="create-is-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="create-is-active" className="text-slate-700 cursor-pointer font-bold text-xs">
                  Hesap aktif olarak kullanıma açılsın
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    'Hesabı Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BANKA HESABI DÜZENLE MODALI */}
      {showEditModal && editingAccount && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Edit className="text-blue-600" size={20} />
                <span>Banka Hesabını Düzenle</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Hesap Görünen Adı *</label>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Banka Adı *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Para Birimi *</label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                >
                  <option value="TRY">TRY (Türk Lirası)</option>
                  <option value="USD">USD (Amerikan Doları)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">IBAN (Opsiyonel)</label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Hesap No / Son 4 Hane (Opsiyonel)</label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-is-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="edit-is-active" className="text-slate-700 cursor-pointer font-bold text-xs">
                  Hesap aktif olarak kullanıma açılsın
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Güncelleniyor...</span>
                    </>
                  ) : (
                    'Güncelle'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
