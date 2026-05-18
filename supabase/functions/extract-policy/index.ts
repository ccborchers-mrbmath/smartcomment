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
    const { text, fileBase64, mimeType } = await req.json();

    const userContent: any[] = [];
    if (text) userContent.push({ type: "text", text: `Extract the school's report comment policy / requirements from this document. Preserve every rule, phrasing requirement, capitalisation rule, banned phrase, structural requirement, and tone instruction.\n\n${text}` });
    if (fileBase64) {
      userContent.push({ type: "text", text: "Extract the school's report comment policy / requirements from this document. Preserve every rule, phrasing requirement, capitalisation rule, banned phrase, structural requirement, and tone instruction. Output a clean, well-organised list of rules the AI must follow when writing comments." });
      userContent.push({ type: "image_url", image_url: { url: `data:${mimeType ?? "image/png"};base64,${fileBase64}` } });
    }
    if (userContent.length === 0) {
      return new Response(JSON.stringify({ error: "No input provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You extract and rewrite school report-writing policies into a clear, complete, prescriptive ruleset that an AI report writer can follow. Keep ALL rules from the source. Be exhaustive and faithful — do not summarise away detail. Output plain text organised by section." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_policy",
            description: "Return the extracted policy as a single ruleset string.",
            parameters: {
              type: "object",
              properties: { policy: { type: "string" } },
              required: ["policy"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_policy" } },
      }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway: ${res.status} ${t}`);
    }
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { policy: "" };
    if (userId) await logUsage({ userId, functionName: "extract-policy", model: "google/gemini-2.5-pro", units: 1, usage: data.usage });
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
