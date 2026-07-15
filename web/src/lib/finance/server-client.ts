import 'server-only'

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { FinanceDatabase } from './database-types'

let clientInstance: SupabaseClient<FinanceDatabase> | null = null

export const financeAdminClient = new Proxy({} as SupabaseClient<FinanceDatabase>, {
  get(_, prop) {
    if (!clientInstance) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Finance Supabase server configuration is missing.')
      }
      clientInstance = createClient<FinanceDatabase>(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    }
    return Reflect.get(clientInstance, prop as keyof SupabaseClient<FinanceDatabase>)
  }
})
