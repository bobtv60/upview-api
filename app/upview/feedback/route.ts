import { createClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

// Add CORS headers to the response
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  }
}

// Categorize feedback using Together AI
async function categorizeFeedback(text: string): Promise<string> {
  try {
    const prompt = `Categorise the following message strictly as one of: bug, suggestion, spam, rude, or other.

Definitions:
- bug: Describes something broken or not working.
- suggestion: A feature or improvement idea.
- spam: Irrelevant, random, unreadable, promotional, or repeated content.
- rude: Contains insults, profanity, or offensive language.
- other: Anything else.

Always classify gibberish or unreadable text (e.g., "asdjklajsd") as spam.
Return only one word — lowercase, no punctuation.

Message: """${text}"""
Category:`;

    
    const response = await fetch('https://api.together.xyz/v1/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
        prompt,
        max_tokens: 10,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      throw new Error(`Together AI API error: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Together AI response:', data)
    const rawText = data.choices[0].text.trim().toLowerCase()
    console.log('Raw category from AI:', rawText)

    // Extract first valid category word from the response
    const validCategories = ['bug', 'suggestion', 'spam', 'rude', 'other']
    const words = rawText.match(/\b\w+\b/g) || []
    const category = words.find((word: string) => validCategories.includes(word)) || 'other'
    
    // Capitalize the first letter
    const finalCategory = category.charAt(0).toUpperCase() + category.slice(1)
    
    console.log('Final category after validation:', finalCategory)
    return finalCategory

  } catch (error) {
    console.error('Error categorizing feedback:', error)
    return 'Other' // Default to 'other' if there's an error
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function POST(request: Request) {
  try {
    // Create a Supabase client with the service role key
    const supabase = createClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    })

    const body = await request.json()
    const apiKey = request.headers.get('x-api-key')

    console.log('Received API key:', apiKey)

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401, headers: corsHeaders() }
      )
    }

    // Validate API key format
    const apiKeyRegex = /^upv_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}$/
    if (!apiKeyRegex.test(apiKey)) {
      console.error('Invalid API key format:', apiKey)
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 401, headers: corsHeaders() }
      )
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(apiKey)
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          remaining: rateLimit.remaining,
          reset: rateLimit.reset
        },
        {
          status: 429,
          headers: {
            ...corsHeaders(),
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.reset.toString(),
            'Retry-After': Math.ceil((rateLimit.reset - Date.now()) / 1000).toString()
          }
        }
      )
    }

    // Categorize the feedback
    const category = await categorizeFeedback(body.text)

    // Get the API key details including workspace_id
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, workspace_id, last_used')
      .eq('key', apiKey)
      .single()

    console.log('API key lookup result:', { keyData, keyError })

    if (keyError) {
      if (keyError.code === 'PGRST116') {
        console.error('API key not found:', apiKey)
        return NextResponse.json(
          { error: 'API key not found. Please generate a new key in the dashboard.' },
          { status: 401, headers: corsHeaders() }
        )
      }
      console.error('API Key lookup error:', keyError)
      return NextResponse.json(
        { error: 'Error validating API key' },
        { status: 401, headers: corsHeaders() }
      )
    }

    if (!keyData) {
      console.error('No API key found for:', apiKey)
      return NextResponse.json(
        { error: 'API key not found. Please generate a new key in the dashboard.' },
        { status: 401, headers: corsHeaders() }
      )
    }

    if (!keyData.workspace_id) {
      console.error('API key not associated with a workspace:', apiKey)
      return NextResponse.json(
        { error: 'API key not associated with a workspace. Please generate a new key in the dashboard.' },
        { status: 401, headers: corsHeaders() }
      )
    }

    // Update last used timestamp
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('key', apiKey)

    if (updateError) {
      console.error('Error updating last used timestamp:', updateError)
    }

    // Store the feedback with category
    const { error: feedbackError } = await supabase
      .from('feedback')
      .insert({
        user_id: keyData.user_id,
        workspace_id: keyData.workspace_id,
        game_id: body.gameId,
        player_id: body.playerId,
        player_name: body.playerName,
        text: body.text,
        category: category,
        created_at: new Date().toISOString()
      })

    if (feedbackError) {
      console.error('Error storing feedback:', feedbackError)
      return NextResponse.json(
        { error: 'Failed to store feedback' },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        category: category,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset
      },
      {
        headers: {
          ...corsHeaders(),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.reset.toString()
        }
      }
    )
  } catch (error) {
    console.error('Error processing feedback:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
