import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaddleClient, type PaddleEnv } from '../_shared/paddle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }
  const userId = userData.user.id;

  // Require an explicit confirmation phrase, plus environment for Paddle cancel.
  let body: { confirm?: string; environment?: PaddleEnv } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  if ((body.confirm ?? '').toLowerCase() !== 'delete my account') {
    return json({ error: 'confirmation_required' }, 400);
  }

  // Cancel any active Paddle subscription first so the customer doesn't
  // continue being billed after the account is gone.
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('paddle_subscription_id, subscription_status')
      .eq('id', userId)
      .maybeSingle();
    const subId = profile?.paddle_subscription_id;
    const status = profile?.subscription_status;
    if (subId && status && !['canceled', 'paused'].includes(status)) {
      const env: PaddleEnv = body.environment === 'live' ? 'live' : 'sandbox';
      try {
        const paddle = getPaddleClient(env);
        await paddle.subscriptions.cancel(subId, { effectiveFrom: 'immediately' });
      } catch (e) {
        console.error('paddle cancel failed', e);
        // Don't block deletion on Paddle failure — user still gets removed.
      }
    }
  } catch (e) {
    console.error('lookup profile for cancel failed', e);
  }

  // Delete the auth user. Cascade deletes on FKs referencing auth.users
  // should remove profile and related rows. Also explicitly delete profile.
  await admin.from('profiles').delete().eq('id', userId);
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error('deleteUser failed', delErr);
    return json({ error: 'delete_failed', message: delErr.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
