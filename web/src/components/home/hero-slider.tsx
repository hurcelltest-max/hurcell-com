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

          // Arka plan rengi ayarlaması (kategoriye veya genel markaya göre renk verebiliriz, şimdilik modern koyu/mavi tonlar)
          const bgColors = [
            'from-blue-900/40 via-slate-900 to-slate-900',
            'from-indigo-900/40 via-slate-900 to-slate-900',
            'from-purple-900/40 via-slate-900 to-slate-900',
            'from-cyan-900/40 via-slate-900 to-slate-900',
          ];
          const bgGradient = bgColors[index % bgColors.length];

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
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-white/10 rounded-full blur-[120px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
              </div>

              <div className="max-w-[1400px] w-full mx-auto px-6 sm:px-10 lg:px-16 relative z-10 flex flex-col-reverse md:flex-row items-center justify-between gap-8 md:gap-12 py-12 md:py-16">
                
                {/* Sol Taraf: Metin İçeriği */}
                <div className="flex-1 text-center md:text-left space-y-6">
                  {/* Kampanya Rozeti */}
                  {hasCampaign && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-400 text-xs font-bold uppercase tracking-wider">
                      <Tag size={12} className="animate-pulse" /> {campaignTitle}
                    </div>
                  )}

                  {/* Ürün Başlığı */}
                  <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
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
                      <span className="text-sm text-slate-400 font-medium mb-1">Satış Fiyatı</span>
                      <span className="text-3xl md:text-4xl font-black text-white tracking-tight">
                        {formatPriceTRY(product.sell_price || 0)}
                      </span>
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
                  <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl" />
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name} 
                      className="w-full h-full object-contain relative z-10 drop-shadow-2xl scale-95 md:scale-100 group-hover/slider:scale-105 transition-transform duration-700" 
                    />
                  ) : (
                    <img 
                      src={getFallbackImage(product.category || '')} 
                      alt="Fallback" 
                      className="w-3/4 h-3/4 object-contain opacity-50 relative z-10 grayscale invert brightness-200 group-hover/slider:scale-105 transition-transform duration-700" 
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
