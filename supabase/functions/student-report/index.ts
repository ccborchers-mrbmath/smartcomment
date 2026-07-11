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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ent = await checkEntitlement(user.id);
    if (ent instanceof Response) return ent;

    const { studentId, mode, synthesis } = await req.json();
    if (!studentId || typeof studentId !== "string") {
      return new Response(JSON.stringify({ error: "studentId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const reportMode: "synthesis" | "interventions" = mode === "interventions" ? "interventions" : "synthesis";

    // Load student + class
    const { data: student } = await supabase
      .from("students")
      .select("id, name, first_name, last_name, class_id, overrides")
      .eq("id", studentId)
      .maybeSingle();
    if (!student) {
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: cls } = await supabase.from("classes").select("name, subject, year_grade").eq("id", student.class_id).maybeSingle();

    let systemPrompt = "";
    let userPrompt = "";
    let model = "google/gemini-2.5-pro";

    if (reportMode === "synthesis") {
      // Gather everything
      const [{ data: notes }, { data: assessments }, { data: marks }] = await Promise.all([
        supabase.from("student_inputs").select("type, text, transcript, term, created_at").eq("student_id", studentId).order("created_at"),
        supabase.from("assessments").select("id, name, description, term, max_marks, position").eq("class_id", student.class_id).order("position"),
        supabase.from("assessment_marks").select("assessment_id, raw_mark, status").eq("student_id", studentId),
      ]);

      const marksByA: Record<string, any> = {};
      (marks ?? []).forEach((m: any) => { marksByA[m.assessment_id] = m; });

      const notesText = (notes ?? []).map((n: any) => {
        const body = n.transcript || n.text || "";
        return `- [${n.type} · ${n.term ?? "?"} · ${new Date(n.created_at).toISOString().slice(0,10)}]\n  ${body.replace(/\n/g, "\n  ")}`;
      }).join("\n");

      const assessmentRows = (assessments ?? []).map((a: any) => {
        const m = marksByA[a.id];
        const desc = (a.description || "").trim() || "(no description)";
        let result = "not yet marked";
        if (m) {
          if (m.status === "absent") result = "Absent";
          else if (m.status === "exempt") result = "Exempt";
          else if (m.raw_mark !== null && m.raw_mark !== undefined) {
            const pct = Math.round((Number(m.raw_mark) / Number(a.max_marks)) * 100);
            result = `${m.raw_mark}/${a.max_marks} (${pct}%)`;
          }
        }
        return `- "${a.name}" (${a.term ?? "?"}) — ${desc} — ${result}`;
      }).join("\n");

      const ov = (student.overrides as any) || {};
      const gender = ov.gender;
      const pronouns = gender === "male" ? "he/him/his" : gender === "female" ? "she/her/hers" : "(refer by name only)";
      const otherOv = { ...ov }; delete otherOv.gender;

      systemPrompt = `You are an expert school report writer producing a COMPREHENSIVE INTERNAL STUDENT REPORT for a teacher's own reference (not for parents).

Your job: synthesize EVERYTHING the teacher has recorded about this student into one well-structured, readable report. Categorize information thematically. Eliminate repetition. Preserve every meaningful fact — do not omit anything substantive — but combine overlapping observations into single, clearer statements.

OUTPUT FORMAT (Markdown):
# Comprehensive Student Report — {Student Name}
*{Class name, subject, year/grade if available}*

## Snapshot
A 3–5 sentence overview of who this student is across the available evidence.

## Academic Performance
- Render a markdown table of every assessment with columns: Assessment | Term | Topic/Skill | Result.
- Then a short prose paragraph identifying WITHIN-STUDENT relative strengths and growth areas, referring to topics/skills (from descriptions) rather than assessment names. Do not compare to other students.

## Character & Conduct
Synthesized observations about behaviour, attitude, social interactions, effort, resilience, etc. Group related notes.

## Subject-Specific Feedback
Synthesized observations about subject knowledge, skills, work habits in the class subject. Group by sub-theme where possible.

## Pastoral / Other Notes
Anything else the teacher has logged that doesn't fit above (attendance, family context, wellbeing, incidents, files attached, etc.).

## Term-by-Term Progression
Brief paragraph per term that has data, tracking how the picture has changed.

RULES:
- This is INTERNAL — raw marks and percentages ARE permitted in the Academic Performance table.
- In prose sections, prefer qualitative description. You may reference whether something improved or declined.
- NEVER invent facts. If a section has no evidence, write "No notes recorded." under it.
- Use the student's first name throughout prose. Pronouns: ${pronouns}.
- Be concise but thorough. No filler.`;

      userPrompt = `STUDENT NAME: ${student.name}
CLASS: ${cls?.name ?? "?"}${cls?.subject ? ` · ${cls.subject}` : ""}${cls?.year_grade ? ` · ${cls.year_grade}` : ""}
${Object.keys(otherOv).length ? `OVERRIDES: ${JSON.stringify(otherOv)}\n` : ""}
=== TEACHER NOTES (chronological) ===
${notesText || "(none)"}

=== ASSESSMENTS ===
${assessmentRows || "(none)"}

Produce the comprehensive report now.`;
    } else {
      // interventions layer — requires synthesis text from layer 1
      if (!synthesis || typeof synthesis !== "string") {
        return new Response(JSON.stringify({ error: "synthesis text required for interventions mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      systemPrompt = `You are an experienced educational psychologist and classroom teacher. Given a comprehensive internal report about a single student, produce a SUPPORT & INTERVENTION ANALYSIS.

OUTPUT FORMAT (Markdown):
## Support & Intervention Analysis

### Key Themes
3–6 bullets naming the most important patterns from the report (strengths to build on, and concerns to address). Be specific to THIS student.

### Suggested Strategies
For each theme that needs action, give a heading and 2–4 concrete, classroom-actionable strategies. Strategies should be:
- Specific (not generic platitudes)
- Achievable within a regular classroom
- Tied directly to evidence in the report

### Possible Intervention Pathways
If anything in the report warrants more formal intervention (learning support, counselling referral, parent meeting, accommodations, etc.), describe it here with a clear rationale. If nothing warrants formal intervention, say so plainly.

### Questions Still Worth Asking
2–4 questions the teacher should explore or gather more evidence on.

RULES:
- Ground every recommendation in evidence from the supplied report — quote or paraphrase briefly to show the link.
- Do not invent diagnoses. Use cautious language ("may benefit from", "consider exploring").
- Do not repeat the report; reference it.`;
      userPrompt = `Here is the comprehensive student report:\n\n${synthesis}\n\nProduce the Support & Intervention Analysis now.`;
    }

    const geminiModelId = model === "google/gemini-2.5-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModelId}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      console.error("Gemini API error", res.status, t);
      return new Response(JSON.stringify({ error: `Gemini API: ${res.status}` }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

    await logUsage({
      userId: user.id,
      functionName: "student-report",
      model,
      units: 1,
      usage: geminiUsage(data.usageMetadata),
      metadata: { mode: reportMode, student_id: studentId },
    });

    return new Response(JSON.stringify({ text, mode: reportMode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
