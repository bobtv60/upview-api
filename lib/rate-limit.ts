import { createClient } from '@/lib/supabase'

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60, // 60 requests
  windowSeconds: 60, // per minute
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const supabase = createClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

  // Get the user_id from the api_keys table
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('user_id')
    .eq('key', key)
    .single()

  if (keyError) {
    console.error('Error getting user_id for rate limit:', keyError)
    // If there's an error, allow the request to proceed
    return { success: true, remaining: config.maxRequests, reset: Date.now() + config.windowSeconds * 1000 }
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000)

  // Get count of requests in the current window
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart.toISOString())

  if (error) {
    console.error('Error checking rate limit:', error)
    // If there's an error, allow the request to proceed
    return { success: true, remaining: config.maxRequests, reset: now.getTime() + config.windowSeconds * 1000 }
  }

  const currentCount = count || 0
  const remaining = Math.max(0, config.maxRequests - currentCount)
  const reset = now.getTime() + config.windowSeconds * 1000

  // Record this request
  await supabase
    .from('rate_limits')
    .insert({
      key,
      user_id: keyData?.user_id,
      created_at: now.toISOString()
    })

  // Clean up old records (older than 2x the window)
  const cleanupThreshold = new Date(now.getTime() - config.windowSeconds * 2000)
  await supabase
    .from('rate_limits')
    .delete()
    .lt('created_at', cleanupThreshold.toISOString())

  return {
    success: currentCount < config.maxRequests,
    remaining,
    reset
  }
} 