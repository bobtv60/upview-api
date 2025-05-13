// utils/supabaseClient.ts
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import * as cookie from 'cookie'

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

// Store the browser instance globally (safe only on client side)
let supabaseInstance: SupabaseClient | null = null

export function createClient(options?: SupabaseClientOptions): SupabaseClient {
  const supabaseUrl = options?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = options?.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (typeof window !== 'undefined') {
    // Return cached instance in browser
    if (supabaseInstance) return supabaseInstance

    // Use cookie package for robust parsing
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          const cookies = cookie.parse(document.cookie ?? '')
          return cookies[name]
        },
        set(name: string, value: string, options: { path?: string; maxAge?: number }) {
          const serialized = cookie.serialize(name, value, {
            path: options.path || '/',
            maxAge: options.maxAge ?? 3600,
            sameSite: 'lax',
          })
          document.cookie = serialized
        },
        remove(name: string, options: { path?: string }) {
          const serialized = cookie.serialize(name, '', {
            path: options.path || '/',
            maxAge: 0,
            sameSite: 'lax',
          })
          document.cookie = serialized
        },
      },
    })

    return supabaseInstance
  }

  // Server-side: stateless, create new client every call
  return createSupabaseClient(supabaseUrl, supabaseKey)
}
