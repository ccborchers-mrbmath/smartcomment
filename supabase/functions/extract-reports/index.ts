// Extracts a whole registration (form / home group) class from a school MIS
// term report PDF — e.g. EdAdmin — where every student gets one page listing
// each subject's mark next to the form average for that subject, per term.
//
// Returns students + subjects + per-term marks so the caller can build a
// marksheet in one go. Marks come back as strings ("" = not present) so a
// missing mark is never confused with a zero.
//
// Column alignment is the whole ballgame here. These reports are ragged: a
// student who joined mid-year may have a form average printed for a subject
// with no mark of their own beside it. Read left-to-right and that average
// lands in the wrong term as if it were the student's mark. So where the PDF
// carries a text layer we extract it ourselves — with exact x/y coordinates —
// and hand that to the model as the authority on which column a number sits
// in. The PDF itself still goes along for scanned files and as a visual check.
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

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // try the next format
    }
  }
  return null;
}

// Turn one content stream into rows of positioned text:
//   y=627 | x=34 "First Language English" | x=265 "80" | x=319 "71" | …
function positionalRows(content: string): string {
  type Item = { y: number; x: number; t: string };
  const items: Item[] = [];
  let x = 0, y = 0;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    const td = line.match(/^(-?[\d.]+)\s+(-?[\d.]+)\s+Td$/);
    if (td) { x = parseFloat(td[1]); y = parseFloat(td[2]); continue; }

    const tm = line.match(/^(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm$/);
    if (tm) { x = parseFloat(tm[5]); y = parseFloat(tm[6]); continue; }

    if (!line.includes("Tj") && !line.includes("TJ")) continue;
    const parts = line.match(/\((?:[^()\\]|\\.)*\)/g);
    if (!parts) continue;
    const text = parts
      .map((p) => p.slice(1, -1).replace(/\\([()\\])/g, "$1"))
      .join("");
    if (text.trim()) items.push({ y: Math.round(y * 10) / 10, x: Math.round(x * 10) / 10, t: text });
  }

  const byRow = new Map<number, Item[]>();
  for (const it of items) {
    const key = Math.round(it.y);
    (byRow.get(key) ?? byRow.set(key, []).get(key)!).push(it);
  }
  return Array.from(byRow.keys())
    .sort((a, b) => b - a) // PDF origin is bottom-left, so descending y reads top-down
    .map((yy) => {
      const cells = (byRow.get(yy) ?? []).sort((a, b) => a.x - b.x);
      return `y=${yy} | ` + cells.map((c) => `x=${Math.round(c.x)} "${c.t}"`).join(" | ");
    })
    .join("\n");
}

// Best-effort text layer with coordinates. Empty string for scanned PDFs or
// any structure this deliberately small parser doesn't understand — the model
// then falls back to reading the PDF visually.
async function positionalText(pdf: Uint8Array): Promise<string> {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < pdf.length; i += CHUNK) {
    s += String.fromCharCode(...pdf.subarray(i, i + CHUNK));
  }

  const pages: string[] = [];
  let idx = 0;
  while (pages.length < 200) {
    const st = s.indexOf("stream", idx);
    if (st < 0) break;
    let start = st + "stream".length;
    if (s[start] === "\r") start++;
    if (s[start] === "\n") start++;
    const end = s.indexOf("endstream", start);
    if (end < 0) break;
    idx = end + "endstream".length;

    // Writers pad the gap before "endstream" with an EOL. DecompressionStream
    // rejects those trailing bytes as junk, so trim back to the payload.
    let dataEnd = end;
    while (dataEnd > start) {
      const b = pdf[dataEnd - 1];
      if (b === 0x0a || b === 0x0d || b === 0x20 || b === 0x09) dataEnd--;
      else break;
    }

    const out = await inflate(pdf.subarray(start, dataEnd));
    if (!out) continue;
    const content = new TextDecoder("latin1").decode(out);
    if (!content.includes("Tj") && !content.includes("TJ")) continue;
    const rows = positionalRows(content);
    if (rows.trim()) pages.push(rows);
  }

  return pages.map((p, i) => `--- PAGE ${i + 1} ---\n${p}`).join("\n\n");
}

