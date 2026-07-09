'use client';

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Link as LinkIcon } from 'lucide-react';

export default function TransactionList({ transactions }: { transactions: any[] }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
        Henüz cari hareket yok.
      </div>
    );
  }

  const getCategoryLabel = (cat: string, method?: string) => {
    const labels: Record<string, string> = {
      purchase: 'Mağaza Satışı',
      fee: 'Hizmet Bedeli',
      payment: 'Tahsilat',
      adjustment: 'Düzeltme',
      reversal: 'İptal',
    };
    
    let label = labels[cat] || cat;
    if (cat === 'payment' && method) {
      const methods: Record<string, string> = {
        cash: 'Nakit', card: 'Kredi Kartı', bank_transfer: 'Havale/EFT', other: 'Diğer'
      };
      label += ` (${methods[method] || method})`;
    }
    return label;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
          <tr>
            <th className="py-3 px-4 rounded-tl-xl">Tarih</th>
            <th className="py-3 px-4">İşlem Tipi</th>
            <th className="py-3 px-4">Açıklama / Referans</th>
            <th className="py-3 px-4 text-right">Borç</th>
            <th className="py-3 px-4 text-right">Tahsilat</th>
            <th className="py-3 px-4 text-right">Kalan Bakiye</th>
            <th className="py-3 px-4 rounded-tr-xl">İşlem Yapan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-500">
                {new Date(tx.transaction_date).toLocaleString('tr-TR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </td>
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900">
                  {getCategoryLabel(tx.transaction_type, tx.payment_method)}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  #{tx.ledger_no} - {tx.source_type}
                </div>
              </td>
              <td className="py-3 px-4 max-w-xs truncate" title={tx.description}>
                <div className="text-gray-900 truncate">{tx.description}</div>
                {(tx.source_reference || tx.external_url) && (
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    {tx.source_reference && <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">{tx.source_reference}</span>}
                    {tx.external_url && (
                      <a href={tx.external_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
                        <LinkIcon className="w-3 h-3" /> Bağlantı
                      </a>
                    )}
                  </div>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                {tx.direction === 'debit' ? (
                  <span className="text-red-600 font-semibold flex items-center justify-end gap-1">
                    <ArrowUpRight className="w-4 h-4" /> ₺{tx.amount}
                  </span>
                ) : '-'}
              </td>
              <td className="py-3 px-4 text-right">
                {tx.direction === 'credit' ? (
                  <span className="text-green-600 font-semibold flex items-center justify-end gap-1">
                    <ArrowDownRight className="w-4 h-4" /> ₺{tx.amount}
                  </span>
                ) : '-'}
              </td>
              <td className="py-3 px-4 text-right font-medium text-gray-900">
                ₺{tx.balance_after}
              </td>
              <td className="py-3 px-4 text-gray-500 text-xs">
                {tx.admin_username}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
