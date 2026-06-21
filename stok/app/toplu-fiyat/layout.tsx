import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

export default async function TopluFiyatLayout({ children }: { children: React.ReactNode }) {
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: adminUser, error } = await supabaseAdmin
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (error || !adminUser || adminUser.role !== 'admin') {
    redirect('/'); // Unauthorized users are redirected to home
  }
  
  return <>{children}</>;
}