const SYSTEM_PROMPT = `You extract structured data from a school term report PDF produced by a student management system (such as EdAdmin).

STRUCTURE OF THE DOCUMENT:
- The PDF contains ONE PAGE PER STUDENT. Every page uses the same template.
- Each page shows the student's full name and their form/registration class code (e.g. "Form: 2CW").
- Each page has a marks table. Rows are SUBJECTS. Columns are grouped by TERM (e.g. Term 1, Term 2, Term 3).
- Within each term group there are TWO columns: the STUDENT's own mark, then the FORM AVERAGE for that subject that term (usually headed "Student Ave" / "Form Ave").

WHERE THE SUBJECT ROWS START AND STOP — read this before deciding what is a subject:
- Subject rows begin immediately BELOW the term header row and end immediately ABOVE the "Total" row.
- "Total" and "Average %" are computed summary rows. They are NOT subjects. Never return them.
- EVERYTHING BELOW the "Total"/"Average %" rows is outside the marks table. Never treat any of it as a subject, even when it looks like one.
- Lines following an "Extra-Curricular Activities:" heading are that student's extracurricular involvement (e.g. "Sport: Fast 5 Netball", a club, an ensemble). Return them joined together in the extracurricular field. They are NOT subjects and have no marks.
- "Promotion Result:" and "Days Absent: N" are their own fields. Return the number alone for days_absent (e.g. "1", not "Days Absent: 1").
- Ignore page furniture entirely: the school name, "Report", the term/year caption, "Curriculum: …", "Form Teacher:", "Head:", and any matric-exemption or minimum-requirement small print at the foot of the page.

HOW TO READ THE MARKS TABLE — THIS IS THE PART THAT MATTERS MOST:
1. Columns are frequently RAGGED. A student may have NO mark for a subject in a term while the FORM AVERAGE for that subject IS printed, and vice versa. A student who joined partway through the year may have nothing at all for the earlier terms.
2. You MUST assign every number to a column by its HORIZONTAL POSITION on the page. NEVER read the numbers in a row from left to right and assume they fill the columns in order. A row containing a single number does NOT mean that number belongs to the first column.
3. When a POSITIONAL TEXT LAYER is supplied below, it is the AUTHORITATIVE source for both the values and their column positions. Every cell carries an exact x coordinate. Establish the x coordinate of each of the six columns from rows that are FULLY populated (those are the most reliable anchor — header labels can sit a few points to the side of the numbers beneath them), then assign every number in every other row to whichever column centre its own x is nearest. Only fall back to reading the rendered page visually if the positional text layer is missing or clearly does not cover a page.
4. If a cell is empty, return "" for it. NEVER invent, infer, carry over, interpolate, or shift a value into a neighbouring column to close a gap.
5. Return a subject row even when every cell in it is empty for that student.
6. Reproduce marks exactly as printed — no rounding, rescaling, or converting to percentages.
7. Include EVERY student page. Do not stop early, summarise, or deduplicate.
8. Use each student's name exactly as printed, preserving spelling, accents and capitalisation.

Also return the academic year shown on the report (e.g. 2026), the form code, and the ordered term labels exactly as they head the columns (e.g. "Term 1", "Term 2", "Term 3").`;

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

    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const pdfBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    let layer = "";
    try {
      layer = await positionalText(pdfBytes);
    } catch (e) {
      console.warn("extract-reports: positional text layer failed, falling back to vision only", e);
    }
    console.log(`extract-reports: positional layer ${layer ? `${layer.length} chars` : "unavailable"}`);

    const markSchema = {
      type: "object",
      properties: {
        term: { type: "string" },
        student_mark: { type: "string" },
        form_average: { type: "string" },
      },
      required: ["term", "student_mark", "form_average"],
    };

    const userParts: any[] = [
      {
        text: layer
          ? "Extract every student page from this term report.\n\nA POSITIONAL TEXT LAYER extracted from the PDF follows. Each line is one horizontal row of the page; each cell shows its exact x coordinate. Use these x coordinates to decide which term/column every number belongs to. Remember that a row with fewer numbers than the full set means some cells are genuinely blank — return \"\" for those and never shift a value across."
          : "Extract every student page from this term report. Align each number to its column by its position on the page, and return \"\" for any cell that is blank.",
      },
      { inline_data: { mime_type: mimeType ?? "application/pdf", data: fileBase64 } },
    ];
    if (layer) userParts.push({ text: `POSITIONAL TEXT LAYER (authoritative for values and column positions):\n\n${layer}` });

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              year: { type: "string" },
              form: { type: "string" },
              terms: { type: "array", items: { type: "string" } },
              students: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    days_absent: { type: "string" },
                    promotion_result: { type: "string" },
                    extracurricular: { type: "string" },
                    subjects: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          marks: { type: "array", items: markSchema },
                        },
                        required: ["name", "marks"],
                      },
                    },
                  },
                  required: ["name", "subjects"],
                },
              },
            },
            required: ["year", "terms", "students"],
          },
        },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!res.ok) {
      const t = await res.text();
      console.error("extract-reports gemini error", res.status, t);
      throw new Error(`Gemini API: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const parsed = raw ? JSON.parse(raw) : { year: "", form: "", terms: [], students: [] };

    await logUsage({
      userId: user.id,
      functionName: "extract-reports",
      model: "google/gemini-3.1-pro-preview",
      units: parsed.students?.length ?? 0,
      usage: geminiUsage(data.usageMetadata),
      metadata: { students: parsed.students?.length ?? 0, terms: parsed.terms?.length ?? 0, positional_layer: !!layer },
    });

    return new Response(JSON.stringify({ ...parsed, positional_layer: !!layer }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
