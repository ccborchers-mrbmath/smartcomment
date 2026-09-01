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
import { logUsage } from "../_shared/usage.ts";
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

// Byte-exact latin1. NOT the same as TextDecoder("latin1"), whose label maps
// to windows-1252 and remaps 0x80-0x9F — we need offsets to match bytes 1:1.
function latin1(bytes: Uint8Array): string {
  // 1KB chunks via apply: measurably faster than spreading 32KB at a time, and
  // far below any engine's argument-count ceiling.
  let s = "";
  const CHUNK = 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return s;
}

// Best-effort text layer with coordinates, one entry per page. Empty for
// scanned PDFs or any structure this deliberately small parser doesn't
// understand — the model then falls back to reading the PDF visually.
async function positionalPages(pdf: Uint8Array): Promise<string[]> {
  const s = latin1(pdf);

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
    const content = latin1(out);
    if (!content.includes("Tj") && !content.includes("TJ")) continue;
    const rows = positionalRows(content);
    if (rows.trim()) pages.push(rows);
  }

  return pages;
}

const SYSTEM_PROMPT = `You extract structured data from a school term report PDF produced by a student management system (such as EdAdmin).

STRUCTURE OF THE DOCUMENT:
- The PDF contains ONE PAGE PER STUDENT. Every page uses the same template.
- Each page shows the student's full name and their form/registration class code (e.g. "Form: 2CW").
- Each page has a marks table. Rows are SUBJECTS. Columns are grouped by TERM (e.g. Term 1, Term 2, Term 3).
- Within each term group there are TWO columns: the STUDENT's own mark, then the FORM AVERAGE for that subject that term (usually headed "Student Ave" / "Form Ave").

WHERE THE SUBJECT ROWS START AND STOP — read this before deciding what is a subject:
- Subject rows begin immediately BELOW the term header row and end immediately ABOVE the "Total" row.
- "Total" and "Average %" are computed summary rows. They must NEVER appear in the subjects list.
- The "Average %" row IS wanted, separately: return one entry per term in term_averages, exactly as printed. Do not recalculate it from the subject marks and do not round or adjust it. The school may leave subjects out of its own average and prints it rounded, and that printed figure is the one we want.
- The "Total" row is not needed at all.
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

const RESPONSE_SCHEMA = {
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
          term_averages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                term: { type: "string" },
                average: { type: "string" },
              },
              required: ["term", "average"],
            },
          },
          subjects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                marks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      term: { type: "string" },
                      student_mark: { type: "string" },
                      form_average: { type: "string" },
                    },
                    required: ["term", "student_mark", "form_average"],
                  },
                },
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
};

interface Extraction {
  year?: string;
  form?: string;
  terms?: string[];
  students?: any[];
}

// One Gemini call. Each call covers only a handful of pages so neither the
// request nor the generated JSON gets large enough to run past the edge
// function's wall clock — sending the whole form in a single call is what
// made this time out.
async function callGemini(userParts: any[], label: string): Promise<Extraction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
      {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: userParts }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      },
    );
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) {
      const t = await res.text();
      console.error(`extract-reports ${label}: gemini ${res.status} ${t.slice(0, 500)}`);
      throw new Error(`Gemini API: ${res.status}`);
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const parsed: Extraction = raw ? JSON.parse(raw) : {};
    (parsed as any).__usage = data.usageMetadata;
    return parsed;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Timed out reading ${label}. Try splitting the report into smaller PDFs.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Reported back on failure so a browser-side error says how far it got.
  let stage = "start";
  let pageCount = 0;
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

    const t0 = Date.now();
    stage = "decode_base64";
    const pdfBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    let pages: string[] = [];
    let layerError: string | null = null;
    stage = "parse_text_layer";
    try {
      pages = await positionalPages(pdfBytes);
      pageCount = pages.length;
    } catch (e) {
      // Do NOT quietly drop to the vision path here. That path sends the whole
      // PDF in one call, which is the slow shape this function was rewritten to
      // avoid — swallowing the error would silently restore it.
      layerError = e instanceof Error ? e.message : String(e);
      console.error("extract-reports: positional text layer threw", layerError);
    }
    console.log(`extract-reports: ${pages.length} text-layer pages in ${Date.now() - t0}ms${layerError ? ` (layer error: ${layerError})` : ""}`);

    // A thrown parse error is a bug, not a scanned PDF. Falling through to the
    // vision path would hide it behind the same slow single call this function
    // was rewritten to avoid, so report it instead — including in the response,
    // because the edge logs are not always reachable.
    if (layerError) {
      return new Response(
        JSON.stringify({
          error: `Could not read the PDF's text layer: ${layerError}`,
          stage: "positional_text_layer",
          pdf_bytes: pdfBytes.length,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // A genuinely scanned PDF (no text layer, no error) still needs the whole
    // file in one vision call. Refuse a big one rather than stalling until the
    // platform kills us — a killed function surfaces in the browser as an
    // opaque CORS error, which is close to undebuggable for the teacher.
    const MAX_VISION_BYTES = 1_500_000;
    if (pages.length === 0 && pdfBytes.length > MAX_VISION_BYTES) {
      return new Response(
        JSON.stringify({
          error: `That PDF has no readable text layer and is too large (${Math.round(pdfBytes.length / 1024)}KB) to read as images in one pass. Split it into smaller files and import them one at a time.`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let year = "", form = "", terms: string[] = [], students: any[] = [];
    const usages: any[] = [];

    stage = pages.length > 0 ? "gemini_batched" : "gemini_vision";
    if (pages.length > 0) {
      // Text-layer path: batch the pages into small calls and run a few at a
      // time. The PDF bytes are not sent — the coordinates carry everything
      // the model needs, and leaving the file out keeps each call fast.
      const GROUP = 4;
      const CONCURRENCY = 3;
      const groups: { from: number; text: string }[] = [];
      for (let i = 0; i < pages.length; i += GROUP) {
        groups.push({
          from: i,
          text: pages.slice(i, i + GROUP).map((p, j) => `--- PAGE ${i + j + 1} ---\n${p}`).join("\n\n"),
        });
      }

      const results: Extraction[] = new Array(groups.length);
      for (let i = 0; i < groups.length; i += CONCURRENCY) {
        const wave = groups.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(wave.map((g, k) =>
          callGemini(
            [{
              text: `Extract every student page below. Each line is one horizontal row of a page; every cell carries its exact x coordinate. Use those x coordinates to decide which term/column each number belongs to. A row with fewer numbers than the full set means some cells are genuinely blank — return "" for those and never shift a value across.\n\n${g.text}`,
            }],
            `pages ${g.from + 1}-${Math.min(g.from + GROUP, pages.length)}`,
          ).then((r) => ({ idx: i + k, r })),
        ));
        for (const { idx, r } of settled) results[idx] = r;
      }

      for (const r of results) {
        if (!r) continue;
        if (!year && r.year) year = r.year;
        if (!form && r.form) form = r.form;
        if (!terms.length && r.terms?.length) terms = r.terms;
        if (r.students?.length) students.push(...r.students);
        if ((r as any).__usage) usages.push((r as any).__usage);
      }
    } else {
      // Scanned or unparseable PDF: one vision pass over the whole file.
      const r = await callGemini(
        [
          { text: "Extract every student page from this term report. Align each number to its column by its position on the page, and return \"\" for any cell that is blank." },
          { inline_data: { mime_type: mimeType ?? "application/pdf", data: fileBase64 } },
        ],
        "whole document",
      );
      year = r.year ?? ""; form = r.form ?? ""; terms = r.terms ?? []; students = r.students ?? [];
      if ((r as any).__usage) usages.push((r as any).__usage);
    }

    console.log(`extract-reports: ${students.length} students in ${Date.now() - t0}ms`);

    await logUsage({
      userId: user.id,
      functionName: "extract-reports",
      model: "google/gemini-3.1-pro-preview",
      units: students.length,
      usage: {
        prompt_tokens: usages.reduce((s, u) => s + (u?.promptTokenCount ?? 0), 0),
        completion_tokens: usages.reduce((s, u) => s + (u?.candidatesTokenCount ?? 0), 0),
      },
      metadata: { students: students.length, pages: pages.length, calls: usages.length, positional_layer: pages.length > 0 },
    });

    return new Response(
      JSON.stringify({ year, form, terms, students, positional_layer: pages.length > 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg === "rate_limited" ? 429 : 500;
    return new Response(
      JSON.stringify({
        error: msg === "rate_limited" ? "Rate limit reached. Try again shortly." : msg,
        stage: stage,
        pages: pageCount,
      }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
