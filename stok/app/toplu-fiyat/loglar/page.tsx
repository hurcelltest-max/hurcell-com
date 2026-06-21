import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import RollbackButton from './RollbackButton';

export const dynamic = 'force-dynamic';

export default async function TopluFiyatLoglarPage() {
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) return null;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: batches, error: fetchError } = await supabaseAdmin
    .from('price_update_batches')
    .select(`
      id, action_type, parameters, status, created_at, rolled_back_at, admin_user_id,
      items:price_update_items ( count )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  interface PriceUpdateBatchWithDetails {
    id: string;
    action_type: string;
    parameters: unknown; // Database jsonb parameters
    status: string;
    created_at: string;
    rolled_back_at: string | null;
    admin_users: { email: string } | null;
    items: Array<{ count: number }> | null;
  }

  let typedBatches: PriceUpdateBatchWithDetails[] = [];
  let error = fetchError;

  if (!error && batches) {
    const { data: adminUsers, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, email');

    if (adminError) {
      error = adminError;
    } else {
      const adminMap = new Map(adminUsers?.map(u => [u.user_id, u.email]) || []);
      typedBatches = batches.map((b) => {
        const item = b as {
          id: string;
          action_type: string;
          parameters: unknown;
          status: string;
          created_at: string;
          rolled_back_at: string | null;
          admin_user_id: string;
          items: Array<{ count: number }> | null;
        };
        return {
          id: item.id,
          action_type: item.action_type,
          parameters: item.parameters,
          status: item.status,
          created_at: item.created_at,
          rolled_back_at: item.rolled_back_at,
          admin_users: adminMap.has(item.admin_user_id) ? { email: adminMap.get(item.admin_user_id) || '' } : null,
          items: item.items
        };
      });
    }
  }

  if (error) {
    console.error('Error fetching logs:', error);
    return <div>Loglar yüklenirken hata oluştu.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Toplu İşlem Logları</h1>
        <Link href="/toplu-fiyat" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
          Geri Dön
        </Link>
      </div>

      <div className="overflow-x-auto bg-white border border-gray-200 shadow rounded-lg">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Tarih</th>
              <th className="px-4 py-3 font-medium">Admin</th>
              <th className="px-4 py-3 font-medium">İşlem</th>
              <th className="px-4 py-3 font-medium">Detay (Parametreler)</th>
              <th className="px-4 py-3 font-medium">Ürün Sayısı</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {typedBatches.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{new Date(b.created_at).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3">{b.admin_users?.email}</td>
                <td className="px-4 py-3">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                    {b.action_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 truncate max-w-xs" title={JSON.stringify(b.parameters)}>
                  {JSON.stringify(b.parameters)}
                </td>
                <td className="px-4 py-3">{b.items?.[0]?.count || 0}</td>
                <td className="px-4 py-3">
                  {b.status === 'completed' && <span className="text-green-600 font-semibold">Tamamlandı</span>}
                  {b.status === 'rolled_back' && <span className="text-orange-600 font-semibold">Geri Alındı</span>}
                  {b.status === 'failed' && <span className="text-red-600 font-semibold">Hatalı</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {b.status === 'completed' && (
                    <RollbackButton batchId={b.id} />
                  )}
                </td>
              </tr>
            ))}
            {batches?.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">Henüz işlem geçmişi yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
