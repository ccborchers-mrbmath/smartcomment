import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    const domain = user.email.split("@")[1]?.toLowerCase();
    if (!domain) return json({ error: "Invalid email" }, 400);

    const body = await req.json().catch(() => ({}));
    const action = body.action as "claim" | "add_admin" | "remove_admin" | "list_teachers" | "revoke_teacher";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Find or create school
    let { data: school } = await admin
      .from("schools")
      .select("*")
      .eq("domain", domain)
      .maybeSingle();

    if (action === "claim") {
      if (!school) {
        const { data: created, error } = await admin
          .from("schools")
          .insert({ domain, name: domain })
          .select()
          .single();
        if (error) throw error;
        school = created;
      }
      // Refuse if any admin exists already
      const { count } = await admin
        .from("school_admins")
        .select("*", { count: "exact", head: true })
        .eq("school_id", school!.id);
      if ((count ?? 0) > 0) {
        // Allow if caller is already an admin (idempotent)
        const { data: existing } = await admin
          .from("school_admins")
          .select("user_id")
          .eq("school_id", school!.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!existing) return json({ error: "School already has an admin" }, 409);
        return json({ school });
      }
      await admin.from("school_admins").insert({ school_id: school!.id, user_id: user.id });
      return json({ school });
    }

    if (!school) return json({ error: "No school yet" }, 404);

    // Caller must be an admin of this school
    const { data: caller } = await admin
      .from("school_admins")
      .select("user_id")
      .eq("school_id", school.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!caller) return json({ error: "forbidden" }, 403);

    if (action === "add_admin") {
      const email = String(body.email || "").toLowerCase().trim();
      if (!email.endsWith("@" + domain)) return json({ error: "Email must match school domain" }, 400);
      // Look up user by email via auth admin api
      const { data: list, error: lerr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (lerr) throw lerr;
      const target = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!target) return json({ error: "User not found — they must sign up first" }, 404);
      await admin.from("school_admins").insert({ school_id: school.id, user_id: target.id }).select();
      return json({ ok: true });
    }

    if (action === "remove_admin") {
      const targetUserId = String(body.user_id || "");
      if (!targetUserId) return json({ error: "user_id required" }, 400);
      await admin.from("school_admins").delete().eq("school_id", school.id).eq("user_id", targetUserId);
      return json({ ok: true });
    }

    if (action === "list_teachers") {
      const { data: rows, error } = await admin
        .from("profiles")
        .select("id, email, school_email, school_email_verified_at")
        .eq("school_sponsored", true)
        .ilike("school_email", `%@${domain}`)
        .order("school_email_verified_at", { ascending: false });
      if (error) throw error;
      return json({ teachers: rows ?? [] });
    }

    if (action === "revoke_teacher") {
      const targetUserId = String(body.user_id || "");
      if (!targetUserId) return json({ error: "user_id required" }, 400);
      // Confirm the target is sponsored under THIS school's domain.
      const { data: target } = await admin
        .from("profiles")
        .select("id, school_email, school_sponsored")
        .eq("id", targetUserId)
        .maybeSingle();
      if (!target) return json({ error: "Teacher not found" }, 404);
      const targetDomain = target.school_email?.split("@")[1]?.toLowerCase();
      if (!target.school_sponsored || targetDomain !== domain) {
        return json({ error: "Teacher is not sponsored by your school" }, 403);
      }
      const { error } = await admin
        .from("profiles")
        .update({
          school_email: null,
          school_email_verified_at: null,
          school_sponsored: false,
          subscription_status: "trialing",
        })
        .eq("id", targetUserId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
