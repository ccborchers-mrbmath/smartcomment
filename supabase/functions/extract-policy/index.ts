import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage, geminiUsage } from "../_shared/usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await sb.auth.getUser();
      userId = u?.user?.id ?? null;
    }
    const { text, fileBase64, mimeType } = await req.json();

    const userParts: any[] = [];
    if (text) userParts.push({ text: `Extract the school's report comment policy / requirements from this document. Preserve every rule, phrasing requirement, capitalisation rule, banned phrase, structural requirement, and tone instruction.\n\n${text}` });
    if (fileBase64) {
      userParts.push({ text: "Extract the school's report comment policy / requirements from this document. Preserve every rule, phrasing requirement, capitalisation rule, banned phrase, structural requirement, and tone instruction. Output a clean, well-organised list of rules the AI must follow when writing comments." });
      userParts.push({ inline_data: { mime_type: mimeType ?? "image/png", data: fileBase64 } });
    }
    if (userParts.length === 0) {
      return new Response(JSON.stringify({ error: "No input provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "You extract and rewrite school report-writing policies into a clear, complete, prescriptive ruleset that an AI report writer can follow. Keep ALL rules from the source. Be exhaustive and faithful — do not summarise away detail. Output plain text organised by section." }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { policy: { type: "string" } },
            required: ["policy"],
          },
        },
      }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini API: ${res.status} ${t}`);
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const parsed = raw ? JSON.parse(raw) : { policy: "" };
    if (userId) await logUsage({ userId, functionName: "extract-policy", model: "google/gemini-2.5-pro", units: 1, usage: geminiUsage(data.usageMetadata) });
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
