import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage } from "../_shared/usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await sb.auth.getUser();
      userId = u?.user?.id ?? null;
    }
    const body = await req.json();

    // Preferred path: storage references → temporary signed URLs.
    // This avoids loading full camera images into Edge Function memory.
    // { bucket: "handwriting", paths: string[] }
    let images: { url: string }[] = [];
    if (Array.isArray(body.paths) && body.paths.length) {
      const bucket: string = body.bucket ?? "handwriting";
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      for (const p of body.paths as string[]) {
        const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(p, 10 * 60);
        if (error || !signed?.signedUrl) throw new Error(`Could not prepare page ${p}: ${error?.message ?? "missing"}`);
        images.push({ url: signed.signedUrl });
      }
    } else if (Array.isArray(body.images) && body.images.length) {
      images = body.images.map((i: any) => ({ url: `data:${i.mimeType ?? "image/png"};base64,${i.base64}` }));
    } else if (body.imageBase64) {
      images = [{ url: `data:${body.mimeType ?? "image/png"};base64,${body.imageBase64}` }];
    }

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "Missing images" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isContinuation = Boolean(body.continuation);
    const systemPrompt = images.length > 1
      ? "You transcribe handwritten teacher notes verbatim. The user will provide MULTIPLE photos that are CONSECUTIVE PAGES of the SAME comment (a single comment that runs across multiple pages of a bound book). Concatenate the transcription in order, preserving line breaks. Output ONLY the transcribed text — no commentary, no page markers, no headers."
      : isContinuation
        ? "You transcribe one continuation page from a longer handwritten teacher comment verbatim. Output ONLY the text visible on this page — do not add connecting words, page markers, headers, summaries, or commentary. Preserve line breaks."
        : "You transcribe handwritten teacher notes verbatim. Output only the transcribed text — no commentary, no formatting changes beyond preserving line breaks.";

    const userContent: any[] = [
      { type: "text", text: images.length > 1
        ? `Transcribe these ${images.length} consecutive pages of one handwritten comment, in order.`
        : isContinuation
          ? "Transcribe this continuation page of the same handwritten comment."
        : "Transcribe these handwritten notes." },
      ...images.map((img) => ({ type: "image_url", image_url: { url: img.url } })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    if (userId) await logUsage({ userId, functionName: "ocr-handwriting", model: "google/gemini-2.5-flash", units: images.length, usage: data.usage, metadata: { pages: images.length } });
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
