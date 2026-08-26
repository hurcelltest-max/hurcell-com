'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarCheck,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle,
  PlusCircle,
  Banknote,
  MinusCircle,
  Landmark,
  Settings,
  Coins,
  Globe,
  CreditCard,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { DashboardCarryoverInfo, KasaDashboardMetrics } from '@/lib/kasa/types';

interface ExpenseCategory {
  id: string;
  name: string;
  is_salary_category: boolean;
}

function formatTL(kurus: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

export default function AdminKasaOverviewPage() {
  const [hasManager, setHasManager] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<KasaDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootSuccess, setBootSuccess] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(false);

  // Modallar
  const [modalType, setModalType] = useState<
    'capital' | 'fx_capital' | 'withdrawal' | 'expense' | 'target_reserve' | 'bank_deposit' | 'fx_convert' | 'manual_rate' | null
  >(null);

  const [amountTL, setAmountTL] = useState('');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [targetReserveTL, setTargetReserveTL] = useState('15000');

  // Döviz State
  const [currencyCode, setCurrencyCode] = useState<'USD' | 'EUR'>('USD');
  const [foreignAmount, setForeignAmount] = useState('');
  const [actualRate, setActualRate] = useState('');
  const [manualRateInput, setManualRateInput] = useState('');

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [carryoverInfo, setCarryoverInfo] = useState<DashboardCarryoverInfo | null>(null);

  const checkBootstrap = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/kasa/bootstrap');
      const data = await res.json();
      setHasManager(data.hasManager);

      const catRes = await fetch('/api/kasa/expense-categories');
      if (catRes.ok) {
        const catData = await catRes.json();
        setExpenseCategories(catData.categories || []);
        if (catData.categories?.length > 0) setSelectedExpenseCatId(catData.categories[0].id);
      }

      const settingsRes = await fetch('/api/admin/kasa/settings');
      if (settingsRes.ok) {
        const setObj = await settingsRes.json();
        if (setObj.settings?.cash_reserve_target_kurus) {
          setTargetReserveTL((setObj.settings.cash_reserve_target_kurus / 100).toString());
        }
      }

      const dashRes = await fetch('/api/kasa/dashboard');
      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setMetrics(dashData.metrics || null);
        setCarryoverInfo(dashData.carryoverInfo || null);
      }
    } catch {
      setHasManager(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBootstrap();
  }, []);

  const [passwordConfirm, setPasswordConfirm] = useState('');

  const handleCreateInitialManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setBootError(null);
    setBootSuccess(null);

    if (password.length < 10) {
      return setBootError('Parola en az 10 karakter olmalıdır.');
    }

    if (password !== passwordConfirm) {
      return setBootError('Girilen parolalar birbiriyle eşleşmiyor.');
    }

    try {
      setBootLoading(true);
      const res = await fetch('/api/admin/kasa/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, full_name: fullName, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İlk yönetici hesabı oluşturulamadı.');

      setBootSuccess(`İlk Yönetici Hesabı Başarıyla Oluşturuldu! Kullanıcı: ${data.user.username}`);
      setHasManager(true);
    } catch (err: any) {
      setBootError(err.message || 'İlk kurulum sırasında hata oluştu.');
    } finally {
      setBootLoading(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    try {
      setActionLoading(true);

      if (modalType === 'capital') {
        if (!amountTL || Number(amountTL) <= 0) return setActionError('Lütfen geçerli bir tutar girin.');
        const res = await fetch('/api/admin/kasa/capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type: 'capital_injection',
            amount_tl: Number(amountTL),
            description: description.trim() || 'Sermaye Girişi',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sermaye girişi başarısız.');
        setActionSuccess('Sermaye girişi başarıyla kaydedildi.');
      } else if (modalType === 'fx_capital') {
        if (!foreignAmount || Number(foreignAmount) <= 0) return setActionError('Lütfen geçerli bir döviz miktarı girin.');
        if (!actualRate || Number(actualRate) <= 0) return setActionError('Lütfen geçerli bir kur girin.');

        const res = await fetch('/api/admin/kasa/fx-capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency_code: currencyCode,
            foreign_amount: Number(foreignAmount),
            exchange_rate: Number(actualRate),
            description: description.trim() || `${foreignAmount} ${currencyCode} Sermaye Girişi`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Döviz sermayesi eklenemedi.');
        setActionSuccess(`${foreignAmount} ${currencyCode} sermayesi kasaya eklendi.`);
      } else if (modalType === 'withdrawal') {
        if (!amountTL || Number(amountTL) <= 0) return setActionError('Lütfen geçerli bir tutar girin.');
        if (!justification.trim()) return setActionError('Lütfen bir çekim gerekçesi/açıklaması girin.');
        const res = await fetch('/api/admin/kasa/capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type: 'owner_withdrawal',
            amount_tl: Number(amountTL),
            justification: justification.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'İşletme sahibi çekimi başarısız.');
        setActionSuccess('İşletme sahibi çekimi başarıyla kaydedildi.');
      } else if (modalType === 'expense') {
        if (!amountTL || Number(amountTL) <= 0) return setActionError('Lütfen geçerli bir tutar girin.');
        if (!selectedExpenseCatId) return setActionError('Lütfen bir gider kategorisi seçin.');
        if (!description.trim()) return setActionError('Lütfen gider açıklaması girin.');

        const res = await fetch('/api/kasa/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expense_category_id: selectedExpenseCatId,
            amount_tl: Number(amountTL),
            description: description.trim(),
            recipient_name: recipientName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gider kaydı eklenemedi.');
        setActionSuccess('Gider/Maaş kaydı başarıyla eklendi.');
      } else if (modalType === 'bank_deposit') {
        if (carryoverInfo?.carryover_status === 'pending_previous_close') {
          return setActionError('Önceki kasa günleri kapatılıp bugünün devri onaylanana kadar bankaya para yatırma işlemi yapılamaz.');
        }
        if (!amountTL || Number(amountTL) <= 0) return setActionError('Lütfen geçerli bir tutar girin.');
        const res = await fetch('/api/admin/kasa/bank-deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_tl: Number(amountTL),
            bank_name: bankName.trim(),
            reference_no: referenceNo.trim(),
            description: description.trim() || 'Bankaya Yatırılan Nakit',
            idempotency_key: `bank_dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Banka yatırma işlemi başarısız.');
        setActionSuccess('Bankaya nakit transferi başarıyla kaydedildi.');
      } else if (modalType === 'fx_convert') {
        if (!foreignAmount || Number(foreignAmount) <= 0) return setActionError('Lütfen geçerli bir döviz miktarı girin.');
        if (!actualRate || Number(actualRate) <= 0) return setActionError('Lütfen geçerli bir bozdurma kuru girin.');

        const res = await fetch('/api/admin/kasa/fx-convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency_code: currencyCode,
            foreign_amount: Number(foreignAmount),
            actual_rate: Number(actualRate),
            description: description.trim() || `${foreignAmount} ${currencyCode} Bozduruldu`,
            idempotency_key: `fx_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Döviz bozdurma işlemi başarısız.');
        setActionSuccess(`${foreignAmount} ${currencyCode} başarıyla TL'ye dönüştürüldü!`);
      } else if (modalType === 'manual_rate') {
        if (!manualRateInput || Number(manualRateInput) <= 0) return setActionError('Lütfen geçerli bir kur değeri girin.');

        const res = await fetch('/api/admin/kasa/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency_code: currencyCode,
            rate_numeric: Number(manualRateInput),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Manuel kur güncellenemedi.');
        setActionSuccess(`Manuel ${currencyCode} kuru başarıyla güncellendi!`);
      } else if (modalType === 'target_reserve') {
        if (targetReserveTL === '' || Number(targetReserveTL) < 0) {
          return setActionError('Hedef bakiye 0 veya daha büyük olmalıdır.');
        }
        const res = await fetch('/api/admin/kasa/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_reserve_tl: Number(targetReserveTL) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hedef bakiye güncellenemedi.');
        setActionSuccess('Hedef kasa bakiyesi başarıyla güncellendi.');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kasa-updated'));
      }

      await checkBootstrap();

      setTimeout(() => {
        setModalType(null);
        setAmountTL('');
        setDescription('');
        setJustification('');
        setRecipientName('');
        setBankName('');
        setReferenceNo('');
        setForeignAmount('');
        setActionSuccess(null);
      }, 1500);
    } catch (err: any) {
      setActionError(err.message || 'İşlem başarısız.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500 font-medium">Yükleniyor...</div>;
  }

  const selectedExpenseCategoryObj = expenseCategories.find((c) => c.id === selectedExpenseCatId);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">HurCELL Kasa & Yönetici Kontrol Merkezi</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sermaye hareketleri, döviz kasası, cari / veresiye takibi, 7 günlük gecikme uyarıları ve gün sonu kapanışı
        </p>
      </div>

      {/* İLK YÖNETİCİ BOOTSTRAP KARTI */}
      {!hasManager && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-amber-900">
            <ShieldAlert size={28} className="text-amber-600 shrink-0" />
            <div>
              <h2 className="font-bold text-lg">İlk Kasa Yöneticisi Hesabı Oluşturma</h2>
              <p className="text-xs text-amber-800">
                Sistemde tanımlı hiçbir kasa yöneticisi bulunamadı. Lütfen ilk yetkili yönetici hesabını tanımlayın. (Şifre en az 10 karakter olmalıdır).
              </p>
            </div>
          </div>

          {bootError && (
            <div className="p-3 bg-red-100 text-red-800 text-xs rounded-xl border border-red-200">
              {bootError}
            </div>
          )}

          {bootSuccess && (
            <div className="p-3 bg-emerald-100 text-emerald-800 text-xs rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle size={16} /> {bootSuccess}
            </div>
          )}

          <form onSubmit={handleCreateInitialManager} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              placeholder="Yönetici Kullanıcı Adı (Örn: hür)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="p-3 bg-white border border-amber-200 rounded-xl text-sm font-medium"
            />
            <input
              type="text"
              required
              placeholder="Ad Soyad"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="p-3 bg-white border border-amber-200 rounded-xl text-sm font-medium"
            />
            <input
              type="password"
              required
              minLength={10}
              placeholder="Şifre / PIN (En az 10 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="p-3 bg-white border border-amber-200 rounded-xl text-sm font-medium"
            />
            <input
              type="password"
              required
              minLength={10}
              placeholder="Şifre Tekrar"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="p-3 bg-white border border-amber-200 rounded-xl text-sm font-medium"
            />
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={bootLoading}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
              >
                {bootLoading ? 'Oluşturuluyor...' : 'İlk Kasa Yöneticisini Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DEVİR ONAYI BEKLİYOR YÖNETİCİ UYARISI BANNER'I */}
      {carryoverInfo?.carryover_status === 'pending_previous_close' && (
        <div className="p-5 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 space-y-2 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500 text-white rounded-xl shrink-0 shadow-md">
                <AlertTriangle size={24} />
              </div>
              <div>
                <div className="font-extrabold text-base text-amber-950 uppercase tracking-wide">
                  DEVİR ONAYI BEKLİYOR
                </div>
                <div className="text-sm font-black text-amber-900 mt-0.5">
                  Tahmini Fiziki TL Kasa: {formatTL(carryoverInfo.displayed_carryover_kurus)}
                </div>
                <div className="text-xs font-semibold text-amber-800 mt-0.5">
                  Kaynak Gün: {carryoverInfo.carryover_source_date || 'Önceki Gün'} — Önceki gün kapanışı ve devir onarımı bekleniyor.
                </div>
              </div>
            </div>
            <Link
              href="/admin/kasa/gunluk-arsiv"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-1.5"
            >
              Günlük Arşive Git →
            </Link>
          </div>
          <p className="text-xs text-amber-900/90 font-medium border-t border-amber-200/80 pt-2">
            <strong>Kapanış Sırası Talimatı:</strong> Önce 23 Ağustos, ardından 25 Ağustos kasa gününü kapatın; sonra 26 Ağustos devrini onaylayın.
          </p>
        </div>
      )}

      {/* BUGÜNKÜ KASA VE TAHSİLAT ÖZETİ */}
      {metrics && (
        <div className="space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Bugünkü Kasa Tahsilat ve Ciro Özeti</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center gap-1">
                <Banknote size={14} /> Nakit Tahsilat
              </span>
              <div className="text-lg font-black text-emerald-800">{formatTL(metrics.cash_collection_kurus)}</div>
              <p className="text-[10px] text-slate-400">Nakit satış ve cari tahsilat</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block flex items-center gap-1">
                <CreditCard size={14} /> Kredi Kartı
              </span>
              <div className="text-lg font-black text-blue-800">{formatTL(metrics.card_collection_kurus)}</div>
              <p className="text-[10px] text-slate-400">POS cihazı tahsilatları</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-sm space-y-1">
              <span className="text-[11px] font-extrabold text-purple-900 uppercase tracking-wider block flex items-center gap-1">
                <Banknote size={14} className="text-purple-700" /> Havale / EFT
              </span>
              <div className="text-lg font-black text-purple-900">{formatTL(metrics.bank_transfer_collection_kurus || 0)}</div>
              <p className="text-[10px] text-purple-700/80 font-medium">Banka transfer tahsilatları</p>
            </div>

            {carryoverInfo?.carryover_status === 'pending_previous_close' ? (
              <div className="bg-amber-950 text-white p-4 rounded-2xl border-2 border-amber-400 shadow-sm space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider block text-amber-300 flex items-center gap-1">
                  <AlertTriangle size={12} /> FİZİKİ KASA (TAHMİNİ)
                </span>
                <div className="text-lg font-black text-amber-300">
                  {formatTL(carryoverInfo.displayed_carryover_kurus)}
                </div>
                <p className="text-[10px] text-amber-200/90 font-medium">Devir onayı bekleniyor</p>
              </div>
            ) : (
              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
                  Fiziki Nakit Kasa
                </span>
                <div className="text-lg font-black text-emerald-400">{formatTL(metrics.expected_cash_kurus)}</div>
                <p className="text-[10px] text-slate-400">Kasada bulunan fiziki TL</p>
              </div>
            )}

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Gerçekleşen Kâr
              </span>
              <div className={`text-lg font-black ${metrics.realized_net_profit_kurus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatTL(metrics.realized_net_profit_kurus)}
              </div>
              <p className="text-[10px] text-slate-400">Tahsil edilmiş net kâr</p>
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-sm space-y-1">
              <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
                Açık Cari Risk
              </span>
              <div className="text-lg font-black text-amber-950">-{formatTL(metrics.open_credit_total_kurus || 0)}</div>
              <p className="text-[10px] text-amber-800 font-semibold">Tahsil edilmeyen veresiyeler</p>
            </div>
          </div>

          {/* BANKAYA PARA YATIRMA UYARISI BANNER'I */}
          {metrics.expected_cash_kurus > (metrics.cash_reserve_target_kurus || 1500000) && (
            <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 flex items-center justify-between flex-wrap gap-3 shadow-sm mt-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shrink-0">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-amber-950 uppercase tracking-wide">BANKAYA PARA YATIRMA UYARISI</div>
                  <p className="text-xs text-amber-900 font-medium mt-0.5">
                    Kasada <strong>{formatTL(metrics.expected_cash_kurus - (metrics.cash_reserve_target_kurus || 1500000))}</strong> fazla var. Bankaya yatırılmalı. (Hedef Nakit Limiti: {formatTL(metrics.cash_reserve_target_kurus || 1500000)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setAmountTL(((metrics.expected_cash_kurus - (metrics.cash_reserve_target_kurus || 1500000)) / 100).toString());
                  setModalType('bank_deposit');
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Bankaya Çıkış Yap
              </button>
            </div>
          )}
        </div>
      )}

      {/* YÖNETİCİ HIZLI HAREKET BUTONLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/admin/kasa/cari"
          className="p-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <CreditCard size={18} /> Cari & Risk Takibi
        </Link>

        <button
          onClick={() => setModalType('fx_convert')}
          className="p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <Coins size={18} /> Döviz Bozdur
        </button>

        <button
          onClick={() => setModalType('fx_capital')}
          className="p-3.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <Globe size={18} /> Döviz Sermayesi
        </button>

        <button
          onClick={() => setModalType('manual_rate')}
          className="p-3.5 bg-violet-700 hover:bg-violet-800 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <Settings size={18} /> Manuel Kur Ayarla
        </button>

        <button
          onClick={() => setModalType('capital')}
          className="p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <Banknote size={18} /> TL Sermaye Girişi
        </button>

        <button
          onClick={() => setModalType('withdrawal')}
          className="p-3.5 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <MinusCircle size={18} /> Sahip Çekimi
        </button>

        <button
          onClick={() => setModalType('bank_deposit')}
          className="p-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <Landmark size={18} /> Bankaya Çık
        </button>

        <button
          onClick={() => setModalType('expense')}
          className="p-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all text-xs sm:text-sm"
        >
          <PlusCircle size={18} /> Gider / Maaş
        </button>
      </div>

      {/* YÖNETİCİ KONTROL KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <Link
          href="/admin/kasa/cari"
          className="bg-white p-6 rounded-2xl border border-amber-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all space-y-3 group"
        >
          <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <CreditCard size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-900">Cari / Veresiye Takibi</h3>
          <p className="text-xs text-slate-500">
            Açık veresiyeler, 7 günlük gecikme uyarıları ve müşteri borç tahsilatlarını yönetin.
          </p>
        </Link>

        <Link
          href="/admin/kasa/personel"
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all space-y-3 group"
        >
          <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <Users size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-900">Personel Yönetimi</h3>
          <p className="text-xs text-slate-500">
            Personel hesapları oluşturun, şifre/PIN sıfırlayın veya yetkilerini yönetin.
          </p>
        </Link>

        <Link
          href="/admin/kasa/gun-sonu"
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all space-y-3 group"
        >
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <CalendarCheck size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-900">Gün Sonu Kapanışı</h3>
          <p className="text-xs text-slate-500">
            Fiziksel TL, USD/EUR döviz ve gün sonu cari veresiye sayım özetini inceleyin.
          </p>
        </Link>

        <Link
          href="/admin/kasa/raporlar"
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all space-y-3 group"
        >
          <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <FileSpreadsheet size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-900">Raporlar & Dışa Aktar</h3>
          <p className="text-xs text-slate-500">
            Gerçekleşen kâr, açık cari risk ve ihtiyatlı yönetim raporlarını inceleyin.
          </p>
        </Link>
      </div>

      {/* İŞLEM MODALLARI */}
      {modalType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">
              {modalType === 'fx_convert' && 'Döviz Bozdurma (TL Nakde Çevir)'}
              {modalType === 'fx_capital' && 'Döviz Sermayesi Ekleme (USD / EUR)'}
              {modalType === 'manual_rate' && 'Manuel Kur Belirleme (Yönetici)'}
              {modalType === 'capital' && 'Sermaye Girişi (İşletme Katkısı)'}
              {modalType === 'withdrawal' && 'İşletme Sahibi Çekimi'}
              {modalType === 'expense' && 'Gider / Maaş Kaydı'}
              {modalType === 'bank_deposit' && 'Bankaya TL Nakit Çıkışı (Transfer)'}
              {modalType === 'target_reserve' && 'Hedef Kasa Bakiyesi (Nakit Rezerv)'}
            </h3>

            {actionError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">{actionError}</div>}
            {actionSuccess && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">{actionSuccess}</div>}

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {modalType === 'manual_rate' ? (
                <>
                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-950 font-medium">
                    ⚙️ Manuel kur girildiğinde sistem TCMB kurunu es geçerek yöneticinin belirlediği kuru kullanır. <strong>Geçmiş satış snapshot kurları kesinlikle etkilenmez</strong>.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Para Birimi *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('USD')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'USD' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('EUR')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'EUR' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        EUR (€)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Manuel Kur Değeri (TL) *</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      placeholder="Örn: 40.50"
                      value={manualRateInput}
                      onChange={(e) => setManualRateInput(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>
                </>
              ) : modalType === 'fx_capital' ? (
                <>
                  <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-xs text-cyan-950 font-medium">
                    💵 Döviz sermayesi kasaya eklendiğinde döviz kasası ve toplam varlık artar; <strong>satış cirosu, ticari kâr ve fiziki TL kasa kesinlikle etkilenmez</strong>.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Para Birimi *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('USD')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'USD' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('EUR')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'EUR' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        EUR (€)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Sermaye Miktarı *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Örn: 100"
                      value={foreignAmount}
                      onChange={(e) => setForeignAmount(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">İşlem Kuru (TL) *</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      placeholder="Örn: 40.00"
                      value={actualRate}
                      onChange={(e) => setActualRate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>
                </>
              ) : modalType === 'fx_convert' ? (
                <>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 font-medium">
                    💡 Kasadaki döviz bozdurulduğunda <strong>Fiziksel TL Kasa</strong> elde edilen TL kadar artar. Ağırlıklı ortalama maliyet kuru ile gerçekleşen fark <strong>Gerçekleşen Kur Farkı</strong> olarak raporlanır.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Para Birimi *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('USD')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'USD' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyCode('EUR')}
                        className={`w-1/2 py-2 font-bold rounded-xl text-sm border ${currencyCode === 'EUR' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        EUR (€)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Bozdurulacak Miktar *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Örn: 100"
                      value={foreignAmount}
                      onChange={(e) => setForeignAmount(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Gerçek Bozdurma Kuru (TL) *</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      placeholder="Örn: 41.00"
                      value={actualRate}
                      onChange={(e) => setActualRate(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>

                  {foreignAmount && actualRate && (
                    <div className="p-3 bg-slate-900 text-white rounded-xl text-xs flex justify-between items-center font-bold">
                      <span>Elde Edilecek TL Nakit:</span>
                      <span className="text-emerald-400 text-base font-black">
                        {(Number(foreignAmount) * Number(actualRate)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Açıklama</label>
                    <input
                      type="text"
                      placeholder="Örn: Bankada bozduruldu"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </>
              ) : modalType === 'target_reserve' ? (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Hedef Kasa Bakiyesi (TL) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={targetReserveTL}
                    onChange={(e) => setTargetReserveTL(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Kasada kalması gereken sabit işletme rezervidir. Kasadaki fiziki nakit bu tutarı aşınca banka uyarısı tetiklenir.
                  </p>
                </div>
              ) : (
                <>
                  {modalType === 'expense' && (
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Gider Kategorisi *</label>
                      <select
                        value={selectedExpenseCatId}
                        onChange={(e) => setSelectedExpenseCatId(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                      >
                        {expenseCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.is_salary_category ? '(Maaş)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Tutar (TL) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={amountTL}
                      onChange={(e) => setAmountTL(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-900"
                    />
                  </div>

                  {modalType === 'bank_deposit' && (
                    <>
                      <input
                        type="text"
                        placeholder="Banka Adı (Örn: Garanti BBVA)"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Dekont / Referans No"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </>
                  )}

                  {selectedExpenseCategoryObj?.is_salary_category && (
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Ödeme Yapılan Personel *</label>
                      <input
                        type="text"
                        required
                        placeholder="Personel Adı Soyadı"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      {modalType === 'withdrawal' ? 'Açıklama / Gerekçe *' : 'Açıklama'}
                    </label>
                    <textarea
                      required={modalType === 'withdrawal'}
                      rows={2}
                      placeholder="İşlem açıklaması..."
                      value={modalType === 'withdrawal' ? justification : description}
                      onChange={(e) => (modalType === 'withdrawal' ? setJustification(e.target.value) : setDescription(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="w-1/2 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50"
                >
                  {actionLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
