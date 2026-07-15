import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url === '' || anonKey === '') {
    return new Proxy({} as any, {
      get(_, prop) {
        if (prop === 'from' || prop === 'select' || prop === 'eq' || prop === 'order') {
          return () => new Proxy({} as any, {
            get(_, subProp) {
              return () => Promise.resolve({ data: [], error: null });
            }
          });
        }
        return () => Promise.resolve({ data: [], error: null });
      }
    });
  }
  return createBrowserClient(url, anonKey);
}
