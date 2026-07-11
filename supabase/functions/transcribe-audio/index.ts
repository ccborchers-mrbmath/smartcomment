import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage } from "../_shared/usage.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await sb.auth.getUser();
    const userId: string | null = u?.user?.id ?? null;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const ent = await checkEntitlement(userId);
    if (ent instanceof Response) return ent;
    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "Missing audioBase64" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const audioBytes = base64ToBytes(audioBase64);
    const audioMime = mimeType ?? "audio/webm";
    const extension = audioMime.split("/")[1]?.split(";")[0] ?? "webm";
    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: audioMime }), `voice-note.${extension}`);
    form.append("model", "gpt-4o-transcribe");

    console.log(`transcribe-audio: sending ${audioBytes.length} bytes (${audioMime}) to OpenAI`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      console.error("transcribe-audio: fetch to OpenAI failed or timed out", fetchErr);
      throw new Error("Transcription request timed out. Please try again.");
    } finally {
      clearTimeout(timeout);
    }
    console.log(`transcribe-audio: OpenAI responded with status ${res.status}`);

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      console.error("transcribe error", res.status, t);
      throw new Error(`OpenAI transcription: ${res.status}`);
    }
    const data = await res.json();
    const text = data.text ?? "";
    if (userId) await logUsage({ userId, functionName: "transcribe-audio", model: "openai/gpt-4o-transcribe", units: 1 });
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
