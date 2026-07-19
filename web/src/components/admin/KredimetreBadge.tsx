import React, { useState } from 'react';

interface KredimetreBadgeProps {
  score: number | null;
  label: string;
  color: string;
  paidInstallments: number;
  onTimePaidInstallments: number;
  currentOverdueAmount: number;
  maximumDaysOverdue: number;
  limitUtilizationPercent: number;
  lastPaymentAt: string | null;
}

export default function KredimetreBadge({
  score,
  label,
  color,
  paidInstallments,
  onTimePaidInstallments,
  currentOverdueAmount,
  maximumDaysOverdue,
  limitUtilizationPercent,
  lastPaymentAt
}: KredimetreBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Color Mapping
  let badgeClasses = 'bg-gray-50 text-gray-500 border-gray-200';
  let dotClasses = 'bg-gray-400';

  if (color === 'green') {
    badgeClasses = 'bg-green-50 text-green-700 border-green-200';
    dotClasses = 'bg-green-500';
  } else if (color === 'yellow') {
    badgeClasses = 'bg-yellow-50 text-yellow-700 border-yellow-200';
    dotClasses = 'bg-yellow-500';
  } else if (color === 'orange') {
    badgeClasses = 'bg-orange-50 text-orange-700 border-orange-200';
    dotClasses = 'bg-orange-500';
  } else if (color === 'red') {
    badgeClasses = 'bg-red-50 text-red-700 border-red-200';
    dotClasses = 'bg-red-500';
  }

  // Calculate On-Time Payment Rate (%)
  const onTimeRate = paidInstallments > 0
    ? Math.round((onTimePaidInstallments / paidInstallments) * 100)
    : 0;

  // Format Date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const scoreText = score !== null ? `${score} / 100` : '—';
  const shortSummary = `Kredimetre Skor: ${scoreText} - ${label || 'Veri Yok'}. Detay için imleci getirin veya odaklanın.`;

  return (
    <div
      className="relative inline-block cursor-help select-none outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
      tabIndex={0}
      aria-label={`HurCELL Kredimetre Skoru: ${scoreText}, Durum: ${label || 'Veri Yok'}`}
      title={shortSummary}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <div className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg border text-xs font-semibold ${badgeClasses}`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`}></span>
          <span>{scoreText}</span>
        </div>
        <div className="text-[10px] opacity-80 mt-0.5">{label || 'Veri Yok'}</div>
      </div>

      {showTooltip && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-100 p-4 text-xs space-y-3 font-normal transition-all duration-200"
          role="tooltip"
        >
          <div className="font-bold border-b border-gray-100 pb-1.5 text-gray-900 flex justify-between">
            <span>Kredimetre Detayı</span>
            <span className="text-gray-500">{score !== null ? `${score} Puan` : '—'}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Zamanında Ödeme Oranı:</span>
              <span className="font-medium text-gray-900">
                {paidInstallments > 0 ? `%${onTimeRate} (${onTimePaidInstallments}/${paidInstallments})` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gecikmiş Borç:</span>
              <span className={`font-semibold ${currentOverdueAmount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {currentOverdueAmount > 0 ? `${currentOverdueAmount.toFixed(2)} TL` : '0.00 TL'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">En Yüksek Gecikme Günü:</span>
              <span className={`font-medium ${maximumDaysOverdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {maximumDaysOverdue > 0 ? `${maximumDaysOverdue} Gün` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Limit Kullanım Oranı:</span>
              <span className="font-medium text-gray-900">%{limitUtilizationPercent.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Son Ödeme Tarihi:</span>
              <span className="font-medium text-gray-900">{formatDate(lastPaymentAt)}</span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-2 text-[10px] text-gray-400 italic text-center leading-normal">
            HurCELL iç ödeme risk göstergesidir; banka kredi notu değildir.
          </div>

          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white"></div>
        </div>
      )}
    </div>
  );
}
