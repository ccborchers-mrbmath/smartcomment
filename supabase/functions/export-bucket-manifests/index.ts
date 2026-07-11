// One-off: generate signed-URL manifests for audio-notes + handwriting buckets.
// Writes manifest JSON to the private "exports" bucket, returns signed URLs to those manifests.
// Auth: OWNER_EMAIL only.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = "ccborchers@gmail.com";
const SIGN_TTL = 60 * 60 * 24 * 7; // 7 days, max

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      // Folder entries have null id / null metadata
      if (item.id === null || (item as any).metadata === null) {
        const sub = prefix ? `${prefix}/${item.name}` : item.name;
        const nested = await listAll(bucket, sub);
        out.push(...nested);
      } else {
        out.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function signInBatches(bucket: string, paths: string[]) {
  const entries: { path: string; signedUrl: string; size?: number }[] = [];
  const batch = 100;
  for (let i = 0; i < paths.length; i += batch) {
    const slice = paths.slice(i, i + batch);
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(slice, SIGN_TTL);
    if (error) throw new Error(`sign ${bucket} @${i}: ${error.message}`);
    for (const row of data ?? []) {
      if (row.error || !row.signedUrl) throw new Error(`sign row ${row.path}: ${row.error}`);
      const url = row.signedUrl.startsWith("http")
        ? row.signedUrl
        : `${SUPABASE_URL}/storage/v1${row.signedUrl.startsWith("/") ? "" : "/"}${row.signedUrl}`;
      entries.push({ path: row.path!, signedUrl: url });
    }

  }
  return entries;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await sb.auth.getUser();
    const email = u?.user?.email?.toLowerCase();
    if (!email || email !== OWNER_EMAIL) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const buckets = ["audio-notes", "handwriting"];
    const summary: Record<string, unknown> = {};

    for (const bucket of buckets) {
      const paths = await listAll(bucket);
      const entries = await signInBatches(bucket, paths);
      const manifest = {
        bucket,
        generatedAt: new Date().toISOString(),
        signedUrlTtlSeconds: SIGN_TTL,
        expiresAt: new Date(Date.now() + SIGN_TTL * 1000).toISOString(),
        count: entries.length,
        files: entries,
      };
      const key = `manifest-${bucket}.json`;
      const { error: upErr } = await admin.storage
        .from("exports")
        .upload(key, new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), {
          upsert: true,
          contentType: "application/json",
        });
      if (upErr) throw new Error(`upload manifest ${bucket}: ${upErr.message}`);
      const { data: signed, error: signErr } = await admin.storage.from("exports").createSignedUrl(key, SIGN_TTL);
      if (signErr || !signed) throw new Error(`sign manifest ${bucket}: ${signErr?.message}`);
      summary[bucket] = {
        fileCount: entries.length,
        manifestPath: `exports/${key}`,
        manifestSignedUrl: signed.signedUrl,
        expiresAt: manifest.expiresAt,
      };
    }

    return new Response(JSON.stringify({ ok: true, summary }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
