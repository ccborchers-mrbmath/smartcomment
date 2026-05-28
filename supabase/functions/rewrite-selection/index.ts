import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage } from "../_shared/usage.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { studentId, fullComment, selection, instruction } = await req.json();
    if (!studentId || typeof fullComment !== "string" || typeof selection !== "string" || !selection.trim()) {
      return new Response(JSON.stringify({ error: "Missing studentId, fullComment, or selection" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!fullComment.includes(selection)) {
      return new Response(JSON.stringify({ error: "Selection must appear in the comment" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: student } = await supabase
      .from("students")
      .select("id, name, class_id, overrides")
      .eq("id", studentId)
      .single();
    if (!student) return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: cls } = await supabase.from("classes").select("*").eq("id", student.class_id).single();
    const { data: defaults } = await supabase.from("teacher_defaults").select("requirements").eq("teacher_id", user.id).maybeSingle();

    const SUPER_ADMIN_EMAIL = "ccborchers@gmail.com";
    const { data: superAdminProfile } = await supabase.from("profiles").select("id").eq("email", SUPER_ADMIN_EMAIL).maybeSingle();
    let schoolReqs: any = {};
    let lockedFields: string[] = [];
    if (superAdminProfile?.id) {
      const { data: saDefaults } = await supabase.from("teacher_defaults").select("requirements").eq("teacher_id", superAdminProfile.id).maybeSingle();
      schoolReqs = (saDefaults?.requirements ?? {}) as any;
      lockedFields = Object.entries(schoolReqs).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k]) => k);
    }
    const classReqs = (cls?.requirements ?? {}) as any;
    const defaultReqs = (defaults?.requirements ?? {}) as any;
    const reqs: any = { ...schoolReqs };
    for (const [k, v] of Object.entries(defaultReqs)) {
      if (lockedFields.includes(k)) continue;
      if (v !== null && v !== undefined && v !== "") reqs[k] = v;
    }
    for (const [k, v] of Object.entries(classReqs)) {
      if (lockedFields.includes(k)) continue;
      if (v !== null && v !== undefined && v !== "") reqs[k] = v;
    }

    const { data: styleSamples } = await supabase.from("style_samples").select("text").eq("active", true).limit(20);
    const styleText = (styleSamples ?? []).map((s) => s.text).join("\n\n---\n\n");

    const ov = (student.overrides as any) || {};
    const gender = ov.gender;
    const pronouns = gender === "male"
      ? "he/him/his (use male pronouns only)"
      : gender === "female"
      ? "she/her/hers (use female pronouns only)"
      : "(gender unspecified — refer to the student by name only; NEVER use they/them/their)";
    const firstName = (student.name || "").trim().split(/\s+/)[0] || student.name;

    const systemPrompt = `You rewrite a SPECIFIC SELECTION inside an end-of-term school report comment.

${reqs.policy ? `SCHOOL POLICY (must follow exactly):\n${String(reqs.policy).slice(0, 6000)}\n\n` : ""}${styleText ? `TEACHER STYLE REFERENCE:\n${styleText.slice(0, 4000)}\n\n` : ""}REQUIREMENTS:
- Tone: ${reqs.tone || "warm and professional"}
${reqs.bannedPhrases ? `- Avoid these phrases: ${reqs.bannedPhrases}` : ""}

STUDENT: ${student.name}
PRONOUNS: ${pronouns}
NAME RULE: Refer to the student ONLY as "${firstName}" — never the surname, never the full name, never initials, never "Mr/Mrs/Ms".

YOUR TASK:
- Rewrite ONLY the SELECTED TEXT below.
- The replacement must read naturally in place of the selection — same approximate length unless the user instruction says otherwise.
- Preserve the surrounding sentence structure. Do not include the unchanged surrounding text in your output.
- Do not add quotes, labels, or commentary. Output ONLY the replacement text.
- Keep punctuation and capitalization consistent with how the selection sits inside the full comment (e.g. if the selection ends mid-sentence, do not end with a period).
${instruction ? `\nUSER INSTRUCTION FOR THIS REWRITE: ${instruction}` : ""}`;

    const userPrompt = `FULL COMMENT (for context — do NOT rewrite this whole thing):
"""
${fullComment}
"""

SELECTED TEXT TO REWRITE:
"""
${selection}
"""

Return only the replacement for the selected text.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_rewrite",
            description: "Return the replacement text for the selected portion of the comment.",
            parameters: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_rewrite" } },
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
    const parsed = args ? JSON.parse(args) : { text: "" };
    await logUsage({ userId: user.id, functionName: "rewrite-selection", model: "google/gemini-2.5-pro", units: 1, usage: data.usage });
    return new Response(JSON.stringify({ text: parsed.text ?? "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
