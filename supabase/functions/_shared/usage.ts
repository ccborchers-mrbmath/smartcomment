// Shared usage-event logger. Called by every AI edge function after a
// successful AI gateway call. Writes one row to public.usage_events using
// the service role so RLS does not block inserts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Per-model price map (USD per 1M tokens for chat models, USD per minute
// for audio). These are estimates that approximate the Lovable AI gateway
// charges — update when gateway pricing changes. For invoicing purposes,
// estimates here drive `cost_usd_estimate` on each usage event.
export const MODEL_PRICING: Record<string, { inUsdPerM?: number; outUsdPerM?: number; flatUsdPerCall?: number }> = {
  "google/gemini-2.5-pro":     { inUsdPerM: 1.25,  outUsdPerM: 10.00 },
  "google/gemini-2.5-flash":   { inUsdPerM: 0.30,  outUsdPerM: 2.50 },
  "google/gemini-2.5-flash-lite": { inUsdPerM: 0.10, outUsdPerM: 0.40 },
  "openai/gpt-5":              { inUsdPerM: 5.00,  outUsdPerM: 15.00 },
  "openai/gpt-5-mini":         { inUsdPerM: 0.50,  outUsdPerM: 2.00 },
  "openai/gpt-5-nano":         { inUsdPerM: 0.10,  outUsdPerM: 0.40 },
};

// Credit cost (what a paying user would burn). Tunable. 1 credit ≈ $0.001 baseline.
export function creditsFromCost(costUsd: number): number {
  return Math.max(1, Math.ceil(costUsd * 1000));
}

export function estimateCostFromUsage(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined | null): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  if (p.flatUsdPerCall) return p.flatUsdPerCall;
  const inTok = usage?.prompt_tokens ?? 0;
  const outTok = usage?.completion_tokens ?? 0;
  const cost = (inTok / 1_000_000) * (p.inUsdPerM ?? 0) + (outTok / 1_000_000) * (p.outUsdPerM ?? 0);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface LogUsageArgs {
  userId: string;
  functionName: string;
  model?: string;
  units?: number;          // e.g. comments generated, seconds of audio, pages OCR'd
  costUsd?: number;        // if omitted, computed from model+usage
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  credits?: number;        // if omitted, derived from costUsd
  metadata?: Record<string, unknown>;
}

export async function logUsage(args: LogUsageArgs): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const costUsd = args.costUsd ?? (args.model ? estimateCostFromUsage(args.model, args.usage ?? undefined) : 0);
    const credits = args.credits ?? creditsFromCost(costUsd);

    // Look up sponsorship — sponsored teachers get unlimited free AI,
    // so we log usage for school invoicing but skip ledger + balance changes.
    const { data: prof } = await admin
      .from("profiles")
      .select("credits_balance, school_sponsored")
      .eq("id", args.userId)
      .maybeSingle();
    const sponsored = !!prof?.school_sponsored;

    // Snapshot attribution at insert time
    const { data: attr } = await admin.rpc("attribute_usage", { _uid: args.userId });
    const row = Array.isArray(attr) ? attr[0] : attr;

    const { data: inserted, error } = await admin.from("usage_events").insert({
      user_id: args.userId,
      function_name: args.functionName,
      units: args.units ?? 0,
      credits_used: sponsored ? 0 : credits,
      cost_usd_estimate: costUsd,
      attributed_domain: row?.domain ?? null,
      school_id: row?.school_id ?? null,
      metadata: { model: args.model, sponsored, ...(args.metadata ?? {}) },
    }).select("id").single();
    if (error) { console.error("logUsage insert error", error); return; }

    // Sponsored users: stop here. No ledger row, no balance decrement.
    if (sponsored) return;

    // Atomically decrement the balance and record the spend in one statement
    // via spend_credits(). Prevents race conditions on concurrent AI calls.
    if (credits > 0) {
      const { data: ok, error: rpcErr } = await admin.rpc("spend_credits", {
        _user_id: args.userId,
        _credits: credits,
        _function_name: args.functionName,
        _usage_event_id: inserted?.id ?? null,
        _amount_usd: costUsd,
        _metadata: { model: args.model, ...(args.metadata ?? {}) },
      });
      if (rpcErr) {
        console.error("logUsage spend_credits error", rpcErr);
      } else if (ok === false) {
        // Balance changed between entitlement check and spend — user ran out.
        console.warn("spend_credits: insufficient balance at spend time", args.userId, credits);
      }
    }

  } catch (e) {
    // Never throw from usage logging — must not break the user's AI call
    console.error("logUsage failed", e);
  }
}
