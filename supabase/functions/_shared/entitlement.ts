// Shared entitlement gate for AI edge functions.
// Returns null when the user can use AI, or a 402 Response otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface EntitlementOk {
  ok: true;
  sponsored: boolean;
  balance: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function checkEntitlement(userId: string): Promise<EntitlementOk | Response> {
  // TEMPORARY: AI usage restrictions disabled for all users while email
  // verification / school sponsorship flow is being reworked. Re-enable by
  // restoring the profile lookup + balance/sponsorship/subscription gate.
  return { ok: true, sponsored: true, balance: 0 };

  // eslint-disable-next-line no-unreachable
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("profiles")
    .select("credits_balance, school_sponsored, subscription_status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return new Response(
      JSON.stringify({ error: "profile_lookup_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const sponsored = !!data.school_sponsored;
  const balance = data.credits_balance ?? 0;
  const active = data.subscription_status === "active";
  if (sponsored || active || balance > 0) {
    return { ok: true, sponsored, balance };
  }
  return new Response(
    JSON.stringify({
      error: "insufficient_credits",
      message: "You're out of credits. Buy a credit pack to continue.",
      balance,
    }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
