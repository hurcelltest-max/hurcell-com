'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ArrowRight, Tag } from 'lucide-react'
import type { Product } from '@/types'
import { getFallbackImage, formatPriceTRY, getPublicProductTitle } from '@/lib/constants'

interface HeroSliderProps {
  products: Product[];
  campaignsMap: Record<string, any>;
}

export function HeroSlider({ products, campaignsMap }: HeroSliderProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % products.length);
  }, [products.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? products.length - 1 : prev - 1));
  }, [products.length]);

  // Auto-play logic (7 seconds)
  useEffect(() => {
    if (products.length <= 1) return; // No need to auto-play if 1 or 0 products
    
    let interval: NodeJS.Timeout;
    if (!isHovered) {
      interval = setInterval(nextSlide, 7000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [nextSlide, isHovered, products.length]);

  if (!products || products.length === 0) return null;

  return (
    <div 
      className="relative w-full bg-slate-900 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Slider Container */}
      <div 
        className="flex transition-transform duration-700 ease-in-out h-full"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {products.map((product, index) => {
          const campaign = campaignsMap[product.id];
          const hasCampaign = product.is_campaign || campaign;
          const campaignTitle = product.campaign_title || campaign?.name || 'Kampanya';
          const campaignBenefit = product.campaign_benefit || (campaign?.discount_type === 'percentage' ? `%${campaign.discount_value} İndirim` : '');
          const showBenefit = product.show_campaign_benefit_in_slider !== false && campaignBenefit;

          // Arka plan rengi ayarlaması (beyaz arkaplanlı JPEg ürün fotoğraflarının beyaz kutu hissini kaldırmak için açık/modern tonlar)
          const bgColors = [
            'from-sky-50 via-white to-slate-100',
            'from-rose-50 via-white to-orange-50',
            'from-indigo-50 via-white to-purple-50',
            'from-emerald-50 via-white to-teal-50',
          ];
          const bgGradient = bgColors[index % bgColors.length];
          const isDiscounted = product.is_discounted && product.old_price && product.old_price > (product.sell_price || 0);

          return (
            <div 
              key={product.id} 
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a')) return;
                router.push(`/urun/${product.id}`);
              }}
              role="button"
              tabIndex={0}
              aria-label={`${product.name} ürününü incele`}
              className={`w-full flex-shrink-0 relative flex items-center justify-center min-h-[450px] md:min-h-[500px] bg-gradient-to-r ${bgGradient} cursor-pointer group/slider`}
            >
              {/* Arka plan dekorasyon */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:40px_40px]" />
              </div>

              <div className="max-w-[1400px] w-full mx-auto px-6 sm:px-10 lg:px-16 relative z-10 flex flex-col-reverse md:flex-row items-center justify-between gap-8 md:gap-12 py-12 md:py-16">
                
                {/* Sol Taraf: Metin İçeriği */}
                <div className="flex-1 text-center md:text-left space-y-6">
                  {/* Kampanya Rozeti */}
                  {(hasCampaign || isDiscounted) && (
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                      {hasCampaign && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-400 bg-rose-50 text-rose-600 text-xs font-bold uppercase tracking-wider shadow-sm">
                          <Tag size={12} className="animate-pulse" /> {campaignTitle}
                        </div>
                      )}
                      {isDiscounted && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-500 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider shadow-sm">
                          🔥 FIRSAT
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ürün Başlığı */}
                  <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-tight">
                    {getPublicProductTitle(product)}
                  </h2>

                  {/* Kampanya Faydası */}
                  {showBenefit && hasCampaign && (
                    <div className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold px-4 py-2 rounded-xl text-sm md:text-base shadow-lg shadow-amber-500/20">
                      🎁 {campaignBenefit}
                    </div>
                  )}

                  {/* Fiyat ve Buton */}
                  <div className="pt-4 flex flex-col md:flex-row items-center md:items-end gap-6 justify-center md:justify-start">
                    <div className="flex flex-col text-center md:text-left">
                      {isDiscounted ? (
                        <>
                          <span className="text-sm md:text-base text-slate-400 font-bold mb-0.5 line-through decoration-rose-400/50">
                            {formatPriceTRY(product.old_price || 0)}
                          </span>
                          <span className="text-3xl md:text-4xl font-black text-rose-600 tracking-tight">
                            {formatPriceTRY(product.sell_price || 0)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-slate-500 font-medium mb-1">Satış Fiyatı</span>
                          <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                            {formatPriceTRY(product.sell_price || 0)}
                          </span>
                        </>
                      )}
                    </div>
                    
                    <Link 
                      href={`/urun/${product.id}`}
                      className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm md:text-base transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 group"
                    >
                      Hemen İncele
                      <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>

                {/* Sağ Taraf: Görsel */}
                <div className="flex-1 w-full max-w-sm md:max-w-xl aspect-square relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-white/40 rounded-full blur-3xl mix-blend-overlay" />
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name} 
                      className="w-full h-full object-contain relative z-10 drop-shadow-2xl mix-blend-multiply scale-95 md:scale-100 group-hover/slider:scale-105 transition-transform duration-700" 
                    />
                  ) : (
                    <img 
                      src={getFallbackImage(product.category || '')} 
                      alt="Fallback" 
                      className="w-3/4 h-3/4 object-contain opacity-40 relative z-10 mix-blend-multiply group-hover/slider:scale-105 transition-transform duration-700" 
                    />
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Kontroller (Oklar) */}
      {products.length > 1 && (
        <>
          <button 
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all z-20 group"
          >
            <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <button 
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all z-20 group"
          >
            <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </>
      )}

      {/* Kontroller (Noktalar) */}
      {products.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {products.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`transition-all duration-300 rounded-full ${
                currentIndex === idx 
                  ? 'w-8 h-2 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]' 
                  : 'w-2 h-2 bg-white/40 hover:bg-white/70'
              }`}
              aria-label={`Slayt ${idx + 1}'e git`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
