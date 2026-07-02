'use client'

import React from 'react'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '@/types'
import {
  getWhatsAppLink,
  getFallbackImage,
  formatPriceTRY,
  formatCategoryName,
  getPublicProductTitle,
  getCategoryGroup
} from '@/lib/constants'
import { AddToCartButton } from '@/components/cart/add-to-cart-button'

interface ProductCardProps {
  product: Product
  compact?: boolean
  showCategory?: boolean
  showActions?: boolean
  campaign?: {
    id: string;
    name: string;
    discount_type: string;
    discount_value: number;
  } | null;
}

export function ProductCard({
  product,
  compact = false,
  showCategory = true,
  showActions = true,
  campaign = null
}: ProductCardProps) {
  const displayTitle = getPublicProductTitle(product)
  const displayCategory = formatCategoryName(product)

  // Stock display rules:
  // - stock > 5: "Stokta X adet" (Green theme)
  // - stock <= 5 ve stock > 1: "Az kaldı X adet" (Amber theme)
  // - stock === 1: "Son 1 adet" (Rose theme)
  let stockLabel = ''
  let stockColorClass = ''
  
  if (product.stock > 5) {
    stockLabel = `Stokta - ${product.stock} adet`
    stockColorClass = 'bg-emerald-50 text-emerald-700 border-emerald-100/80'
  } else if (product.stock <= 5 && product.stock > 1) {
    stockLabel = `Az kaldı - ${product.stock} adet`
    stockColorClass = 'bg-amber-50 text-amber-700 border-amber-100/80'
  } else if (product.stock === 1) {
    stockLabel = 'Son 1 adet'
    stockColorClass = 'bg-rose-50 text-rose-700 border-rose-100/80 animate-pulse'
  }

  // Specifications subtitle: brand + model + color / memory / storage (excluding empty fields)
  const specParts = []
  if (product.brand) specParts.push(product.brand)
  if (product.model) specParts.push(product.model)
  if (product.color) specParts.push(product.color)
  else if (product.memory) specParts.push(product.memory)
  else if (product.storage) specParts.push(product.storage)
  const specText = specParts.join(' - ') || 'Özellik belirtilmemiş'

  const isDiscounted = product.is_discounted && product.old_price && product.old_price > product.sell_price;
  const discountPercent = isDiscounted && product.old_price 
    ? Math.round(((product.old_price - product.sell_price) / product.old_price) * 100) 
    : 0;

  return (
    <div className="group flex flex-col h-full bg-white hover:shadow-md border border-slate-200/80 hover:border-slate-350 rounded-3xl p-4 transition-all duration-300 hover:-translate-y-1 shadow-sm">
      
      {/* Visual Area (Fixed square aspect ratio, object-contain, padding) */}
      <div className="aspect-square relative overflow-hidden bg-slate-50 rounded-2xl mb-4 border border-slate-100/80 flex items-center justify-center p-4">
        <img
          src={product.image_url || getFallbackImage(product.category)}
          alt={displayTitle}
          className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = getFallbackImage(product.category)
          }}
        />
        
        {/* Condition Badge */}
        {(() => {
          const catGroup = getCategoryGroup(product);
          const isAksesuar = catGroup === 'aksesuar' || catGroup === 'sarj_kablo';
          if (product.device_condition_type && !isAksesuar) {
            return (
              <span className="absolute left-3 top-3 px-2 py-0.5 rounded-lg bg-white/95 border border-slate-200 text-[9px] font-bold uppercase tracking-wider text-slate-700 shadow-sm z-10">
                {product.device_condition_type === 'new_sealed' ? 'Sıfır' : 'İkinci El'}
              </span>
            );
          }
          return null;
        })()}

        {/* Discount Badge */}
        {isDiscounted && discountPercent > 0 && (
          <span className="absolute right-3 top-3 px-2 py-0.5 rounded-lg bg-rose-500 border border-rose-600 text-[10px] font-bold tracking-wider text-white shadow-sm z-10 animate-pulse">
            %{discountPercent} İNDİRİM
          </span>
        )}
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-grow">
        {/* Category Badge */}
        {showCategory && (
          <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 mb-1 block">
            {displayCategory}
          </span>
        )}

        {/* Title (Limited to 2 lines) */}
        <h3
          className="text-sm font-bold text-slate-800 mb-1 leading-snug line-clamp-2 min-h-[2.5rem] flex items-start"
          title={displayTitle}
        >
          {displayTitle}
        </h3>

        {/* Specs Satırı */}
        <p className="text-[11px] text-slate-500 font-light mb-2 line-clamp-1">
          {specText}
        </p>

        {/* Campaign Badge */}
        {campaign && (
          <div className="mb-3">
            <span className="text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-2 py-0.5 inline-block">
              {campaign.name || (campaign.discount_type === 'percent'
                ? `2. Ürüne %${Math.round(campaign.discount_value)} İndirim`
                : `2. Ürüne ${formatPriceTRY(campaign.discount_value)} İndirim`)
              }
            </span>
          </div>
        )}


        {/* Price & Stock status */}
        <div className="mt-auto mb-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col">
            {isDiscounted ? (
              <>
                <span className="text-[10px] text-slate-400 font-bold line-through decoration-rose-400/50 mb-0.5">
                  {formatPriceTRY(product.old_price || 0)}
                </span>
                <span className="text-base font-extrabold text-rose-600 tracking-tight">
                  {formatPriceTRY(product.sell_price)}
                </span>
              </>
            ) : (
              <span className="text-base font-extrabold text-slate-900 tracking-tight">
                {formatPriceTRY(product.sell_price)}
              </span>
            )}
          </div>
          {stockLabel && (
            <span className={`text-[9px] font-bold border px-2 py-0.5 rounded-lg ${stockColorClass}`}>
              {stockLabel}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        {showActions && (
          <div className="flex flex-col gap-2 pt-1">
            <AddToCartButton product={product} fullWidth />
            
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/urun/${product.id}`}
                className="py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded-full text-center transition-colors border border-slate-200"
              >
                Detaylar
              </Link>
              
              <a
                href={getWhatsAppLink(displayTitle, product.barcode, product.sell_price)}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-full text-center transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm hover:shadow"
              >
                <span className="hidden sm:inline">WhatsApp</span>
                <span className="sm:hidden">Sor</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
