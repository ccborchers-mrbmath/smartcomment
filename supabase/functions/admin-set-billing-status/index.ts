// Super-admin-only: set a user's billing status.
// "standard" = normal credit-gated billing (default)
// "billed"   = can use AI features regardless of credit balance; usage still logged for manual invoicing
// "exempt"   = unlimited unrestricted access (school_sponsored)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "ccborchers@gmail.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerRes, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const caller = callerRes?.user;
    if (callerErr || !caller?.email || caller.email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId as string | undefined;
    const status = body.status as "standard" | "billed" | "exempt" | undefined;
    if (!targetUserId || !status || !["standard", "billed", "exempt"].includes(status)) {
      return json({ error: "invalid_request" }, 400);
    }

    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        school_sponsored: status === "exempt",
        bypass_credit_check: status === "billed",
      })
      .eq("id", targetUserId);
    if (updateErr) throw updateErr;

    return json({ ok: true });
  } catch (e) {
    console.error("admin-set-billing-status error:", e);
    return json({ error: "update_failed", message: String(e) }, 500);
  }
});
