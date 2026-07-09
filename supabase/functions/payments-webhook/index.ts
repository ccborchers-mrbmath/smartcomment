import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

// Map human-readable price IDs to credit packs (one-time purchases).
const PACKS: Record<string, { credits: number; packKey: string }> = {
  credits_starter_onetime: { credits: 500, packKey: 'starter' },
  credits_standard_onetime: { credits: 2000, packKey: 'standard' },
  credits_bulk_onetime: { credits: 10000, packKey: 'bulk' },
};

// Map human-readable price IDs to subscription plans.
// credits = granted per billing cycle; allowance = used for 2x rollover cap.
const SUBSCRIPTIONS: Record<string, { credits: number; allowance: number }> = {
  teacher_monthly: { credits: 2000, allowance: 2000 },
};

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return _supabase;
}

function firstItemPriceExternalId(data: any): string | undefined {
  return data.items?.[0]?.price?.importMeta?.externalId;
}

async function handleTransactionCompleted(data: any) {
  const userId = data.customData?.userId;
  if (!userId) {
    console.warn('transaction.completed: no userId in customData');
    return;
  }

  const priceExternalId = firstItemPriceExternalId(data);
  if (!priceExternalId) {
    console.warn('transaction.completed: missing price externalId', { rawPriceId: data.items?.[0]?.price?.id });
    return;
  }

  const amountUsd = data.details?.totals?.total
    ? Number(data.details.totals.total) / 100
    : null;

  // One-time credit pack purchase
  const pack = PACKS[priceExternalId];
  if (pack) {
    const { error } = await getSupabase().rpc('apply_credit_purchase', {
      _user_id: userId,
      _credits: pack.credits,
      _pack_key: pack.packKey,
      _amount_usd: amountUsd,
      _paddle_transaction_id: data.id,
    });
    if (error) throw error;
    console.log('Credited (pack)', userId, pack);
    return;
  }

  // Subscription billing cycle (initial + renewals both come through here)
  const sub = SUBSCRIPTIONS[priceExternalId];
  if (sub) {
    // Skip credit grant for sponsored users — they already have unlimited AI.
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('school_sponsored')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.school_sponsored) {
      console.log('Sponsored user — skipping subscription credit grant', userId);
      return;
    }
    const { error } = await getSupabase().rpc('apply_subscription_cycle', {
      _user_id: userId,
      _credits: sub.credits,
      _allowance: sub.allowance,
      _paddle_transaction_id: data.id,
    });
    if (error) throw error;
    console.log('Credited (subscription cycle)', userId, sub);
    return;
  }

  console.warn('transaction.completed: unknown price', priceExternalId);
}

async function handleSubscriptionCreated(data: any) {
  const userId = data.customData?.userId;
  if (!userId) {
    console.warn('subscription.created: no userId in customData');
    return;
  }
  const priceExternalId = firstItemPriceExternalId(data);
  if (!priceExternalId || !SUBSCRIPTIONS[priceExternalId]) {
    console.warn('subscription.created: unknown price', priceExternalId);
    return;
  }
  const sub = SUBSCRIPTIONS[priceExternalId];

  await getSupabase().from('profiles').update({
    subscription_status: data.status ?? 'active',
    paddle_subscription_id: data.id,
    paddle_customer_id: data.customerId,
    subscription_price_id: priceExternalId,
    subscription_current_period_end: data.currentBillingPeriod?.endsAt,
    subscription_cancel_at_period_end: data.scheduledChange?.action === 'cancel',
    monthly_credit_allowance: sub.allowance,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
  console.log('Subscription created', userId, data.id);
}

async function handleSubscriptionUpdated(data: any) {
  // Locate the user via paddle_subscription_id (customData may be absent on updates)
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('id')
    .eq('paddle_subscription_id', data.id)
    .maybeSingle();
  if (!profile) {
    console.warn('subscription.updated: no matching profile', data.id);
    return;
  }
  await getSupabase().from('profiles').update({
    subscription_status: data.status,
    subscription_current_period_end: data.currentBillingPeriod?.endsAt,
    subscription_cancel_at_period_end: data.scheduledChange?.action === 'cancel',
    paddle_customer_id: data.customerId,
    updated_at: new Date().toISOString(),
  }).eq('id', profile.id);
  console.log('Subscription updated', profile.id, data.status);
}

async function handleSubscriptionCanceled(data: any) {
  await getSupabase().from('profiles').update({
    subscription_status: 'canceled',
    subscription_cancel_at_period_end: false,
    // Preserve/record the end of paid access so Billing can show the
    // grace period even if subscription.updated didn't fire first.
    subscription_current_period_end:
      data.currentBillingPeriod?.endsAt ?? data.canceledAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('paddle_subscription_id', data.id);
  console.log('Subscription canceled', data.id);
}

async function handleTransactionPaymentFailed(data: any) {
  // A renewal or checkout payment failed. Flag the subscription as past_due
  // so the UI can surface a dunning banner. Paddle will keep retrying and
  // eventually fire subscription.updated (or canceled) with the final state.
  const subId = data.subscriptionId;
  if (!subId) {
    console.log('transaction.payment_failed: no subscriptionId', data.id);
    return;
  }
  await getSupabase().from('profiles').update({
    subscription_status: 'past_due',
    updated_at: new Date().toISOString(),
  }).eq('paddle_subscription_id', subId);
  console.log('Payment failed for subscription', subId);
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.eventType) {
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data);
      break;
    case EventName.TransactionPaymentFailed:
      await handleTransactionPaymentFailed(event.data);
      break;
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data);
      break;
    default:
      console.log('Unhandled event:', event.eventType);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;
  try {
    await handleWebhook(req, env);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});
