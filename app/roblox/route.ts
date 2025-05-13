import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()
    
    // First get the user ID from username
    const userResponse = await fetch(`https://users.roblox.com/v1/usernames/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernames: [username],
      }),
    })

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: userResponse.status })
    }

    const userData = await userResponse.json()
    if (!userData.data?.[0]?.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Then get the headshot URL
    const headshotResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.data[0].id}&size=48x48&format=Png&isCircular=false`
    )

    if (!headshotResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch headshot' }, { status: headshotResponse.status })
    }

    const headshotData = await headshotResponse.json()
    return NextResponse.json(headshotData)
  } catch (error) {
    console.error('Roblox API proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 