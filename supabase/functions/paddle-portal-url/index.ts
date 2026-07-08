// Returns a Paddle customer portal URL where the signed-in user can manage
// (pause / resume / cancel / update payment method) their subscription.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaddleClient, type PaddleEnv } from '../_shared/paddle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'missing_auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { environment } = (await req.json().catch(() => ({}))) as { environment?: PaddleEnv };
    const env: PaddleEnv = environment === 'live' ? 'live' : 'sandbox';

    const { data: profile } = await admin
      .from('profiles')
      .select('paddle_customer_id, paddle_subscription_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.paddle_customer_id) {
      return new Response(JSON.stringify({ error: 'no_subscription' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paddle = getPaddleClient(env);
    const subIds = profile.paddle_subscription_id ? [profile.paddle_subscription_id] : [];
    const session = await paddle.customerPortalSessions.create(profile.paddle_customer_id, subIds);

    return new Response(JSON.stringify({ url: session.urls?.general?.overview }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('paddle-portal-url error:', e);
    return new Response(JSON.stringify({ error: 'portal_failed', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
