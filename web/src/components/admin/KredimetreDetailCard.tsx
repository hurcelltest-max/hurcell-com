import React from 'react';

interface KredimetreDetailCardProps {
  score: number | null;
  label: string;
  color: string;
  paidInstallments: number;
  onTimePaidInstallments: number;
  currentOverdueAmount: number;
  maximumDaysOverdue: number;
  limitUtilizationPercent: number;
  lastPaymentAt: string | null;
  totalPlans: number;
  dueInstallments: number;
  loading: boolean;
  error: boolean;
}

export default function KredimetreDetailCard({
  score,
  label,
  color,
  paidInstallments,
  onTimePaidInstallments,
  currentOverdueAmount,
  maximumDaysOverdue,
  limitUtilizationPercent,
  lastPaymentAt,
  totalPlans,
  dueInstallments,
  loading,
  error
}: KredimetreDetailCardProps) {
  if (loading) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-gray-100 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 bg-red-50/50">
        <h2 className="text-lg font-semibold text-red-950 mb-2">HurCELL Kredimetre</h2>
        <p className="text-red-700 text-xs font-semibold">Kredimetre bilgisi şu anda yüklenemedi.</p>
      </div>
    );
  }

  // Safe normalization of numeric properties
  const normalizedScore = score !== null && Number.isFinite(Number(score)) ? Number(score) : null;
  const safeScore = normalizedScore === null
    ? null
    : Math.max(0, Math.min(100, Math.round(normalizedScore)));

  const overdueAmount = Number(currentOverdueAmount);
  const safeOverdueAmount = Number.isFinite(overdueAmount) ? Math.max(0, overdueAmount) : 0;

  const maxDaysOverdue = Number(maximumDaysOverdue);
  const safeMaximumDaysOverdue = Number.isFinite(maxDaysOverdue) ? Math.max(0, maxDaysOverdue) : 0;

  const limitUtilPercent = Number(limitUtilizationPercent);
  const safeLimitUtilizationPercent = Number.isFinite(limitUtilPercent) ? Math.max(0, limitUtilPercent) : 0;

  const paidInst = Number(paidInstallments);
  const safePaidInstallments = Number.isFinite(paidInst) ? Math.max(0, paidInst) : 0;

  const onTimePaidInst = Number(onTimePaidInstallments);
  const safeOnTimePaidInstallments = Number.isFinite(onTimePaidInst) ? Math.max(0, onTimePaidInst) : 0;

  const totPlans = Number(totalPlans);
  const safeTotalPlans = Number.isFinite(totPlans) ? Math.max(0, totPlans) : 0;

  const dueInst = Number(dueInstallments);
  const safeDueInstallments = Number.isFinite(dueInst) ? Math.max(0, dueInst) : 0;

  // Score null enforcement
  const isNoData = safeScore === null;
  const displayLabel = isNoData ? 'Veri Yok' : label || 'Veri Yok';
  const displayColor = isNoData ? 'gray' : color;

  // Color Mapping using displayColor
  let borderClass = 'border-gray-200 bg-gray-50/30';
  let badgeClass = 'bg-gray-100 text-gray-800';
  let dotClass = 'bg-gray-400';

  if (displayColor === 'green') {
    borderClass = 'border-green-100 bg-green-50/10';
    badgeClass = 'bg-green-50 text-green-700 border-green-200';
    dotClass = 'bg-green-500';
  } else if (displayColor === 'yellow') {
    borderClass = 'border-yellow-100 bg-yellow-50/10';
    badgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
    dotClass = 'bg-yellow-505'; // note: dotColor class uses displayColor, let's keep consistent bg-yellow-500
    dotClass = 'bg-yellow-500';
  } else if (displayColor === 'orange') {
    borderClass = 'border-orange-100 bg-orange-50/10';
    badgeClass = 'bg-orange-50 text-orange-700 border-orange-200';
    dotClass = 'bg-orange-500';
  } else if (displayColor === 'red') {
    borderClass = 'border-red-100 bg-red-50/10';
    badgeClass = 'bg-red-50 text-red-700 border-red-200';
    dotClass = 'bg-red-500';
  }

  let onTimeRate = safePaidInstallments > 0
    ? Math.round((safeOnTimePaidInstallments / safePaidInstallments) * 100)
    : 0;
  onTimeRate = Math.max(0, Math.min(100, onTimeRate));

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const scoreText = safeScore !== null ? `${safeScore} / 100` : '—';

  return (
    <div className={`bg-white p-6 rounded-2xl shadow-sm border ${borderClass} transition-all duration-200`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">HurCELL Kredimetre</h2>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mt-0.5">İç Ödeme Risk Göstergesi</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold ${badgeClass}`}>
            <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
            <span>{scoreText}</span>
          </div>
          <div className="text-xs text-gray-500 font-semibold uppercase">{displayLabel}</div>
        </div>
      </div>

      {isNoData ? (
        <div className="text-center py-4 bg-gray-50/50 rounded-xl border border-gray-100/50">
          <p className="text-gray-500 text-sm font-medium">Henüz değerlendirme için yeterli ödeme geçmişi bulunmuyor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Ödeme Performansı</p>
            <p className="text-sm font-bold text-gray-900">%{onTimeRate} Zamanında</p>
            <p className="text-[10px] text-gray-500 mt-0.5">({safeOnTimePaidInstallments} / {safePaidInstallments} Taksit)</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Gecikmiş Borç</p>
            <p className={`text-sm font-bold ${safeOverdueAmount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              ₺{safeOverdueAmount.toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">Maks. {safeMaximumDaysOverdue} Gün Gecikme</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Limit Kullanımı</p>
            <p className="text-sm font-bold text-gray-900">%{safeLimitUtilizationPercent.toFixed(1)}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Toplam {safeTotalPlans} Finans Planı</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Son Ödeme ve Taksit</p>
            <p className="text-sm font-bold text-gray-900">{formatDate(lastPaymentAt)}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Toplam Vadesi Gelen: {safeDueInstallments}</p>
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3 mt-4 text-[10px] text-gray-400 italic text-center leading-normal">
        HurCELL iç ödeme risk göstergesidir; banka kredi notu değildir.
      </div>
    </div>
  );
}
