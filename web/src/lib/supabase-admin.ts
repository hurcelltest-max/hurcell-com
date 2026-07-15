import { createClient, SupabaseClient } from '@supabase/supabase-js'

let clientInstance: SupabaseClient | null = null

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!clientInstance) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase admin configuration is missing.')
      }
      clientInstance = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    }
    return Reflect.get(clientInstance, prop)
  }
})

