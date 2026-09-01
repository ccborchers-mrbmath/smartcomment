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

    const { studentIds, instruction, includeMarks, markTerms } = await req.json();
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return new Response(JSON.stringify({ error: "No students" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const allowedMarkTerms: string[] = Array.isArray(markTerms) ? markTerms : [];

    // Load students + verify ownership
    const { data: students } = await supabase
      .from("students")
      .select("id, name, class_id, overrides, included_terms, days_absent, extracurricular")
      .in("id", studentIds);
    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ error: "No students found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const classId = students[0].class_id;
    const { data: cls } = await supabase.from("classes").select("*").eq("id", classId).single();

    // A registration comment is meaningless without the marksheet, so marks are
    // on by default for those classes. Only "Generate all" on the class page
    // sends includeMarks; generating from a student card or regenerating from
    // the review page does not, and defaulting to false there silently produced
    // comments with no academic content at all. Subject classes keep the
    // explicit opt-in, since there the teacher's checkbox is a real choice.
    const wantMarks = includeMarks === undefined || includeMarks === null
      ? !!cls?.is_registration
      : !!includeMarks;
    const { data: defaults } = await supabase
      .from("teacher_defaults")
      .select("requirements")
      .eq("teacher_id", user.id)
      .maybeSingle();
    // Global rules: super-admin's (ccborchers@gmail.com) teacher_defaults apply to everyone.
    // Any field the super-admin has set is locked and cannot be overridden by teacher/class.
    const SUPER_ADMIN_EMAIL = "ccborchers@gmail.com";
    const { data: superAdminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", SUPER_ADMIN_EMAIL)
      .maybeSingle();
    let school: { requirements: any; locked_fields: string[] } | null = null;
    if (superAdminProfile?.id) {
      const { data: saDefaults } = await supabase
        .from("teacher_defaults")
        .select("requirements")
        .eq("teacher_id", superAdminProfile.id)
        .maybeSingle();
      const saReqs = (saDefaults?.requirements ?? {}) as any;
      const lockedKeys = Object.entries(saReqs)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k]) => k);
      school = { requirements: saReqs, locked_fields: lockedKeys };
    }
    const { data: inputs } = await supabase
      .from("student_inputs")
      .select("student_id, type, text, transcript, term, created_at")
      .in("student_id", studentIds)
      .order("created_at", { ascending: true });
    const { data: styleSamples } = await supabase
      .from("style_samples")
      .select("text")
      .eq("active", true)
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

    // Optional: load marksheet data for this class
    let assessmentsList: any[] = [];
    const marksByStudent: Record<string, Record<string, any>> = {};
    if (wantMarks) {
      let aq = supabase.from("assessments").select("id, name, description, term, max_marks, position, class_average").eq("class_id", classId).order("position");
      if (allowedMarkTerms.length > 0) aq = aq.in("term", allowedMarkTerms);
      const { data: aData } = await aq;
      assessmentsList = aData ?? [];
      if (assessmentsList.length > 0) {
        const aIds = assessmentsList.map((a) => a.id);
        const { data: mData } = await supabase
          .from("assessment_marks")
          .select("assessment_id, student_id, raw_mark, status")
          .in("assessment_id", aIds)
          .in("student_id", studentIds);
        (mData ?? []).forEach((m: any) => {
          (marksByStudent[m.student_id] ||= {})[m.assessment_id] = m;
        });
      }
    }
    const hasMarksData = wantMarks && assessmentsList.length > 0;
    const isRegistration = !!cls?.is_registration;

    // ---- Registration classes: pick which subjects the comment may name ----
    // Deterministic in code rather than left to the model, which is unreliable
    // at ranking, tie-breaking and honouring a cap.
    const MOVE_THRESHOLD = 5;   // percentage points, not relative change
    const HIGH_MARK = 85;       // absolute commendation, ignores the form average
    const MOVE_SLOTS = 3;

    // Latest term on the sheet is the one being reported on; the one before it
    // is what we measure movement against.
    const termsOnSheet = Array.from(
      new Set(assessmentsList.map((a: any) => a.term).filter(Boolean)),
    ).sort() as string[];
    const currentTerm = termsOnSheet[termsOnSheet.length - 1] ?? null;
    const priorTerm = termsOnSheet[termsOnSheet.length - 2] ?? null;

    type Pick = { subject: string; kind: "commend" | "concern"; why: string };

    const pctOf = (a: any, m: any): number | null => {
      if (!m || m.status !== "graded" || m.raw_mark === null || m.raw_mark === undefined) return null;
      const max = Number(a.max_marks);
      if (!max) return null;
      return (Number(m.raw_mark) / max) * 100;
    };

    const selectSubjects = (studentId: string): Pick[] => {
      const marks = marksByStudent[studentId] || {};
      // subject -> { current, prior } as percentages
      const bySubject = new Map<string, { cur: number | null; prior: number | null }>();
      for (const a of assessmentsList) {
        const name = (a.name || "").trim();
        if (!name) continue;
        const entry = bySubject.get(name) ?? { cur: null, prior: null };
        const pct = pctOf(a, marks[a.id]);
        if (a.term === currentTerm) entry.cur = pct;
        else if (a.term === priorTerm) entry.prior = pct;
        bySubject.set(name, entry);
      }

      // One 85%+ subject is reserved and taken out of the movement pool, so a
      // subject that is excellent but static still gets named, and the
      // improvement slot goes to a genuine mover.
      let reserved: string | null = null;
      let best = -Infinity;
      for (const [name, v] of bySubject) {
        if (v.cur !== null && v.cur >= HIGH_MARK && v.cur > best) { best = v.cur; reserved = name; }
      }

      const movement = new Map<string, number>();
      for (const [name, v] of bySubject) {
        if (name === reserved) continue;
        if (v.cur === null || v.prior === null) continue;   // no prior term = no movement
        movement.set(name, v.cur - v.prior);
      }

      const imp = Array.from(movement.entries()).filter(([, d]) => d >= MOVE_THRESHOLD)
        .sort((a, b) => b[1] - a[1]).map(([n]) => n);
      const dec = Array.from(movement.entries()).filter(([, d]) => d <= -MOVE_THRESHOLD)
        .sort((a, b) => a[1] - b[1]).map(([n]) => n);

      let chosen: string[];
      if (!dec.length) chosen = imp.slice(0, MOVE_SLOTS);
      else if (!imp.length) chosen = dec.slice(0, MOVE_SLOTS);
      else if (imp.length > dec.length) chosen = [...imp.slice(0, 2), ...dec.slice(0, 1)];
      else if (dec.length > imp.length) chosen = [...dec.slice(0, 2), ...imp.slice(0, 1)];
      else {
        // Equal counts: rank by magnitude, take the top two, then balance the
        // third against whichever direction those two shared.
        const ranked = Array.from(movement.entries())
          .filter(([, d]) => Math.abs(d) >= MOVE_THRESHOLD)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([n]) => n);
        const top2 = ranked.slice(0, 2);
        let third: string | undefined;
        if (top2.length === 2 && top2.every((n) => (movement.get(n) ?? 0) > 0)) {
          third = dec.find((n) => !top2.includes(n));
        } else if (top2.length === 2 && top2.every((n) => (movement.get(n) ?? 0) < 0)) {
          third = imp.find((n) => !top2.includes(n));
        } else {
          third = ranked.find((n) => !top2.includes(n));
        }
        chosen = third ? [...top2, third] : top2;
      }

      const picks: Pick[] = [];
      if (reserved) {
        picks.push({ subject: reserved, kind: "commend", why: "excellent standard" });
      }
      for (const name of chosen) {
        const d = movement.get(name) ?? 0;
        picks.push(d > 0
          ? { subject: name, kind: "commend", why: "improved on the previous term" }
          : { subject: name, kind: "concern", why: "declined from the previous term" });
      }
      return picks;
    };

    // Attendance is banded in code so the model never sees or reasons about the
    // raw figure — it receives a directive, or nothing at all.
    const attendanceDirective = (days: number | null | undefined): string | null => {
      if (days === null || days === undefined) return null;
      const n = Number(days);
      if (!Number.isFinite(n) || n <= 2) return null;
      if (n <= 4) {
        return "ATTENDANCE: some lessons were missed. Encourage them to make sure any work missed has been caught up. Do not state the number of days.";
      }
      return "ATTENDANCE: a significant number of lessons were missed. Express measured concern, and strongly encourage attending Help Sessions (the school's formal after-hours support — use that exact capitalised term) to catch up so nothing missed is left unaddressed before examinations. Do not state the number of days.";
    };

    const registrationFraming = `

YOU ARE WRITING AS A REGISTRATION TEACHER (also called a form teacher or home group teacher).
- This is a HOLISTIC comment about the whole child, NOT a single-subject comment.
- Draw the picture across ALL of the student's subjects together, plus their character, conduct, attitude, effort and involvement in school life.
- Do not write as though you taught them one subject. You are the teacher who oversees them across the whole curriculum.
- Where the evidence supports it, comment on the overall shape of their academic profile (which areas they are flourishing in, which are proving harder) rather than narrating every subject one by one.
- The teacher's own notes about this student carry equal weight to the marks — they capture conduct, character and pastoral observations the marks cannot show.
- A comment is NOT complete on marks alone. The teacher's own observations about character, conduct, attitude and presentation must carry the comment; the subjects below support it. If the teacher has written little or nothing, write a correspondingly short comment rather than filling the space from the marks.

HOW TO USE THE SUBJECT LIST:
- Each student block carries a "SUBJECTS TO COMMENT ON" list. It has already been chosen for you against the school's rules. Name THOSE subjects and NO OTHERS. Do not survey the rest of the curriculum, and do not mention a subject merely because it appears in the teacher's notes as an aside.
- Each entry gives you a FACT, not wording. Express it in your own prose; never copy the phrasing back.
- "commend" means say something genuinely warm about that subject. "concern" means note it as an area needing attention and encourage the student to address it — measured and constructive, never harsh.
- Every comparison here is against the previous term, and the reader already knows that. Do NOT restate the timeframe for each subject. Name it at most ONCE in the whole comment, and preferably not at all. Repeating "this Term" or "since last Term" sentence after sentence reads badly. Prefer "The improvement in Physical Sciences is noted with pleasure" over "she made an excellent improvement this Term".
- Vary your sentence openings. Do not begin consecutive sentences with the student's name or with the same construction.
- NEVER characterise the SIZE of a rise or fall. You are told only the direction, never the magnitude, so you cannot know whether a change was slight or severe. Do not write "slightly", "marginally", "significantly", "sharply", "dramatically" or any equivalent about a subject's movement. State that it has improved or fallen back, and leave it there.
- Whenever you flag a subject as a concern, recommend that the student attends Help Sessions. Use that exact term, capitalised as "Help Sessions" — it is the school's formal name for its after-hours support, and no paraphrase is acceptable.
- Recommend Help Sessions ONCE in the comment, even where several things point to them. Do not repeat the recommendation per subject.
- A subject marked "reached an excellent standard" deserves clear congratulation. Say so plainly; the student should feel it.
- NEVER state, imply or hint at any mark, percentage, grade, position, ranking or "out of" figure for any subject. Never say how much something rose or fell by. Describe direction and significance in words only.
- Never compare this student to other students, to the form, the class, or to any average.
- If the list says none, say nothing about individual subjects at all.

ATTENDANCE:
- Mention attendance ONLY if the student block carries an ATTENDANCE directive, and then follow exactly what it says. Never state the number of days absent.
- If there is no ATTENDANCE line, say nothing whatsoever about attendance — do not praise it, and do not remark on it being good.`;

    const systemPrompt = `You write end-of-term school report comments for a teacher.
${isRegistration ? registrationFraming : ""}

Voice & style — match the teacher's previous comments below. Be specific, warm, and professional.

${reqs.policy ? `SCHOOL POLICY (HIGHEST PRIORITY — these rules from the school's official policy document MUST be followed exactly, and override any conflicting guidance below):\n${String(reqs.policy).slice(0, 8000)}\n\n` : ""}${styleText ? `TEACHER'S PREVIOUS COMMENTS (style reference):\n${styleText.slice(0, 6000)}\n\n` : ""}SCHOOL REQUIREMENTS:
- Tone: ${reqs.tone || "warm and professional"}
- Structure: ${reqs.structure || "strengths, areas for growth, next steps"}
- Length: ${reqs.minChars || 350}–${reqs.maxChars || 750} characters
- The minimum length is a TARGET, NEVER A QUOTA. Write only what the teacher's notes and the marks actually support. If the evidence runs out at 300 characters, stop at 300 characters. NEVER pad, generalise, restate the same point in different words, or invent an observation in order to reach the minimum — a short comment grounded in real evidence is always better than a long one containing anything you made up.
- The maximum is an ABSOLUTE HARD CEILING. The comment is pasted into a school reporting system with a fixed field size, and a single character over breaks it. Count as you write and finish comfortably inside the limit. Exceeding the maximum is a failure, however good the prose.
${reqs.pronoun ? `- Refer to student in ${reqs.pronoun}` : ""}
${reqs.bannedPhrases ? `- Avoid these phrases: ${reqs.bannedPhrases}` : ""}
${reqs.mustInclude ? `- Must include: ${reqs.mustInclude}` : ""}
${reqs.notes ? `\nAdditional notes: ${reqs.notes}` : ""}

Output one comment per student, faithful to the notes provided. Never invent facts.

If a student block includes DAYS ABSENT, use it only when it genuinely matters — sustained absence that plausibly affected progress, or attendance worth praising. Never recite the number itself. If it includes EXTRA-CURRICULAR, weave those activities in naturally where they add to the picture of the student.

CRITICAL PRONOUN RULE: Each student block has a PRONOUNS field. Use ONLY those pronouns when referring to the student. The per-student PRONOUNS field overrides any global pronoun setting.

CRITICAL NAMING RULE (HIGHEST PRIORITY — overrides everything else):
- The NAME field in each student block is the AUTHORITATIVE spelling of the student's name. It comes from the official class roster.
- Typed notes, voice transcripts, OCR text, and any other source MAY contain DIFFERENT spellings of the same name (e.g. roster says "Aleisha" but a voice transcript says "Alicia", or roster says "Siôn" but notes say "Shawn"). These differences are ERRORS in the source — they are NOT alternative valid spellings.
- You MUST use ONLY the exact spelling from the NAME field every single time you refer to the student. Do not change, shorten, lengthen, anglicise, phoneticise, or "correct" it. Do not mix spellings within a comment.
- If the notes contain a name spelled differently, treat that as referring to THIS student and silently use the roster spelling instead.
- Use ONLY the student's first name (the first whitespace-separated word of the NAME field) every time you refer to them. NEVER use the surname, last name, family name, or full name. Do not use initials. Do not use "Mr/Mrs/Ms [Surname]". If the NAME field is "Aleisha Thompson", refer to the student only as "Aleisha" — never "Aleisha Thompson", never "Thompson", never "Miss Thompson".${hasMarksData ? `\n\nASSESSMENT DATA RULES (HIGHEST PRIORITY when an ASSESSMENT SUMMARY block is present):\n- NEVER state, imply, or hint at a raw mark, percentage, fraction, ranking, position, or "out of" number. Do NOT say "scored", "achieved X%", "got X out of Y", "top of the class", "above average", "below average", "highest mark", "lowest mark", or similar.\n- NEVER compare the student to other students, to the form, or to a class average. Any comparison you express must be between this student's own assessments.\n- Use the per-assessment deltas and descriptions to identify relative strengths and growth areas WITHIN the student's own record.\n- Use comparative language only, e.g. "has shown a stronger performance in {topic from description A} than in {topic from description B}", "is finding {topic} more challenging than {other topic}", "progress in {topic} has lifted noticeably since {earlier assessment topic}".\n- NEVER use "done well in…", "done poorly in…", "did badly", "failed", "excelled", or any qualitative judgement word without a comparative anchor inside the student's own record.\n- Refer to assessment content by its DESCRIPTION (the topic/skill assessed), NOT by the assessment NAME (not "Quiz 1", not "Mid-term test").\n- Assessments marked Absent or Exempt must not be commented on.` : ""}${instruction ? `\n\nADDITIONAL INSTRUCTION: ${instruction}` : ""}`;

    const buildBlock = (s: any) => {
      const allowedTerms: string[] = (s as any).included_terms ?? ["2026 Term 1","2026 Term 2","2026 Term 3","2026 Term 4"];
      const allowedSet = new Set(allowedTerms);
      const myInputs = (inputs ?? []).filter((i: any) => i.student_id === s.id && allowedSet.has(i.term ?? "2026 Term 2"));
      const notes = myInputs.map((i: any) => {
        const body = i.transcript || i.text || "";
        return `[${i.type}${i.term ? ` · ${i.term}` : ""}] ${body}`;
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

      let marksBlock = "";
      if (hasMarksData && isRegistration) {
        // Curated list only. Handing over the full sheet invites the model to
        // range across every subject and quote figures.
        const picks = selectSubjects(s.id);
        marksBlock = picks.length
          ? `\nSUBJECTS TO COMMENT ON (exactly these, no others):\n${picks
              .map((p) => `- ${p.subject} — ${p.kind}: ${p.why}`)
              .join("\n")}`
          : "\nSUBJECTS TO COMMENT ON: none — no subject moved enough to be worth noting. Base the comment on the teacher's notes alone.";
      } else if (hasMarksData) {
        const studentMarks = marksByStudent[s.id] || {};
        const rows: string[] = [];
        const pcts: { aid: string; name: string; desc: string; pct: number }[] = [];
        for (const a of assessmentsList) {
          const m = studentMarks[a.id];
          const desc = (a.description || "").trim() || "(no description)";
          const termLabel = a.term || "?";
          if (!m || m.status === "graded" && (m.raw_mark === null || m.raw_mark === undefined)) {
            rows.push(`- "${a.name}" (${termLabel}, ${desc}): not yet marked`);
            continue;
          }
          if (m.status === "absent") {
            rows.push(`- "${a.name}" (${termLabel}, ${desc}): Absent`);
            continue;
          }
          if (m.status === "exempt") {
            rows.push(`- "${a.name}" (${termLabel}, ${desc}): Exempt`);
            continue;
          }
          const pct = (Number(m.raw_mark) / Number(a.max_marks)) * 100;
          rows.push(`- "${a.name}" (${termLabel}, ${desc}): ${m.raw_mark}/${a.max_marks}`);
          pcts.push({ aid: a.id, name: a.name, desc, pct });
        }
        if (pcts.length > 0) {
          const avg = pcts.reduce((s, x) => s + x.pct, 0) / pcts.length;
          const deltas = pcts.map((p) => {
            const d = Math.round(p.pct - avg);
            const sign = d > 0 ? `+${d}` : `${d}`;
            return `${p.name} ${sign}`;
          }).join(", ");
          rows.push(`Student's own average across graded assessments: ${Math.round(avg)}%`);
          rows.push(`Per-assessment delta vs own average (positive = relatively stronger, negative = relatively weaker): ${deltas}`);
        } else {
          rows.push("(no graded assessments for this student in the selected terms)");
        }
        marksBlock = `\nASSESSMENT SUMMARY:\n${rows.join("\n")}`;
      }

      const extras: string[] = [];
      const attendance = isRegistration ? attendanceDirective(s.days_absent) : null;
      if (attendance) extras.push(attendance);
      const extrasText = extras.length ? `\n${extras.join("\n")}` : "";

      return `STUDENT_ID: ${s.id}\nNAME: ${s.name}\nPRONOUNS: ${pronouns}${extrasText}\nNOTES:\n${notes || "(no notes)"}${marksBlock}\n${ovText}`;
    };

    // The character ceiling cannot be left to the model. It overshot a stated
    // "hard ceiling" by 31% in testing, and a comment one character over breaks
    // the school's reporting system. So it is enforced here: ask for a shorter
    // rewrite, and if that still misses, cut at a sentence boundary. Never
    // mid-word or mid-sentence — a truncated comment goes to a parent.
    const maxChars = Number(reqs.maxChars) || 750;

    const trimToSentence = (text: string, limit: number): string => {
      if (text.length <= limit) return text;
      const clipped = text.slice(0, limit);
      let cut = -1;
      for (const mark of [". ", "! ", "? "]) cut = Math.max(cut, clipped.lastIndexOf(mark));
      cut = Math.max(cut, /[.!?]$/.test(clipped) ? clipped.length - 1 : -1);
      // Only accept a sentence break that keeps most of the comment; otherwise
      // fall back to a word boundary rather than returning a stub.
      if (cut > limit * 0.6) return clipped.slice(0, cut + 1).trim();
      const space = clipped.lastIndexOf(" ");
      return (space > 0 ? clipped.slice(0, space) : clipped).trim();
    };

    const shortenToFit = async (text: string, limit: number): Promise<string> => {
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
          {
            method: "POST",
            headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: `You shorten a school report comment so it fits a hard character limit. Preserve every substantive point, the teacher's voice and the warmth. Remove only redundancy and padding. NEVER introduce a new fact, observation, subject or claim. NEVER mention marks, percentages or comparisons. Return ONLY the shortened comment.` }] },
              contents: [{ role: "user", parts: [{ text: `Shorten this to at most ${limit} characters (it is currently ${text.length}):\n\n${text}` }] }],
            }),
          },
        );
        if (!res.ok) return trimToSentence(text, limit);
        const data = await res.json();
        const out = (data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "").trim();
        await logUsage({
          userId: user.id,
          functionName: "generate-comments",
          model: "google/gemini-3-flash-preview",
          units: 1,
          usage: geminiUsage(data.usageMetadata),
          metadata: { purpose: "shorten_to_fit", limit },
        });
        // Even the rewrite is not trusted to obey — verify, then cut.
        return out && out.length <= limit ? out : trimToSentence(out || text, limit);
      } catch (e) {
        console.error("shortenToFit failed, trimming instead", e);
        return trimToSentence(text, limit);
      }
    };

    const callBatch = async (batch: any[]): Promise<{ comments: { student_id: string; text: string }[]; error?: { status: number; message: string } }> => {
      const studentBlocks = batch.map(buildBlock).join("\n\n========\n\n");
      const doFetch = () => fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: `Generate one report comment for each of the following students.\n\n${studentBlocks}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
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
                  },
                },
              },
              required: ["comments"],
            },
          },
        }),
      });

      let res = await doFetch();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await doFetch();
      }
      if (res.status === 429) return { comments: [], error: { status: 429, message: "Rate limit reached. Try again shortly." } };
      if (!res.ok) {
        const t = await res.text();
        console.error(`Gemini API batch error ${res.status}: ${t}`);
        return { comments: [], error: { status: res.status, message: `Gemini API: ${res.status}` } };
      }
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
      const parsed = raw ? JSON.parse(raw) : { comments: [] };

      for (const cm of parsed.comments ?? []) {
        if (typeof cm.text === "string" && cm.text.length > maxChars) {
          const before = cm.text.length;
          cm.text = await shortenToFit(cm.text, maxChars);
          console.log(`generate-comments: comment ${before} -> ${cm.text.length} chars (ceiling ${maxChars})`);
        }
      }

      await logUsage({
        userId: user.id,
        functionName: "generate-comments",
        model: "google/gemini-3.1-pro-preview",
        units: parsed.comments?.length ?? 0,
        usage: geminiUsage(data.usageMetadata),
        metadata: { batch_size: batch.length },
      });


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
          model: "google/gemini-3.1-pro-preview",
        });
      }
      return { comments: parsed.comments ?? [] };
    };

    // Chunk students into small batches and run with bounded concurrency
    const BATCH_SIZE = 3;
    const CONCURRENCY = 3;
    const batches: any[][] = [];
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      batches.push(students.slice(i, i + BATCH_SIZE));
    }

    const allComments: { student_id: string; text: string }[] = [];
    let firstError: { status: number; message: string } | null = null;

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const wave = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.all(wave.map((b) => callBatch(b)));
      for (const r of results) {
        if (r.comments.length) allComments.push(...r.comments);
        if (r.error && !firstError) {
          firstError = r.error;
        }
      }
    }

    if (allComments.length === 0 && firstError) {
      return new Response(JSON.stringify({ error: firstError.message }), { status: firstError.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload: any = { comments: allComments };
    if (firstError) payload.partial_error = firstError.message;
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
