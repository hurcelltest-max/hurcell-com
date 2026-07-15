import { supabaseAdmin } from '@/lib/supabase/admin';

export const releaseOrderStock = async (orderId: string, reason: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Calling the atomic PostgreSQL RPC function
    const { data: rpcData, error: rpcError } = await getSupabaseAdmin().rpc('release_order_stock', {
      p_order_id: orderId,
      p_reason: reason
    });

    if (rpcError) {
      console.error(`[releaseOrderStock] RPC error for order ${orderId}:`, rpcError);
      return { success: false, message: 'Veritabanı iade işlemi sırasında hata oluştu.' };
    }

    // RPC returns JSONB like { success: true/false, message: '...' }
    if (rpcData && typeof rpcData === 'object') {
      const result = rpcData as unknown as { success: boolean; message: string };
      if (!result.success) {
        console.warn(`[releaseOrderStock] Logic error for order ${orderId}:`, result.message);
      }
      return { success: result.success === true, message: result.message || 'Bilinmeyen sonuç' };
    }

    return { success: false, message: 'Geçersiz RPC yanıtı' };
  } catch (error: unknown) {
    console.error(`[releaseOrderStock] Exception for order ${orderId}:`, error);
    return { success: false, message: 'Beklenmeyen bir hata oluştu.' };
  }
};
