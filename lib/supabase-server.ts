import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

interface SupabaseClientOptions {
  supabaseUrl?: string
  supabaseKey?: string
}

export function createServerClient(options?: SupabaseClientOptions): SupabaseClient {
  return createSupabaseClient(
    options?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    options?.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  )
}
