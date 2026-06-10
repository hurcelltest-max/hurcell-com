import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let clientInstance: ReturnType<typeof createClient> | null = null;

// Use a Proxy wrapper to initialize the Supabase client lazily.
// This prevents Next.js static build pre-evaluation from failing when
// service role keys are set to 'none' in local development profiles.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    if (!clientInstance) {
      if (!supabaseUrl || !supabaseServiceRoleKey || supabaseServiceRoleKey === 'none') {
        throw new Error('Supabase service role or URL environment variables are missing or misconfigured.');
      }
      clientInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return Reflect.get(clientInstance, prop);
  }
});
