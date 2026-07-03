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
      // Safe Runtime Diagnostics Check
      const urlConfigured = supabaseUrl ? 'configured' : 'missing';
      const keyConfigured = supabaseServiceRoleKey ? 'configured' : 'missing';
      
      let keyFormat = 'unknown';
      let lengthBucket = 'unknown';
      
      if (supabaseServiceRoleKey) {
        if (supabaseServiceRoleKey.startsWith('eyJ')) {
          keyFormat = 'jwt_like';
        } else if (supabaseServiceRoleKey.startsWith('sb_publishable_')) {
          keyFormat = 'publishable_like';
        } else if (supabaseServiceRoleKey.startsWith('sb_secret_')) {
          keyFormat = 'secret_like';
        }
        
        const len = supabaseServiceRoleKey.length;
        if (len < 50) {
          lengthBucket = 'short';
        } else if (len <= 200) {
          lengthBucket = 'normal';
        } else {
          lengthBucket = 'long';
        }
      }
      
      console.log(`[Supabase Admin Client Diagnostics] supabaseUrl: ${urlConfigured}, serviceRoleKey: ${keyConfigured}, serviceRoleKey format: ${keyFormat}, serviceRoleKey length bucket: ${lengthBucket}`);

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
