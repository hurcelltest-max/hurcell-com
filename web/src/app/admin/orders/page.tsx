import { supabaseAdmin } from '@/lib/supabase/admin'
import OrdersClient from './orders-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminOrdersPage() {
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="p-8 text-red-500">Siparişler yüklenirken hata oluştu: {error.message}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Sipariş Yönetimi</h1>
      <OrdersClient initialOrders={orders || []} />
    </div>
  )
}
