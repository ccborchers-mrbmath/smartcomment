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

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const redirectBase = String(body.redirectBase || "").replace(/\/+$/, "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return json({ error: "Invalid email" }, 400);
    }
    if (!redirectBase) return json({ error: "redirectBase required" }, 400);

    const domain = rawEmail.split("@")[1];
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Allow-list check: domain must exist in public.schools
    const { data: school } = await admin
      .from("schools")
      .select("id, name, domain")
      .eq("domain", domain)
      .maybeSingle();

    if (!school) {
      return json({
        error: "not_allowlisted",
        message:
          "We don't have your school in our partner list yet. Ask your school admin to claim the domain to unlock free access.",
      }, 404);
    }

    // Rate limit: max 5 requests per user per hour
    const { count } = await admin
      .from("school_email_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 5) {
      return json({ error: "rate_limited", message: "Too many requests. Try again in an hour." }, 429);
    }

    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await admin
      .from("school_email_verifications")
      .insert({
        user_id: user.id,
        email: rawEmail,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
    if (insErr) throw insErr;

    const verifyUrl = `${redirectBase}/verify-school?token=${token}`;

    // Try to send via transactional email infra. If not set up, return the
    // link so the user (admin) can still complete setup manually during dev.
    let emailed = false;
    let emailError: string | undefined;
    try {
      const { error: sendErr } = await admin.functions.invoke("send-transactional-email", {
        body: {
          to: rawEmail,
          subject: "Verify your school email — SmartComment",
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;background:#ffffff">
              <h1 style="font-size:22px;margin:0 0 12px">Confirm your school email</h1>
              <p>Hi! Someone (hopefully you) asked to link <strong>${rawEmail}</strong> to a SmartComment account.</p>
              <p>Click the button below to confirm. This link expires in 24 hours.</p>
              <p style="margin:24px 0">
                <a href="${verifyUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Verify school email</a>
              </p>
              <p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p>
            </div>
          `,
        },
      });
      if (sendErr) {
        emailError = sendErr.message ?? String(sendErr);
      } else {
        emailed = true;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }

    return json({
      ok: true,
      emailed,
      emailError,
      // Only return the link in dev fallback when email failed AND the caller is the same user as the recipient.
      devLink: emailed ? undefined : (user.email?.toLowerCase() === rawEmail ? verifyUrl : undefined),
      school: { name: school.name, domain: school.domain },
    });
  } catch (e) {
    console.error("request-school-verification error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
