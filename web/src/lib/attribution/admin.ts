import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AttributionDatabase } from './database.types';

let clientInstance: SupabaseClient<AttributionDatabase> | null = null;

export const attributionSupabaseAdmin = new Proxy({} as SupabaseClient<AttributionDatabase>, {
  get(target, prop) {
    if (!clientInstance) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceRoleKey || supabaseServiceRoleKey === 'none') {
        throw new Error('Supabase service role or URL environment variables are missing or misconfigured.');
      }

      clientInstance = createClient<AttributionDatabase>(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }

    const value = Reflect.get(clientInstance, prop, clientInstance);
    return typeof value === 'function' ? value.bind(clientInstance) : value;
  }
});
