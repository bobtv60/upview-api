import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const type = url.searchParams.get('type') // 'user' or 'player'
  const id = url.searchParams.get('id') // user_id or player_id

  if (!type || !id) {
    return NextResponse.json({ error: 'Missing type or id parameter' }, { status: 400 })
  }

  if (type === 'user') {
    // Get user's Roblox avatar
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('roblox_username')
      .eq('user_id', id)
      .single()

    if (!profile?.roblox_username) {
      return NextResponse.json({ error: 'No Roblox username found' }, { status: 404 })
    }

    // Fetch from Roblox API
    const response = await fetch('https://api.upview.dev/roblox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: profile.roblox_username,
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch Roblox avatar' }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json({ data: data.data?.[0]?.imageUrl || null })
  } else if (type === 'player') {
    // Get player avatar from cache
    const { data: cachedAvatar } = await supabase
      .from('player_avatars')
      .select('avatar_url, updated_at')
      .eq('player_id', id)
      .single()

    const now = new Date()
    const cacheAge = cachedAvatar?.updated_at 
      ? new Date(cachedAvatar.updated_at).getTime()
      : 0
    const isCacheValid = now.getTime() - cacheAge < 24 * 60 * 60 * 1000 // 24 hours

    if (cachedAvatar?.avatar_url && isCacheValid) {
      return NextResponse.json({ data: cachedAvatar.avatar_url })
    }

    // If not in cache or expired, fetch from Roblox
    const { data: player } = await supabase
      .from('players')
      .select('name')
      .eq('id', id)
      .single()

    if (!player?.name) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const response = await fetch('https://api.upview.dev/roblox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: player.name,
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch Roblox avatar' }, { status: 500 })
    }

    const data = await response.json()
    const avatarUrl = data.data?.[0]?.imageUrl

    if (!avatarUrl) {
      return NextResponse.json({ error: 'No avatar URL found' }, { status: 404 })
    }

    // Update cache
    await supabase
      .from('player_avatars')
      .upsert({
        player_id: id,
        user_id: user.id,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })

    return NextResponse.json({ data: avatarUrl })
  }

  return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
} 