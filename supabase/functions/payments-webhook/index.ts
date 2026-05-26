import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

// Map human-readable price IDs to credit packs.
const PACKS: Record<string, { credits: number; packKey: string }> = {
  credits_starter_onetime: { credits: 500, packKey: 'starter' },
  credits_standard_onetime: { credits: 2000, packKey: 'standard' },
  credits_bulk_onetime: { credits: 10000, packKey: 'bulk' },
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

async function handleTransactionCompleted(data: any) {
  const userId = data.customData?.userId;
  if (!userId) {
    console.warn('transaction.completed: no userId in customData');
    return;
  }

  const item = data.items?.[0];
  const priceExternalId = item?.price?.importMeta?.externalId;
  if (!priceExternalId) {
    console.warn('transaction.completed: missing price externalId', { rawPriceId: item?.price?.id });
    return;
  }

  const pack = PACKS[priceExternalId];
  if (!pack) {
    console.warn('transaction.completed: unknown pack', priceExternalId);
    return;
  }

  const amountUsd = data.details?.totals?.total
    ? Number(data.details.totals.total) / 100
    : null;

  const { error } = await getSupabase().rpc('apply_credit_purchase', {
    _user_id: userId,
    _credits: pack.credits,
    _pack_key: pack.packKey,
    _amount_usd: amountUsd,
    _paddle_transaction_id: data.id,
  });
  if (error) {
    console.error('apply_credit_purchase failed:', error);
    throw error;
  }
  console.log('Credited user', userId, pack);
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.eventType) {
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data);
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
