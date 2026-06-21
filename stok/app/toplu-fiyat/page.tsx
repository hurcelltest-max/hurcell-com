'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  calculateNewPrice, 
  RoundingType, 
  validateExchangeRate, 
  validateForeignBuyPrice, 
  calculateKeepRatioPrice 
} from '@/lib/priceMath';
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
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD');
  const [sellCalculationMethod, setSellCalculationMethod] = useState<'markup' | 'margin' | 'keep_ratio' | 'buy_only'>('keep_ratio');

  const [brandSelectName, setBrandSelectName] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingSelect, setLoadingSelect] = useState(false);
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
    
    // Add required snapshot fields if missing
    const formattedItem = {
      ...item,
      expected_old_buy_currency: item.buy_currency || 'TRY',
      expected_old_foreign_buy_price: item.foreign_buy_price || null,
      expected_old_buy_price: item.buy_price,
      expected_old_sell_price: item.sell_price
    };

    setSelectedItems([...selectedItems, formattedItem]);
  };

  const handleRemove = (id: string) => {
    setSelectedItems(selectedItems.filter(i => i.id !== id));
  };

  const handleBulkSelect = async (type: string) => {
    setLoadingSelect(true);
    try {
      let url = `/api/products/bulk-select-preview?selectionType=${type}`;
      if (type === 'brand') {
        if (!brandSelectName.trim()) return alert('Lütfen marka ismi girin.');
        url += `&brandName=${encodeURIComponent(brandSelectName.trim())}`;
      } else if (type === 'search') {
        if (searchTerm.length < 3) return alert('Arama terimi en az 3 karakter olmalıdır.');
        url += `&q=${encodeURIComponent(searchTerm)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Seçim sırasında hata oluştu.');

      if (data.length === 0) {
        alert('Kriterlere uyan hiçbir ürün bulunamadı.');
        return;
      }

      setSelectedItems(data);
      alert(`${data.length} ürün başarıyla seçildi.`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(errMsg);
    } finally {
      setLoadingSelect(false);
    }
  };

  const previewItems = selectedItems.map(item => {
    let new_buy_price = item.buy_price;
    let new_sell_price = item.sell_price;
    let status: 'Güncellenecek' | 'Atlandı' | 'Hata' = 'Güncellenecek';
    let message = '';

    try {
      if (actionType === 'currency_update') {
        if (item.buy_currency !== currency) {
          status = 'Atlandı';
          message = `Para birimi ${item.buy_currency} (${currency} değil)`;
        } else if (item.foreign_buy_price === null || item.foreign_buy_price === undefined || item.foreign_buy_price <= 0) {
          status = 'Atlandı';
          message = 'Döviz alış fiyatı sıfır veya eksik';
        } else {
          const validRate = validateExchangeRate(exchangeRate);
          const validForeignPrice = validateForeignBuyPrice(item.foreign_buy_price);

          new_buy_price = calculateNewPrice(validForeignPrice, 'currency_update', 0, 'none', validRate);

          if (sellCalculationMethod === 'markup') {
            new_sell_price = calculateNewPrice(new_buy_price, 'markup', value, rounding);
          } else if (sellCalculationMethod === 'margin') {
            new_sell_price = calculateNewPrice(new_buy_price, 'margin', value, rounding);
          } else if (sellCalculationMethod === 'keep_ratio') {
            new_sell_price = calculateKeepRatioPrice(item.buy_price, item.sell_price, new_buy_price, rounding);
          } else if (sellCalculationMethod === 'buy_only') {
            new_sell_price = item.sell_price;
          } else {
            status = 'Hata';
            message = 'Geçersiz satış yöntemi';
          }
        }
      } else {
        // Normal price action applies to sell_price
        new_sell_price = calculateNewPrice(item.sell_price, actionType, value, rounding);
        
        // If it's margin/markup, it's based on buy_price!
        if (actionType === 'margin' || actionType === 'markup') {
          new_sell_price = calculateNewPrice(item.buy_price, actionType, value, rounding);
        }
      }
    } catch (err: unknown) {
      status = 'Hata';
      message = err instanceof Error ? err.message : String(err);
    }

    const diffTL = new_sell_price - item.sell_price;
    const diffPercent = item.sell_price > 0 ? (diffTL / item.sell_price) * 100 : 0;

    return {
      ...item,
      new_buy_price,
      new_sell_price,
      diffTL,
      diffPercent,
      status,
      message,
      expected_old_buy_currency: item.buy_currency || 'TRY',
      expected_old_foreign_buy_price: item.foreign_buy_price || null,
      expected_old_buy_price: item.buy_price,
      expected_old_sell_price: item.sell_price
    };
  });

  const stats = {
    total: selectedItems.length,
    updated: previewItems.filter(i => i.status === 'Güncellenecek').length,
    skipped: previewItems.filter(i => i.status === 'Atlandı').length,
    errors: previewItems.filter(i => i.status === 'Hata').length,
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) return alert('Ürün seçmediniz.');
    if (stats.updated === 0) return alert('Güncellenecek geçerli bir ürün bulunamadı.');
    
    if (actionType === 'margin' && (value < 0 || value >= 100)) {
      return alert('Marj 0 ile 100 arasında olmalıdır.');
    }
    if (actionType === 'currency_update' && sellCalculationMethod === 'margin' && (value < 0 || value >= 100)) {
      return alert('Marj 0 ile 100 arasında olmalıdır.');
    }

    const confirmMsg = `Bu işlem ${stats.updated} ürünü güncelleyecek. Geri alma loglardan yapılabilir. Devam edilsin mi?`;
    if (!window.confirm(confirmMsg)) return;

    setLoadingSubmit(true);
    try {
      const targetItems = previewItems
        .filter(i => i.status === 'Güncellenecek')
        .map(i => ({
          id: i.id,
          expected_old_buy_currency: i.expected_old_buy_currency,
          expected_old_foreign_buy_price: i.expected_old_foreign_buy_price,
          expected_old_buy_price: i.expected_old_buy_price,
          expected_old_sell_price: i.expected_old_sell_price
        }));

      const payload = {
        actionType,
        rounding,
        value,
        exchangeRate,
        currency,
        sellCalculationMethod,
        items: targetItems
      };

      const res = await fetch('/api/products/bulk-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('Bazı ürün fiyatları önizlemeden sonra değişmiş. Lütfen önizlemeyi yenileyin.');
        }
        throw new Error(data.error || 'İşlem başarısız');
      }

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sol Sütun: Arama ve Toplu Seçim Panelleri */}
        <div className="lg:col-span-1 space-y-6">
          {/* Toplu Seçim Kartı */}
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4 text-slate-900">Toplu Seçim Paneli</h2>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => handleBulkSelect('all')} 
                disabled={loadingSelect} 
                className="bg-indigo-600 text-white text-xs font-semibold p-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Tümünü Seç
              </button>
              <button 
                onClick={() => handleBulkSelect('web_visible')} 
                disabled={loadingSelect} 
                className="bg-indigo-600 text-white text-xs font-semibold p-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Webde Görünenler
              </button>
              <button 
                onClick={() => handleBulkSelect('web_invisible')} 
                disabled={loadingSelect} 
                className="bg-indigo-600 text-white text-xs font-semibold p-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Webde Olmayanlar
              </button>
              <button 
                onClick={() => handleBulkSelect('foreign_currency')} 
                disabled={loadingSelect} 
                className="bg-indigo-600 text-white text-xs font-semibold p-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Dövizli Alışlılar
              </button>
              <button 
                onClick={() => handleBulkSelect('try_currency')} 
                disabled={loadingSelect} 
                className="bg-indigo-600 text-white text-xs font-semibold p-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Sadece TRY Alışlı
              </button>
            </div>
            <div className="mt-4 border-t pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Markaya Göre Seç</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={brandSelectName} 
                  onChange={(e) => setBrandSelectName(e.target.value)} 
                  placeholder="Marka ismi (örn: Apple)" 
                  className="flex-1 border border-slate-300 p-2 rounded bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
                <button 
                  onClick={() => handleBulkSelect('brand')} 
                  disabled={loadingSelect} 
                  className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                >
                  Seç
                </button>
              </div>
            </div>
          </div>

          {/* Manuel Ürün Ara Kartı */}
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4 text-slate-900">Ürün Ara (Tek Tek Ekle)</h2>
            <form onSubmit={handleSearch} className="flex space-x-2">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="Barkod, isim, marka (min 3 harf)"
                className="flex-1 border border-slate-300 p-2 rounded bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <button 
                type="submit" 
                disabled={loadingSearch} 
                className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                Ara
              </button>
            </form>
            <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map(p => (
                <div key={p.id} className="flex justify-between items-center p-2 hover:bg-slate-50 border-b border-slate-100">
                  <div>
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.barcode} | {p.brand}</div>
                  </div>
                  <button 
                    onClick={() => handleSelect(p)} 
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold border border-indigo-600 hover:border-indigo-800 px-2 py-1 rounded bg-white transition-colors"
                  >
                    Ekle
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Orta Sütun: İşlem Ayarları ve Seçim Özeti */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4 text-slate-900">İşlem Ayarları</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">İşlem Türü</label>
                <select 
                  value={actionType} 
                  onChange={(e) => setActionType(e.target.value as BatchActionType)} 
                  className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="markup">Maliyete Eklenen Kâr (Markup %)</option>
                  <option value="margin">Kâr Marjı (Margin %)</option>
                  <option value="flat_increase">Sabit Artış (TL)</option>
                  <option value="flat_decrease">Sabit Azalış (TL)</option>
                  <option value="percent_increase">Mevcut satış fiyatına yüzde zam (%)</option>
                  <option value="percent_decrease">Yüzde Azalış (%)</option>
                  <option value="currency_update">Döviz Kuruna Göre Güncelle</option>
                </select>
              </div>

              {actionType === 'currency_update' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Para Birimi</label>
                      <select 
                        value={currency} 
                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'EUR')} 
                        className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 focus:outline-none"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Yeni Döviz Kuru (₺)</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        value={exchangeRate} 
                        onChange={(e) => setExchangeRate(Number(e.target.value))} 
                        className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Satış Hesaplama Yöntemi</label>
                    <select 
                      value={sellCalculationMethod} 
                      onChange={(e) => setSellCalculationMethod(e.target.value as 'markup' | 'margin' | 'keep_ratio' | 'buy_only')} 
                      className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 focus:outline-none"
                    >
                      <option value="keep_ratio">Mevcut kâr oranını koru</option>
                      <option value="markup">Maliyete yüzde kâr ekle (Markup %)</option>
                      <option value="margin">Kâr marjı ile hesapla (Margin %)</option>
                      <option value="buy_only">Sadece TL alış güncelle, satışa dokunma</option>
                    </select>
                  </div>
                </>
              )}

              {/* Oran/Tutar girdisi sadece gerekli modlarda gösterilir */}
              {(actionType !== 'currency_update' || sellCalculationMethod === 'markup' || sellCalculationMethod === 'margin') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {actionType === 'currency_update' ? 'Satış Kâr Oranı (%)' : 'Oran / Tutar'}
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={value} 
                    onChange={(e) => setValue(Number(e.target.value))} 
                    className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">Yuvarlama</label>
                <select 
                  value={rounding} 
                  onChange={(e) => setRounding(e.target.value as RoundingType)} 
                  className="w-full border border-slate-300 p-2 rounded mt-1 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="none">Yuvarlama Yok (İki Ondalık)</option>
                  <option value="tam_tl">Tam TL (Yukarı)</option>
                  <option value="yakin_10">En Yakın Üst 10 TL</option>
                  <option value="sonu_9_90">Sonu 9,90</option>
                  <option value="sonu_99_90">Sonu 99,90</option>
                </select>
              </div>
            </div>
          </div>

          {/* İstatistikler Kartı */}
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4 text-slate-900">Seçim ve Güncelleme Özeti</h2>
            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded border border-slate-200 text-center text-sm font-semibold">
              <div>
                <div className="text-slate-500 text-[10px]">Toplam Seçilen</div>
                <div className="text-slate-900 text-lg mt-0.5">{stats.total}</div>
              </div>
              <div>
                <div className="text-green-600 text-[10px]">Güncellenecek</div>
                <div className="text-green-700 text-lg mt-0.5">{stats.updated}</div>
              </div>
              <div>
                <div className="text-amber-600 text-[10px]">Atlanacak</div>
                <div className="text-amber-700 text-lg mt-0.5">{stats.skipped}</div>
              </div>
              <div>
                <div className="text-red-600 text-[10px]">Hatalı</div>
                <div className="text-red-700 text-lg mt-0.5">{stats.errors}</div>
              </div>
            </div>

            {/* Atlanan/Hatalı durum açıklamaları */}
            {selectedItems.length > 0 && (stats.skipped > 0 || stats.errors > 0) && (
              <div className="mt-3 text-xs space-y-1 text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100 max-h-32 overflow-y-auto">
                <div className="font-semibold text-slate-700 mb-1">Uyarılar & Durum Detayları:</div>
                {previewItems.map(p => {
                  if (p.status !== 'Güncellenecek') {
                    return (
                      <div key={p.id} className="truncate">
                        • <span className="font-medium text-slate-800">{p.name}</span>: {p.message || 'Atlandı'}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="mt-4 flex justify-between items-center">
                <button 
                  onClick={() => setSelectedItems([])} 
                  className="text-sm text-red-600 hover:text-red-800 font-semibold transition-colors"
                >
                  Seçilenleri Temizle
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sağ Sütun: Genişletilmiş Önizleme Tablosu */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4 text-slate-900">Fiyat Önizleme Tablosu</h2>
            <div className="overflow-x-auto border rounded border-slate-200">
              <table className="w-full text-xs text-left min-w-[600px]">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                  <tr>
                    <th className="p-2 border-b border-slate-200">Ürün</th>
                    <th className="p-2 border-b border-slate-200">PB</th>
                    <th className="p-2 border-b border-slate-200 text-right">Döviz Alış</th>
                    <th className="p-2 border-b border-slate-200 text-right">Eski Alış</th>
                    <th className="p-2 border-b border-slate-200 text-right text-indigo-700">Yeni Alış</th>
                    <th className="p-2 border-b border-slate-200 text-right">Eski Satış</th>
                    <th className="p-2 border-b border-slate-200 text-right text-indigo-700">Yeni Satış</th>
                    <th className="p-2 border-b border-slate-200 text-right">Artış %</th>
                    <th className="p-2 border-b border-slate-200 text-center">Durum</th>
                    <th className="p-2 border-b border-slate-200 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.slice(0, 10).map(p => (
                    <tr key={p.id} className="border-b border-slate-100 text-slate-800 hover:bg-slate-50/50">
                      <td className="p-2 font-medium text-slate-900 truncate max-w-[120px]" title={p.name}>
                        {p.name}
                        <div className="text-[10px] text-slate-500 font-normal">{p.barcode || p.brand}</div>
                      </td>
                      <td className="p-2 text-slate-600">{p.buy_currency}</td>
                      <td className="p-2 text-right text-slate-600">
                        {p.foreign_buy_price ? `${p.foreign_buy_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-2 text-right text-slate-600">{p.buy_price.toFixed(2)} ₺</td>
                      <td className="p-2 text-right font-medium text-indigo-700">{p.new_buy_price.toFixed(2)} ₺</td>
                      <td className="p-2 text-right text-slate-600">{p.sell_price.toFixed(2)} ₺</td>
                      <td className="p-2 text-right font-semibold text-indigo-700">{p.new_sell_price.toFixed(2)} ₺</td>
                      <td className="p-2 text-right text-slate-600">
                        {p.diffPercent > 0 ? `+${p.diffPercent.toFixed(1)}%` : `${p.diffPercent.toFixed(1)}%`}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'Güncellenecek' ? 'bg-green-100 text-green-800' :
                          p.status === 'Atlandı' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => handleRemove(p.id)} 
                          className="text-red-500 hover:text-red-700 font-bold"
                          title="Seçimden kaldır"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {previewItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-4 text-center text-slate-500">Önizleme listesi boş. Lütfen ürün seçin.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {previewItems.length > 10 && (
              <div className="text-[10px] text-slate-500 mt-2 font-medium">
                ... ve {previewItems.length - 10} ürün daha listede (Gösterim performansı için ilk 10 satır listelenmektedir).
              </div>
            )}
            
            <div className="mt-6">
              <button 
                onClick={handleSubmit} 
                disabled={loadingSubmit || stats.updated === 0} 
                className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:opacity-100 disabled:cursor-not-allowed transition-colors"
              >
                {loadingSubmit ? 'İşleniyor...' : `Seçili ${stats.updated} Ürünü Kaydet/Uygula`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
