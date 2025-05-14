import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-04-30.basil',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error('No signature provided');
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log('Processing webhook event:', event.type);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin access
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (!session.metadata?.userId) {
          console.error('No userId in session metadata');
          return NextResponse.json(
            { error: 'No userId in session metadata' },
            { status: 400 }
          );
        }

        console.log('Processing checkout.session.completed for user:', session.metadata.userId);

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        console.log('Retrieved subscription:', subscription.id);

        const { error: upsertError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: session.metadata.userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: subscription.status,
            plan_id: subscription.items.data[0].price.id,
            trial_end: subscription.trial_end 
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (upsertError) {
          console.error('Error upserting subscription:', upsertError);
          return NextResponse.json(
            { error: 'Failed to create subscription record' },
            { status: 500 }
          );
        }

        console.log('Successfully created subscription record');
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        console.log('Processing subscription update:', subscription.id);

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            trial_end: subscription.trial_end 
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (updateError) {
          console.error('Error updating subscription:', updateError);
          return NextResponse.json(
            { error: 'Failed to update subscription record' },
            { status: 500 }
          );
        }

        console.log('Successfully updated subscription record');
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 