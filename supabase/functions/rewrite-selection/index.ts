import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logUsage, geminiUsage } from "../_shared/usage.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
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

    const ent = await checkEntitlement(user.id);
    if (ent instanceof Response) return ent;

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

    // The rewrite has to respect the same ceiling the comment was generated
    // under, or a rewrite quietly pushes a near-limit comment past it and
    // breaks the school's reporting system. Budget = ceiling minus the text
    // that is staying put.
    const maxChars = Number(reqs.maxChars) || 750;
    const selectionBudget = Math.max(40, maxChars - (fullComment.length - selection.length));

    const systemPrompt = `You rewrite a SPECIFIC SELECTION inside an end-of-term school report comment.

${reqs.policy ? `SCHOOL POLICY (must follow exactly):\n${String(reqs.policy).slice(0, 6000)}\n\n` : ""}${styleText ? `TEACHER STYLE REFERENCE:\n${styleText.slice(0, 4000)}\n\n` : ""}REQUIREMENTS:
- Tone: ${reqs.tone || "warm and professional"}
${reqs.bannedPhrases ? `- Avoid these phrases: ${reqs.bannedPhrases}` : ""}

REPORT INTEGRITY RULES (these bind the rewrite exactly as they bound the original comment):
- NEVER state, imply or hint at any mark, percentage, grade, position, ranking or "out of" figure — for a subject or for the overall average. Never say how much anything rose or fell by.
- NEVER characterise the SIZE of a rise or fall. You do not know the magnitude, so you cannot know whether a change was slight or severe. Do not write "slightly", "slight", "marginally", "a little", "somewhat", "significantly", "sharply", "dramatically" or any equivalent. Direction only: it improved, or it fell back.
- Never compare this student to other students, to the form, the class, or to any average.
- Do not introduce a claim the selection did not already make. You are changing how something is said, not what is being asserted. If the selection says a subject fell back, the replacement says that too — no softening it into something milder, no hardening it into something worse.
- Do not state the number of days a student was absent.
- If the comment recommends Help Sessions, keep that exact term, capitalised — it is the school's formal name for its after-hours support and no paraphrase is acceptable.
- The replacement must be at most ${selectionBudget} characters, so that the whole comment stays within its ${maxChars}-character limit.

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

    const ask = async (extra: string) => {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt + extra }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        }),
      });
      if (res.status === 429) return { rateLimited: true as const };
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Gemini API: ${res.status} ${t}`);
      }
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
      const parsed = raw ? JSON.parse(raw) : { text: "" };
      await logUsage({ userId: user.id, functionName: "rewrite-selection", model: "google/gemini-3.1-pro-preview", units: 1, usage: geminiUsage(data.usageMetadata) });
      return { text: String(parsed.text ?? "") };
    };

    const first = await ask("");
    if ("rateLimited" in first) return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // A prompt instruction alone does not reliably hold a length. Ask once
    // more with the actual overshoot quoted back, then keep whichever attempt
    // fits — trimming the text here would leave a broken sentence in the
    // middle of the comment.
    let text = first.text;
    if (text.length > selectionBudget) {
      const second = await ask(`\n\nYour previous replacement was ${text.length} characters, which is too long. It must be ${selectionBudget} characters or fewer. Say the same thing more concisely.`);
      if (!("rateLimited" in second) && second.text.length < text.length) text = second.text;
      console.log(`rewrite-selection: ${first.text.length} -> ${text.length} chars (budget ${selectionBudget})`);
    }

    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
