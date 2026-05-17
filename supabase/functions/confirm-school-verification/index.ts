import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ures } = await userClient.auth.getUser();
    const user = ures?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "");
    if (!token || token.length < 16) return json({ error: "Invalid token" }, 400);

    const tokenHash = await sha256(token);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: row, error: selErr } = await admin
      .from("school_email_verifications")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) return json({ error: "Invalid or expired link" }, 404);
    if (row.consumed_at) return json({ error: "This link has already been used" }, 409);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "This link has expired" }, 410);
    }
    if (row.user_id !== user.id) {
      return json({ error: "This link belongs to a different account. Sign in as that user first." }, 403);
    }

    // Re-check the domain is still allow-listed
    const domain = row.email.split("@")[1]?.toLowerCase();
    const { data: school } = await admin
      .from("schools")
      .select("id, name, domain")
      .eq("domain", domain)
      .maybeSingle();
    if (!school) {
      return json({ error: "This school is no longer on the partner list." }, 409);
    }

    // Consume token + update profile (service role bypasses the guard trigger)
    const { error: upd1 } = await admin
      .from("school_email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upd1) throw upd1;

    const { error: upd2 } = await admin
      .from("profiles")
      .update({
        school_email: row.email,
        school_email_verified_at: new Date().toISOString(),
        school_sponsored: true,
        subscription_status: "sponsored",
      })
      .eq("id", user.id);
    if (upd2) throw upd2;

    return json({ ok: true, school: { name: school.name, domain: school.domain } });
  } catch (e) {
    console.error("confirm-school-verification error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
