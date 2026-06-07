'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Product } from '@/lib/types';

const formatCurrencyTRY = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export default function B2bProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const fetchB2bProducts = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('products')
        .select('*')
        .eq('is_b2b_visible', true)
        .gt('stock', 0)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching B2B products:', error);
      } else {
        setProducts(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchB2bProducts();
  }, []);

  // Filter products by search query and category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.brand || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.b2b_package_title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'All' ||
      (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  // Extract unique categories from B2B products
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c)))];

  return (
    <div className="space-y-6">
      {/* Upper Info Banner */}
      <div className="rounded-3xl border border-sky-100 bg-sky-50/50 p-6">
        <h2 className="text-xl font-bold text-sky-900">Hoş Geldiniz!</h2>
        <p className="mt-1.5 text-sm text-sky-700 leading-relaxed">
          B2B Toptan Kataloğundasınız. Bu sayfada sadece HurCELL tarafından bayilere özel tanımlanmış 
          toptan paketler ve indirimli adetli ürünler listelenmektedir. Sipariş vermek veya özel teklif almak 
          istediğiniz ürünler için lütfen Hurcell Toptan WhatsApp hattımızla veya yöneticinizle irtibata geçin.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-5 rounded-3xl border border-slate-200 shadow-sm shadow-slate-900/5">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Ürün adı, marka, model veya paket ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-10 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
          <span className="absolute right-3.5 top-3.5 text-slate-400">🔍</span>
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'All' ? 'Tüm Kategoriler' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
            <p className="text-sm text-slate-500">Katalog yükleniyor...</p>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="text-4xl">📦</span>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Aradığınız Ürün Bulunamadı</h3>
          <p className="mt-1 text-sm text-slate-500">
            Arama kriterlerinizi değiştirmeyi veya filtreleri temizlemeyi deneyin.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((p) => {
            const hasPrice = p.b2b_package_price !== null && p.b2b_package_price !== undefined;
            return (
              <div
                key={p.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 transition duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                {/* Product Image Box */}
                <div className="relative flex h-48 items-center justify-center bg-slate-50 border-b border-slate-100">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-6xl select-none">
                      {p.category?.toLowerCase() === 'telefon' ? '📱'
                        : p.category?.toLowerCase() === 'tablet' ? '📟'
                        : p.category?.toLowerCase() === 'bilgisayar' ? '💻'
                        : p.category?.toLowerCase() === 'aksesuar' ? '🎧'
                        : '📦'}
                    </span>
                  )}
                  {p.category && (
                    <span className="absolute left-4 top-4 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm border border-slate-100">
                      {p.category}
                    </span>
                  )}
                  {p.b2b_min_quantity && (
                    <span className="absolute right-4 top-4 rounded-lg bg-sky-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                      Min: {p.b2b_min_quantity} Adet
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-6 space-y-4">
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-900 leading-snug line-clamp-1 text-base" title={p.b2b_package_title || p.name}>
                      {p.b2b_package_title || p.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {(() => {
                        const subtitleParts = [];
                        if (p.b2b_package_title) subtitleParts.push(p.name);
                        if (p.brand) {
                          if (p.model) {
                            subtitleParts.push(`${p.brand} ${p.model}`);
                          } else {
                            subtitleParts.push(p.brand);
                          }
                        } else if (p.model) {
                          subtitleParts.push(p.model);
                        }
                        return subtitleParts.join(" • ");
                      })()}
                    </p>
                  </div>

                  {/* Stock & Minimum Quantity Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-3">
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Stok Durumu</p>
                      <p className="font-bold text-slate-700 mt-0.5">Stok: {p.stock} adet</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Min. Sipariş</p>
                      <p className="font-bold text-slate-700 mt-0.5">{p.b2b_min_quantity || 1} adet</p>
                    </div>
                  </div>

                  {/* Stock Availability Warning */}
                  {p.b2b_min_quantity && p.stock < p.b2b_min_quantity && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 font-semibold leading-relaxed">
                      ⚠️ Toptan satış için yeterli stok yok.
                    </div>
                  )}

                  {/* B2B Package Description */}
                  {p.b2b_package_description ? (
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {p.b2b_package_description}
                      </p>
                    </div>
                  ) : p.description ? (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  ) : null}

                  {/* Price Block & Action Info */}
                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        B2B Paket Fiyatı
                      </p>
                      {hasPrice ? (
                        <p className="text-lg font-black text-slate-900 mt-0.5">
                          {formatCurrencyTRY(p.b2b_package_price)}
                        </p>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200 mt-1">
                          Teklif Alın
                        </span>
                      )}
                    </div>
                    
                    <a
                      href={`https://wa.me/905322521199?text=Merhaba,%20B2B%20Toptan%20Kataloğundaki%20"${p.name}"%20ürünü%20hakkında%20bilgi%20ve%20teklif%20almak%20istiyorum.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-emerald-50 hover:bg-emerald-100 px-4 py-2.5 text-xs font-bold text-emerald-700 border border-emerald-100 transition cursor-pointer"
                    >
                      İletişime Geç
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
