'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TransactionForm({ cardToken, onSuccess }: { cardToken: string; onSuccess?: () => Promise<void> | void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [formData, setFormData] = useState({
    category: 'store_sale',
    amount: '',
    description: '',
    source_reference: '',
    external_url: '',
    payment_method: 'cash',
    reversed_transaction_id: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        cardToken,
        category: formData.category,
        amount: formData.amount,
        description: formData.description,
        source_reference: formData.source_reference,
        external_url: formData.external_url,
        payment_method: formData.payment_method,
        reversed_transaction_id: formData.reversed_transaction_id
      };

      const res = await fetch('/api/admin/cari/transactions/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Bir hata oluştu');
      }
      
      setFormData({
        category: 'store_sale',
        amount: '',
        description: '',
        source_reference: '',
        external_url: '',
        payment_method: 'cash',
        reversed_transaction_id: ''
      });
      setSuccessMessage('İşlem başarıyla eklendi.');
      setTimeout(() => setSuccessMessage(''), 3000);
      
      if (onSuccess) {
        await onSuccess();
      }
      router.refresh();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
      {successMessage && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{successMessage}</div>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">İşlem Kategori</label>
          <select 
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
          >
            <option value="store_sale">Mağaza Satışı (Borçlandır)</option>
            <option value="payment">Tahsilat / Ödeme Alma (Alacaklandır)</option>
            <option value="service_fee">Hizmet Bedeli (Borçlandır)</option>
            <option value="print_fee">Çıktı / Fotokopi Bedeli (Borçlandır)</option>
            <option value="technical_service_fee">Teknik Servis Bedeli (Borçlandır)</option>
            <option value="adjustment_debit">Bakiye Düzeltme (Borçlandır)</option>
            <option value="adjustment_credit">Bakiye Düzeltme (Alacaklandır)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (TL)</label>
          <input 
            required
            type="text"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
          />
        </div>

        {formData.category === 'payment' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ödeme Yöntemi</label>
            <select 
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
            >
              <option value="cash">Nakit</option>
              <option value="card">Kredi Kartı</option>
              <option value="bank_transfer">Havale / EFT</option>
              <option value="other">Diğer</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
          <input 
            required
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="İşlem detayı"
            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
          />
        </div>

        {formData.category === 'technical_service_fee' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Servis Kayıt No (Zorunlu)</label>
            <input 
              required
              type="text"
              name="source_reference"
              value={formData.source_reference}
              onChange={handleChange}
              placeholder="SERVIS-12345"
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Harici Bağlantı (Opsiyonel)</label>
          <input 
            type="url"
            name="external_url"
            value={formData.external_url}
            onChange={handleChange}
            placeholder="https://..."
            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button 
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'İşleniyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}
