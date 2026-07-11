import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage, geminiUsage } from "../_shared/usage.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Convert a Uint8Array to base64 in chunks (avoids "Maximum call stack" on big files).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await sb.auth.getUser();
    const userId: string | null = u?.user?.id ?? null;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const ent = await checkEntitlement(userId);
    if (ent instanceof Response) return ent;
    const body = await req.json();

    // New preferred path: storage references → server fetches them.
    // { bucket: "handwriting", paths: string[] }
    let images: { base64: string; mimeType: string }[] = [];
    if (Array.isArray(body.paths) && body.paths.length) {
      const bucket: string = body.bucket ?? "handwriting";
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      for (const p of body.paths as string[]) {
        const { data: blob, error } = await admin.storage.from(bucket).download(p);
        if (error || !blob) throw new Error(`Could not load page ${p}: ${error?.message ?? "missing"}`);
        const buf = new Uint8Array(await blob.arrayBuffer());
        images.push({ base64: bytesToBase64(buf), mimeType: blob.type || "image/jpeg" });
      }
    } else if (Array.isArray(body.images) && body.images.length) {
      images = body.images.map((i: any) => ({ base64: i.base64, mimeType: i.mimeType ?? "image/png" }));
    } else if (body.imageBase64) {
      images = [{ base64: body.imageBase64, mimeType: body.mimeType ?? "image/png" }];
    }

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "Missing images" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = images.length > 1
      ? "You transcribe handwritten teacher notes verbatim. The user will provide MULTIPLE photos that are CONSECUTIVE PAGES of the SAME comment (a single comment that runs across multiple pages of a bound book). Concatenate the transcription in order, preserving line breaks. Output ONLY the transcribed text — no commentary, no page markers, no headers."
      : "You transcribe handwritten teacher notes verbatim. Output only the transcribed text — no commentary, no formatting changes beyond preserving line breaks.";

    const userParts: any[] = [
      { text: images.length > 1
        ? `Transcribe these ${images.length} consecutive pages of one handwritten comment, in order.`
        : "Transcribe these handwritten notes." },
      ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    ];

    const geminiModelId = "gemini-3-flash-preview";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModelId}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: userParts }],
      }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      console.error("gemini ocr error", res.status, t);
      throw new Error(`Gemini API: ${res.status}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    if (userId) await logUsage({ userId, functionName: "ocr-handwriting", model: "google/gemini-3-flash-preview", units: images.length, usage: geminiUsage(data.usageMetadata), metadata: { pages: images.length } });
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
