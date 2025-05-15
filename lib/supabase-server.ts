import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY')
}

interface SupabaseClientOptions {
  supabaseUrl?: string
  supabaseKey?: string
}

export function createServerClient(options?: SupabaseClientOptions): SupabaseClient {
  const supabaseUrl = options?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = options?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// Helper function to handle Supabase errors
export async function handleSupabaseError<T>(
  operation: () => Promise<{ data: T | null; error: Error | null }>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data, error } = await operation()
    if (error) {
      console.error('Supabase operation error:', error)
      return { data: null, error: new Error(error.message) }
    }
    return { data, error: null }
  } catch (error) {
    console.error('Unexpected error during Supabase operation:', error)
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error occurred') }
  }
}
