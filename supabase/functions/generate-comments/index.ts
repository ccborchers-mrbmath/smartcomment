import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const { studentIds, instruction } = await req.json();
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return new Response(JSON.stringify({ error: "No students" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load students + verify ownership
    const { data: students } = await supabase
      .from("students")
      .select("id, name, class_id, overrides")
      .in("id", studentIds);
    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ error: "No students found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const classId = students[0].class_id;
    const { data: cls } = await supabase.from("classes").select("*").eq("id", classId).single();
    const { data: defaults } = await supabase
      .from("teacher_defaults")
      .select("requirements")
      .eq("teacher_id", user.id)
      .maybeSingle();
    // School-wide requirements (matched by user's email domain)
    const emailDomain = user.email?.split("@")[1]?.toLowerCase() || "";
    const { data: school } = emailDomain
      ? await supabase.from("schools").select("requirements, locked_fields").eq("domain", emailDomain).maybeSingle()
      : { data: null as any };
    const { data: inputs } = await supabase
      .from("student_inputs")
      .select("student_id, type, text, transcript, created_at")
      .in("student_id", studentIds)
      .order("created_at", { ascending: true });
    const { data: styleSamples } = await supabase
      .from("style_samples")
      .select("text")
      .limit(20);

    const classReqs = (cls?.requirements ?? {}) as any;
    const defaultReqs = (defaults?.requirements ?? {}) as any;
    const schoolReqs = ((school as any)?.requirements ?? {}) as any;
    const lockedFields: string[] = ((school as any)?.locked_fields ?? []) as string[];
    const schoolPolicyText = schoolReqs.policy as string | undefined;

    // Merge: school -> teacher defaults -> class. Locked school fields can never be overwritten.
    const reqs: any = { ...schoolReqs };
    for (const [k, v] of Object.entries(defaultReqs)) {
      if (lockedFields.includes(k)) continue;
      if (v !== null && v !== undefined && v !== "") reqs[k] = v;
    }
    for (const [k, v] of Object.entries(classReqs)) {
      if (lockedFields.includes(k)) continue;
      if (v !== null && v !== undefined && v !== "") reqs[k] = v;
    }
    // School policy is always prepended (highest priority) regardless of locks
    if (schoolPolicyText && reqs.policy && reqs.policy !== schoolPolicyText) {
      reqs.policy = `SCHOOL POLICY (overrides everything below):\n${schoolPolicyText}\n\nADDITIONAL TEACHER POLICY:\n${reqs.policy}`;
    } else if (schoolPolicyText) {
      reqs.policy = schoolPolicyText;
    }
    const styleText = (styleSamples ?? []).map((s) => s.text).join("\n\n---\n\n");

    const systemPrompt = `You write end-of-term school report comments for a teacher.

Voice & style — match the teacher's previous comments below. Be specific, warm, and professional.

${reqs.policy ? `SCHOOL POLICY (HIGHEST PRIORITY — these rules from the school's official policy document MUST be followed exactly, and override any conflicting guidance below):\n${String(reqs.policy).slice(0, 8000)}\n\n` : ""}${styleText ? `TEACHER'S PREVIOUS COMMENTS (style reference):\n${styleText.slice(0, 6000)}\n\n` : ""}SCHOOL REQUIREMENTS:
- Tone: ${reqs.tone || "warm and professional"}
- Structure: ${reqs.structure || "strengths, areas for growth, next steps"}
- Word range: ${reqs.minWords || 60}–${reqs.maxWords || 120} words
${reqs.maxChars ? `- Hard character limit: ${reqs.maxChars}` : ""}
${reqs.pronoun ? `- Refer to student in ${reqs.pronoun}` : ""}
${reqs.bannedPhrases ? `- Avoid these phrases: ${reqs.bannedPhrases}` : ""}
${reqs.mustInclude ? `- Must include: ${reqs.mustInclude}` : ""}
${reqs.notes ? `\nAdditional notes: ${reqs.notes}` : ""}

Output one comment per student, faithful to the notes provided. Never invent facts.

CRITICAL PRONOUN RULE: Each student block has a PRONOUNS field. Use ONLY those pronouns when referring to the student. The per-student PRONOUNS field overrides any global pronoun setting.

CRITICAL NAMING RULE (HIGHEST PRIORITY — overrides everything else):
- The NAME field in each student block is the AUTHORITATIVE spelling of the student's name. It comes from the official class roster.
- Typed notes, voice transcripts, OCR text, and any other source MAY contain DIFFERENT spellings of the same name (e.g. roster says "Aleisha" but a voice transcript says "Alicia", or roster says "Siôn" but notes say "Shawn"). These differences are ERRORS in the source — they are NOT alternative valid spellings.
- You MUST use ONLY the exact spelling from the NAME field every single time you refer to the student. Do not change, shorten, lengthen, anglicise, phoneticise, or "correct" it. Do not mix spellings within a comment.
- If the notes contain a name spelled differently, treat that as referring to THIS student and silently use the roster spelling instead.
- Use the first word of the NAME field as the first name.${instruction ? `\n\nADDITIONAL INSTRUCTION: ${instruction}` : ""}`;

    const studentBlocks = students.map((s) => {
      const myInputs = (inputs ?? []).filter((i) => i.student_id === s.id);
      const notes = myInputs.map((i) => {
        const body = i.transcript || i.text || "";
        return `[${i.type}] ${body}`;
      }).join("\n");
      const ov = (s.overrides as any) || {};
      const gender = ov.gender;
      const pronouns = gender === "male"
        ? "he/him/his (use male pronouns only)"
        : gender === "female"
        ? "she/her/hers (use female pronouns only)"
        : "(gender unspecified — refer to the student by name only; NEVER use they/them/their — singular they is not permitted)";
      const otherOv = { ...ov };
      delete otherOv.gender;
      const ovText = Object.keys(otherOv).length ? `Per-student override: ${JSON.stringify(otherOv)}` : "";
      return `STUDENT_ID: ${s.id}\nNAME: ${s.name}\nPRONOUNS: ${pronouns}\nNOTES:\n${notes || "(no notes)"}\n${ovText}`;
    }).join("\n\n========\n\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate one report comment for each of the following students.\n\n${studentBlocks}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_comments",
            description: "Return the generated comments per student.",
            parameters: {
              type: "object",
              properties: {
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      student_id: { type: "string" },
                      text: { type: "string" },
                    },
                    required: ["student_id", "text"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["comments"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_comments" } },
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
    const parsed = args ? JSON.parse(args) : { comments: [] };

    // Persist as new versions
    for (const c of parsed.comments) {
      const { data: existing } = await supabase
        .from("generated_comments")
        .select("version")
        .eq("student_id", c.student_id)
        .order("version", { ascending: false })
        .limit(1);
      const nextVersion = (existing?.[0]?.version ?? 0) + 1;
      await supabase.from("generated_comments").insert({
        student_id: c.student_id,
        teacher_id: user.id,
        text: c.text,
        version: nextVersion,
        model: "google/gemini-2.5-pro",
      });
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
