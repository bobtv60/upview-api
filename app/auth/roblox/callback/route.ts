import { createServerClient} from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('https://upview.dev/onboarding?error=no_code', request.url))
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )
    // const cookieStore = await cookies()
    // const supabase = createServerClient(
    //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
    //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    //   {
    //     cookies: {
    //       get(name: string) {
    //         return cookieStore.get(name)?.value
    //       },
    //       set(name: string, value: string, options: CookieOptions) {
    //         cookieStore.set({ name, value, ...options })
    //       },
    //       remove(name: string, options: CookieOptions) {
    //         cookieStore.set({ name, value: '', ...options })
    //       },
    //     },
    //   }
    // )

    // Exchange the code for an access token
    const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_ROBLOX_CLIENT_ID!,
        client_secret: process.env.ROBLOX_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${requestUrl.origin}/auth/roblox/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokenData = await tokenResponse.json()

    // Get user info from Roblox
    const userResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userData = await userResponse.json()

    // Store the Roblox user data in Supabase
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      // Update user metadata with Roblox username
      await supabase.auth.updateUser({
        data: {
          roblox_username: userData.preferred_username,
        }
      })

      // Store detailed Roblox data in profiles table
      await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          roblox_id: userData.sub,
          roblox_username: userData.preferred_username,
          roblox_access_token: tokenData.access_token,
          roblox_refresh_token: tokenData.refresh_token,
          updated_at: new Date().toISOString(),
        })
    }

    // Redirect to workspace creation step
    return NextResponse.redirect(new URL('https://upview.dev/onboarding?step=workspace', request.url))
  } catch (error) {
    console.error('Roblox OAuth error:', error)
    return NextResponse.redirect(new URL('https://upview.dev/onboarding?error=oauth_failed', request.url))
  }
} 