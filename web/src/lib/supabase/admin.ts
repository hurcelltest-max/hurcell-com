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
      
      let urlProjectRef = 'unknown';
      if (supabaseUrl) {
        const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.(co|in|net|space)/);
        if (match) urlProjectRef = match[1];
      }

      const decodePayload = (token: string | undefined) => {
        if (!token) return { format: 'missing' };
        if (!token.startsWith('eyJ')) {
          return { format: token.startsWith('sb_') ? 'new_opaque_format' : 'unknown_non_jwt' };
        }
        const parts = token.split('.');
        if (parts.length !== 3) return { format: 'malformed_jwt' };
        try {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
          const payload = JSON.parse(payloadJson);
          const isExpired = payload.exp ? (payload.exp < Date.now() / 1000) : false;
          return {
            format: 'jwt_like',
            role: payload.role || 'missing',
            iss: payload.iss || 'missing',
            aud: payload.aud || 'missing',
            expired: isExpired ? 'expired' : 'not_expired',
            payloadKeys: Object.keys(payload),
            ref: payload.ref || payload.project || 'missing'
          };
        } catch (e) {
          return { format: 'decode_error' };
        }
      };

      const serviceRoleDiag = decodePayload(supabaseServiceRoleKey);
      const anonDiag = decodePayload(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

      console.log(`[Supabase Diagnostics] urlProjectRef: ${urlProjectRef}`);
      console.log(`[Supabase Diagnostics] serviceRoleKey:`, JSON.stringify(serviceRoleDiag));
      console.log(`[Supabase Diagnostics] anonKey:`, JSON.stringify(anonDiag));

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
