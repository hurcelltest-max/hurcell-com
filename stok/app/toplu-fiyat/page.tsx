'use client';

import { useState } from 'react';
import Link from 'next/link';
import { calculateNewPrice, RoundingType } from '@/lib/priceMath';
import { BatchActionType } from '@/lib/types';
import { Product } from '@/lib/productService';

export default function TopluFiyatPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] = useState<Product[]>([]);
  
  const [actionType, setActionType] = useState<BatchActionType>('markup');
  const [rounding, setRounding] = useState<RoundingType>('none');
  const [value, setValue] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.length < 3) return alert('En az 3 karakter girmelisiniz.');
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Arama hatası');
      setSearchResults(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(errMsg);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSelect = (item: Product) => {
    if (selectedItems.find(i => i.id === item.id)) return;
    if (selectedItems.length >= 1000) return alert('En fazla 1000 ürün seçebilirsiniz.');
    setSelectedItems([...selectedItems, item]);
  };

  const handleRemove = (id: string) => {
    setSelectedItems(selectedItems.filter(i => i.id !== id));
  };

  const previewItems = selectedItems.map(item => {
    let new_buy_price = item.buy_price;
    let new_sell_price = item.sell_price;
    const new_buy_currency = item.buy_currency;
    const new_foreign_buy_price = item.foreign_buy_price;

    try {
      if (actionType === 'currency_update') {
        if (new_buy_currency !== 'TRY' && new_foreign_buy_price && new_foreign_buy_price > 0) {
          new_buy_price = calculateNewPrice(new_foreign_buy_price, 'currency_update', 0, 'none', exchangeRate);
          const marginRatio = item.buy_price > 0 ? item.sell_price / item.buy_price : 1;
          new_sell_price = calculateNewPrice(new_buy_price * marginRatio, 'flat_increase', 0, rounding);
        }
      } else if (actionType === 'margin' || actionType === 'markup') {
        new_sell_price = calculateNewPrice(item.buy_price, actionType, value, rounding);
      } else {
        new_sell_price = calculateNewPrice(item.sell_price, actionType, value, rounding);
      }
    } catch {
      // Ignored for preview, will throw error if invalid
    }

    return {
      ...item,
      new_buy_price,
      new_sell_price,
    };
  });

  const handleSubmit = async () => {
    if (selectedItems.length === 0) return alert('Ürün seçmediniz.');
    if (actionType === 'margin' && (value < 0 || value >= 100)) return alert('Marj 0 ile 100 arasında olmalıdır.');
    if (!window.confirm(`${selectedItems.length} ürün güncellenecek. Onaylıyor musunuz?`)) return;

    setLoadingSubmit(true);
    try {
      const payload = {
        actionType,
        rounding,
        value,
        exchangeRate,
        items: selectedItems.map(i => ({
          id: i.id,
          expected_old_buy_currency: i.buy_currency,
          expected_old_foreign_buy_price: i.foreign_buy_price,
          expected_old_buy_price: i.buy_price,
          expected_old_sell_price: i.sell_price
        }))
      };

      const res = await fetch('/api/products/bulk-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız');

      alert(`İşlem başarıyla tamamlandı. Batch ID: ${data.batchId}`);
      setSelectedItems([]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`Hata: ${errMsg}`);
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Toplu Fiyat Güncelleme</h1>
        <Link href="/toplu-fiyat/loglar" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
          İşlem Geçmişi & Loglar
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Sol Panel: Arama ve Seçim */}
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4">Ürün Ara</h2>
            <form onSubmit={handleSearch} className="flex space-x-2">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="Barkod, isim, marka, model (min 3 harf)"
                className="flex-1 border p-2 rounded"
              />
              <button type="submit" disabled={loadingSearch} className="bg-gray-800 text-white px-4 py-2 rounded">
                Ara
              </button>
            </form>
            <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map(p => (
                <div key={p.id} className="flex justify-between items-center p-2 hover:bg-gray-50 border-b">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.barcode} | {p.brand}</div>
                  </div>
                  <button onClick={() => handleSelect(p)} className="text-indigo-600 text-sm font-semibold border border-indigo-600 px-2 py-1 rounded">Ekle</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4">Seçilen Ürünler ({selectedItems.length})</h2>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {selectedItems.map(p => (
                <div key={p.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <div className="truncate text-sm mr-2">{p.name}</div>
                  <button onClick={() => handleRemove(p.id)} className="text-red-500 text-xs">Kaldır</button>
                </div>
              ))}
              {selectedItems.length === 0 && <p className="text-gray-500 text-sm">Henüz ürün seçilmedi.</p>}
            </div>
            {selectedItems.length > 0 && (
              <button onClick={() => setSelectedItems([])} className="mt-4 text-sm text-red-600">Tümünü Temizle</button>
            )}
          </div>
        </div>

        {/* Sağ Panel: İşlem ve Önizleme */}
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4">İşlem Ayarları</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium">İşlem Türü</label>
                <select value={actionType} onChange={(e) => setActionType(e.target.value as BatchActionType)} className="w-full border p-2 rounded mt-1">
                  <option value="markup">Maliyete Eklenen Kâr (Markup %)</option>
                  <option value="margin">Kâr Marjı (Margin %)</option>
                  <option value="flat_increase">Sabit Artış (TL)</option>
                  <option value="flat_decrease">Sabit Azalış (TL)</option>
                  <option value="percent_increase">Yüzde Artış (%)</option>
                  <option value="percent_decrease">Yüzde Azalış (%)</option>
                  <option value="currency_update">Döviz Kuru Güncellemesi</option>
                </select>
              </div>

              {actionType !== 'currency_update' ? (
                <div>
                  <label className="block text-sm font-medium">Oran / Tutar</label>
                  <input type="number" step="0.01" value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full border p-2 rounded mt-1" />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium">Yeni Döviz Kuru (₺)</label>
                  <input type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} className="w-full border p-2 rounded mt-1" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium">Yuvarlama</label>
                <select value={rounding} onChange={(e) => setRounding(e.target.value as RoundingType)} className="w-full border p-2 rounded mt-1">
                  <option value="none">Yuvarlama Yok (İki Ondalık)</option>
                  <option value="tam_tl">Tam TL (Yukarı)</option>
                  <option value="yakin_10">En Yakın Üst 10 TL</option>
                  <option value="sonu_9_90">Sonu 9,90</option>
                  <option value="sonu_99_90">Sonu 99,90</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border overflow-x-auto">
            <h2 className="text-xl font-semibold mb-4">Önizleme</h2>
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2">Ürün</th>
                  <th className="p-2">Mevcut TL Satış</th>
                  <th className="p-2 text-indigo-600">Yeni Satış</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.slice(0, 5).map(p => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2 truncate max-w-[150px]">{p.name}</td>
                    <td className="p-2">{p.sell_price.toFixed(2)} ₺</td>
                    <td className="p-2 font-semibold text-indigo-600">{p.new_sell_price.toFixed(2)} ₺</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewItems.length > 5 && <div className="text-xs text-gray-500 mt-2">... ve {previewItems.length - 5} ürün daha</div>}
            
            <div className="mt-6">
              <button 
                onClick={handleSubmit} 
                disabled={loadingSubmit || selectedItems.length === 0} 
                className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loadingSubmit ? 'İşleniyor...' : `Seçili ${selectedItems.length} Ürünü Kaydet`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
