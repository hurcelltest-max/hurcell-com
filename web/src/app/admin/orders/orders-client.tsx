'use client'

import React, { useState } from 'react'
import { formatPriceTRY } from '@/lib/constants'
import { toast } from 'sonner'

export default function OrdersClient({ initialOrders }: { initialOrders: any[] }) {
  const [orders, setOrders] = useState(initialOrders)
  const [filter, setFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const statuses = [
    'pending', 'confirmed', 'preparing', 'shipped', 'delivered', 
    'cancelled', 'returned', 'delivery_failed', 'not_delivered', 'customer_refused'
  ]

  const statusLabels: Record<string, string> = {
    pending: 'Beklemede',
    confirmed: 'Onaylandı',
    preparing: 'Hazırlanıyor',
    shipped: 'Kargoya Verildi',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal Edildi',
    returned: 'İade Edildi',
    delivery_failed: 'Teslim Edilemedi',
    not_delivered: 'Teslim Alınmadı',
    customer_refused: 'Müşteri Kabul Etmedi'
  }

  const paymentLabels: Record<string, string> = {
    pending_on_delivery: 'Kapıda ödeme bekliyor',
    pending: 'Beklemede',
    paid: 'Ödendi',
    failed: 'Başarısız',
    refunded: 'İade edildi'
  }

  const shippingLabels: Record<string, string> = {
    pending: 'Beklemede',
    shipped: 'Kargoya verildi',
    delivered: 'Teslim edildi',
    cancelled: 'İptal edildi'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!confirm(`Sipariş durumunu "${newStatus}" olarak güncellemek istediğinize emin misiniz? (İptal/İade durumlarında stok geri eklenecektir)`)) return;
    
    setUpdatingId(orderId)
    try {
      const res = await fetch('/api/admin/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Güncelleme başarısız.')
      
      toast.success(data.message)
      
      // Update local state
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          return { ...o, ...data.status }
        }
        return o
      }))

    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap bg-white p-4 rounded-xl border border-slate-200">
        <button 
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Tümü
        </button>
        {statuses.map(s => (
          <button 
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {statusLabels[s] || s}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredOrders.map(order => (
          <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-lg">{order.order_number}</span>
                <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-mono">{formatDate(order.created_at)}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase">Müşteri</p>
                  <p className="font-semibold">{order.customer_name}</p>
                  <p className="text-slate-600">{order.customer_phone}</p>
                  <p className="text-slate-600">{order.customer_email}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase">Ödeme ve Kargo</p>
                  <p>Toplam: <span className="font-bold text-blue-600">{formatPriceTRY(order.total_amount)}</span></p>
                  <p>Ödeme: {paymentLabels[order.payment_status] || order.payment_status}</p>
                  <p>Kargo: {shippingLabels[order.shipping_status] || order.shipping_status}</p>
                </div>
              </div>

              <div className="pt-3 border-t">
                <p className="text-slate-500 text-xs uppercase mb-2">Ürünler</p>
                <div className="space-y-1">
                  {order.order_items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span>{item.quantity}x {item.product_title_snapshot}</span>
                      <span className="font-mono">{formatPriceTRY(item.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stock Reservation Debug Info */}
              <div className="pt-3 border-t grid grid-cols-2 gap-2 text-xs font-mono text-slate-500">
                <div>
                  <p>Stok Ayrılma Tarihi:</p>
                  <p>{order.stock_reserved_at ? formatDate(order.stock_reserved_at) : 'Stok ayrılmadı'}</p>
                </div>
                <div>
                  <p>Stok İade Tarihi:</p>
                  <p>{order.stock_released_at ? formatDate(order.stock_released_at) : 'Henüz iade edilmedi'}</p>
                </div>
                <div className="col-span-2">
                  <p>Stok İade Nedeni:</p>
                  <p>{order.stock_release_reason || '-'}</p>
                </div>
              </div>

            </div>

            <div className="w-full md:w-64 flex flex-col justify-start gap-2 border-l pl-0 md:pl-6 pt-4 md:pt-0">
              <label className="text-xs font-semibold text-slate-500 uppercase">Sipariş Durumu</label>
              
              {['shipped', 'delivered', 'returned', 'delivery_failed', 'customer_refused', 'not_delivered'].includes(order.shipping_status) ? (
                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="font-semibold text-slate-800 mb-1">{statusLabels[order.status] || order.status}</p>
                  <p className="text-xs">Bu sipariş kargoya verildiği için manuel stok iadesi/durum değişimi yapılamaz. İade veya teslim edilememe durumu kargo firmasından otomatik işlenecektir.</p>
                </div>
              ) : (
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  value={order.status}
                  disabled={updatingId === order.id}
                  onChange={(e) => handleStatusChange(order.id, e.target.value)}
                >
                  {statuses.map(s => (
                    <option key={s} value={s}>{statusLabels[s] || s}</option>
                  ))}
                </select>
              )}
              
              {updatingId === order.id && <span className="text-xs text-blue-500 animate-pulse mt-1">Güncelleniyor...</span>}
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && (
          <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            Sipariş bulunamadı.
          </div>
        )}
      </div>
    </div>
  )
}
