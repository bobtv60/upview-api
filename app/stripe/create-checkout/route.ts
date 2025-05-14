import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-04-30.basil',
});

// List of allowed origins
const ALLOWED_ORIGINS = ['https://upview.dev', 'https://www.upview.dev'];

// Helper function to get CORS headers
function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  try {
    // Get auth token from request
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { 
        status: 401,
        headers: getCorsHeaders(origin),
      });
    }

    const token = authHeader.split(' ')[1];
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { 
        status: 401,
        headers: getCorsHeaders(origin),
      });
    }

    // Check if user already has an active subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .in('status', ['trialing', 'active'])
      .single();

    if (existingSubscription) {
      return NextResponse.json({ error: 'Active subscription exists' }, { 
        status: 400,
        headers: getCorsHeaders(origin),
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `https://www.upview.dev/onboarding?step=workspace&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://www.upview.dev/onboarding?step=payment`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
      },
      billing_address_collection: 'required',
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url }, {
      headers: getCorsHeaders(origin),
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { 
        status: 500,
        headers: getCorsHeaders(origin),
      }
    );
  }
} 