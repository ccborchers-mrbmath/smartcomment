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
// Needed here as well as in the shared logger: the background task writes the
// job row after the request's auth context is gone.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Supplied by the Supabase edge runtime; not in the ambient Deno types.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

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

// A font's /ToUnicode CMap: the byte codes in the content stream mean nothing
// on their own, and for a subset font they are usually not ASCII at all. One
// real report encoded every letter two codes high, so "PLEASE CHECK" sat in
// the file as "2NGCUG EJGEM" — extracted confidently, and completely wrong.
type FontMap = { map: Map<number, string>; bytes: 1 | 2 };

function parseCMap(text: string): FontMap {
  const map = new Map<number, string>();
  let bytes: 1 | 2 = 1;
  const hexPair = (h: string) => {
    let out = "";
    for (let i = 0; i + 3 < h.length + 1; i += 4) {
      const code = parseInt(h.slice(i, i + 4), 16);
      if (Number.isFinite(code)) out += String.fromCharCode(code);
    }
    return out;
  };
  for (const blk of text.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (m[1].length > 2) bytes = 2;
      map.set(parseInt(m[1], 16), hexPair(m[2]));
    }
  }
  for (const blk of text.match(/beginbfrange[\s\S]*?endbfrange/g) ?? []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (m[1].length > 2) bytes = 2;
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16), base = parseInt(m[3], 16);
      if (hi - lo > 65535) continue;
      for (let k = lo; k <= hi; k++) map.set(k, String.fromCharCode(base + (k - lo)));
    }
  }
  return { map, bytes };
}

// Resource name (/F5) -> that font's CMap, gathered across the whole document.
async function buildFontMaps(pdf: Uint8Array, s: string): Promise<Map<string, FontMap>> {
  const fonts = new Map<string, FontMap>();
  const offsets = new Map<number, number>();
  for (const m of s.matchAll(/(\d+)\s+0\s+obj/g)) offsets.set(Number(m[1]), m.index! + m[0].length);

  const streamOf = async (num: number): Promise<string | null> => {
    const at = offsets.get(num);
    if (at === undefined) return null;
    const st = s.indexOf("stream", at);
    if (st < 0) return null;
    let p = st + "stream".length;
    if (s[p] === "\r") p++;
    if (s[p] === "\n") p++;
    const e = s.indexOf("endstream", p);
    if (e < 0) return null;
    let de = e;
    while (de > p && (pdf[de - 1] === 0x0a || pdf[de - 1] === 0x0d || pdf[de - 1] === 0x20 || pdf[de - 1] === 0x09)) de--;
    const out = await inflate(pdf.subarray(p, de));
    return out ? latin1(out) : latin1(pdf.subarray(p, de));
  };

  for (const fd of s.matchAll(/\/Font\s*<<([\s\S]{0,2000}?)>>/g)) {
    for (const ref of fd[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
      const name = ref[1];
      if (fonts.has(name)) continue;
      const at = offsets.get(Number(ref[2]));
      if (at === undefined) continue;
      const tu = s.slice(at, at + 1200).match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (!tu) continue;
      const cmap = await streamOf(Number(tu[1]));
      if (cmap) fonts.set(name, parseCMap(cmap));
    }
  }
  return fonts;
}

// Turn one content stream into rows of positioned text:
//   y=627 | x=34 "First Language English" | x=265 "80" | x=319 "71" | …
//
// Tokenised rather than read line by line. The first version matched anchored
// regexes against each line, which silently required every operator to sit
// alone on its own line and every string to be parenthesised. Plenty of PDF
// writers emit "BT /F1 9 Tf 1 0 0 1 34 627 Tm (English) Tj ET" as one line, or
// use hex strings, and against those it found nothing whatsoever — reported
// upstream as "this PDF has no text in it", which was simply untrue.
function positionalRows(content: string, fonts: Map<string, FontMap>): string {
  type Item = { y: number; x: number; t: string; size: number };
  const items: Item[] = [];

  // Text state. We only need where each show operation starts, so glyph widths
  // are not tracked — the line matrix translation is enough.
  let lx = 0, ly = 0, leading = 0, size = 10, font: string | null = null;
  const operands: any[] = [];
  let lastName: string | null = null;
  let i = 0;

  const isDelim = (c: string) => c === "(" || c === ")" || c === "<" || c === ">" ||
    c === "[" || c === "]" || c === "{" || c === "}" || c === "/" || c === "%";
  const isSpace = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" ||
    c === "\f" || c === "\0";

  // A literal string: nested parentheses, backslash escapes, octal codes.
  const readLiteral = (): string => {
    let depth = 1, out = "";
    i++; // past "("
    while (i < content.length && depth > 0) {
      const c = content[i];
      if (c === "\\") {
        const n = content[i + 1];
        if (n >= "0" && n <= "7") {
          let oct = "";
          i++;
          while (oct.length < 3 && content[i] >= "0" && content[i] <= "7") oct += content[i++];
          out += String.fromCharCode(parseInt(oct, 8));
          continue;
        }
        const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
        out += map[n] ?? n ?? "";
        i += 2;
        continue;
      }
      if (c === "(") { depth++; out += c; i++; continue; }
      if (c === ")") { depth--; if (depth > 0) out += c; i++; continue; }
      out += c;
      i++;
    }
    return out;
  };

  const readHex = (): string => {
    i++; // past "<"
    let hex = "";
    while (i < content.length && content[i] !== ">") {
      const c = content[i];
      if (!isSpace(c)) hex += c;
      i++;
    }
    i++; // past ">"
    if (hex.length % 2) hex += "0";
    let out = "";
    for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
    return out;
  };

  // Map raw codes through the active font. Without a CMap the bytes are taken
  // at face value, which is right for the ordinary case where they are ASCII.
  const decode = (raw: string): string => {
    const fm = font ? fonts.get(font) : undefined;
    if (!fm || fm.map.size === 0) return raw;
    let out = "";
    if (fm.bytes === 2) {
      for (let k = 0; k + 1 < raw.length; k += 2) {
        const code = (raw.charCodeAt(k) << 8) | raw.charCodeAt(k + 1);
        out += fm.map.get(code) ?? " ";
      }
    } else {
      for (let k = 0; k < raw.length; k++) out += fm.map.get(raw.charCodeAt(k)) ?? " ";
    }
    return out;
  };

  // Identity-H and similar encodings put glyph ids in the string, not
  // characters. Where no CMap resolves them, those decode to control bytes,
  // and emitting them would fill the marksheet with rubbish.
  const readable = (s: string) => {
    if (!s) return false;
    let ok = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 255)) ok++;
    }
    return ok / s.length > 0.8;
  };

  const show = (raw: string) => {
    const t = decode(raw);
    // Spaces are kept: a PDF that draws one glyph per operation relies on them
    // to separate words once the run is reassembled below.
    if (t && readable(t)) {
      items.push({ y: Math.round(ly * 10) / 10, x: Math.round(lx * 10) / 10, t, size });
    }
  };

  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  while (i < content.length) {
    const c = content[i];

    if (isSpace(c)) { i++; continue; }
    if (c === "%") { while (i < content.length && content[i] !== "\n") i++; continue; }
    if (c === "(") { operands.push(readLiteral()); continue; }
    if (c === "<" && content[i + 1] !== "<") { operands.push(readHex()); continue; }
    if (c === "<" && content[i + 1] === "<") { i += 2; continue; }   // dictionaries carry no text
    if (c === ">" && content[i + 1] === ">") { i += 2; continue; }
    if (c === "[") { operands.push("["); i++; continue; }
    if (c === "]") {
      // Collect the array back off the stack for TJ.
      const arr: any[] = [];
      while (operands.length && operands[operands.length - 1] !== "[") arr.unshift(operands.pop());
      if (operands.length) operands.pop();
      operands.push(arr);
      i++;
      continue;
    }
    if (c === "/") {
      i++;
      let nm = "";
      while (i < content.length && !isSpace(content[i]) && !isDelim(content[i])) nm += content[i++];
      lastName = nm;
      operands.push(null);   // a name is never text we want
      continue;
    }

    // Number or operator.
    let tok = "";
    while (i < content.length && !isSpace(content[i]) && !isDelim(content[i])) tok += content[i++];
    if (!tok) { i++; continue; }

    if (/^[-+.\d]/.test(tok)) {
      const v = parseFloat(tok);
      operands.push(Number.isFinite(v) ? v : null);
      continue;
    }

    switch (tok) {
      case "BT": lx = 0; ly = 0; break;
      case "Tf": {
        font = lastName;
        const sz = num(operands[operands.length - 1]);
        if (sz) size = Math.abs(sz);
        break;
      }
      case "Tm": {
        const f = num(operands[operands.length - 1]);
        const e = num(operands[operands.length - 2]);
        lx = e; ly = f;
        break;
      }
      case "TD":
        leading = -num(operands[operands.length - 1]);
        lx += num(operands[operands.length - 2]);
        ly += num(operands[operands.length - 1]);
        break;
      case "Td":
        lx += num(operands[operands.length - 2]);
        ly += num(operands[operands.length - 1]);
        break;
      case "TL": leading = num(operands[operands.length - 1]); break;
      case "T*": ly -= leading; break;
      case "Tj": show(String(operands[operands.length - 1] ?? "")); break;
      case "'":
        ly -= leading;
        show(String(operands[operands.length - 1] ?? ""));
        break;
      case "\"":
        ly -= leading;
        show(String(operands[operands.length - 1] ?? ""));
        break;
      case "TJ": {
        const arr = operands[operands.length - 1];
        if (Array.isArray(arr)) show(arr.filter((p) => typeof p === "string").join(""));
        break;
      }
    }
    operands.length = 0;
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
      // Some writers draw one glyph per operation, so a row arrives as a
      // hundred single letters. Rejoin neighbours into runs, and keep the
      // break where the gap is wide enough to be a real column — measured on
      // a live report, letters sat under 1.6x the font size apart while
      // columns were never closer than 3x. The gap is measured against the
      // previous glyph, not the start of the run: against the start it grows
      // with the run and chops every word into five-letter pieces.
      const runs: { x: number; lastX: number; t: string }[] = [];
      for (const cell of cells) {
        const prev = runs[runs.length - 1];
        const gap = prev ? cell.x - prev.lastX : Infinity;
        if (prev && gap <= Math.max(2 * cell.size, 4)) {
          prev.t += cell.t;
          prev.lastX = cell.x;
        } else {
          runs.push({ x: cell.x, lastX: cell.x, t: cell.t });
        }
      }
      const kept = runs.map((r) => ({ x: r.x, t: r.t.trim() })).filter((r) => r.t);
      if (!kept.length) return "";
      return `y=${yy} | ` + kept.map((r) => `x=${Math.round(r.x)} "${r.t}"`).join(" | ");
    })
    .filter((l) => l)
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
  const fonts = await buildFontMaps(pdf, s);

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
    // A stream that will not inflate is not necessarily an image. PDFs may
    // carry their content streams uncompressed, and skipping those made a
    // perfectly good text layer look exactly like a scan. Try the raw bytes,
    // but only accept them as text — a JPEG that happens to contain the bytes
    // "Tj" would otherwise be parsed into nonsense rows.
    let content: string;
    if (out) {
      content = latin1(out);
    } else {
      const raw = latin1(pdf.subarray(start, dataEnd));
      if (!looksLikeText(raw)) continue;
      content = raw;
    }
    if (!content.includes("Tj") && !content.includes("TJ")) continue;
    const rows = positionalRows(content, fonts);
    if (rows.trim()) pages.push(rows);
  }

  return pages;
}

// Content streams are ASCII operators and parenthesised strings. Image and
// font data is not. Sampling the head is enough to tell them apart.
function looksLikeText(s: string): boolean {
  const n = Math.min(s.length, 2048);
  if (n === 0) return false;
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
  }
  return printable / n > 0.9;
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
async function callGemini(userParts: any[], label: string, deadline: number): Promise<Extraction> {
  // Up to three attempts on a rate limit, backing off between them. Firing a
  // whole form's worth of calls at once trips Gemini's limit: eleven at once
  // lost three groups outright and silently dropped six students from a
  // twenty-one student form. A throttled call is worth waiting for.
  //
  // Every attempt is bounded by the caller's deadline rather than a flat 90s.
  // The gateway hangs up at 150s regardless, so a call that would run past
  // that is already lost — better to give up while there is still time to
  // return the pages that did come back.
  const BACKOFF = [1500, 4000, 8000];
  for (let attempt = 0; ; attempt++) {
    const budget = Math.min(90_000, deadline - Date.now());
    if (budget < 5_000) throw new Error(`Ran out of time before reading ${label}.`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
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
      if (res.status === 429) {
        const wait = BACKOFF[attempt];
        // Google names the quota it refused on. Without this the logs only ever
        // said "rate_limited", and that missing detail is why this was chased
        // for hours as a burst problem when the real answer was a daily cap:
        //   generate_requests_per_model_per_day, limit: 250
        const detail = await res.text().catch(() => "");
        console.error(`extract-reports ${label}: 429 ${detail.slice(0, 400)}`);
        // A per-day quota will not clear in eight seconds. Retrying it three
        // times for every group spent a minute rediscovering what the first
        // response already said, so stop the whole run at the first one.
        if (/per_day|requests_per_model_per_day|PerDay/i.test(detail)) {
          throw new Error("daily_quota");
        }
        if (wait !== undefined && deadline - Date.now() > wait + 15_000) {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error("rate_limited");
      }
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
      if ((e as Error).name === "AbortError") throw new Error(`Timed out reading ${label}.`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

// The extraction itself, run as a background task rather than inside the
// request. Groups go out two at a time over several minutes: comfortably
// under Gemini's per-minute quota, which is what was rejecting calls when a
// whole form went out at once, and nowhere near any timeout.
async function runExtraction(
  jobId: string,
  userId: string,
  pages: string[],
  fileBase64: string,
  mimeType: string | undefined,
  deadline: number,
) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const patch = (fields: Record<string, unknown>) =>
    admin.from("report_imports").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", jobId);

  const t0 = Date.now();
  try {
    let year = "", form = "", terms: string[] = [], students: any[] = [];
    const usages: any[] = [];
    const failedPages: string[] = [];

    if (pages.length > 0) {
      const GROUP = 3;
      const groups: { from: number; text: string }[] = [];
      for (let i = 0; i < pages.length; i += GROUP) {
        groups.push({
          from: i,
          text: pages.slice(i, i + GROUP).map((p, j) => `--- PAGE ${i + j + 1} ---\n${p}`).join("\n\n"),
        });
      }

      // Two at a time. Seven calls spread over roughly three minutes is about
      // two requests a minute, which passes a tight quota; eleven at once did
      // not, and no amount of backing off inside the same minute fixed it.
      const CONCURRENCY = 2;
      const results: Extraction[] = new Array(groups.length);
      let done = 0;
      let dailyQuota = false;

      for (let i = 0; i < groups.length && !dailyQuota; i += CONCURRENCY) {
        const wave = groups.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(wave.map((g) =>
          callGemini(
            [{
              text: `Extract every student page below. Each line is one horizontal row of a page; every cell carries its exact x coordinate. Use those x coordinates to decide which term/column each number belongs to. A row with fewer numbers than the full set means some cells are genuinely blank — return "" for those and never shift a value across.\n\n${g.text}`,
            }],
            `pages ${g.from + 1}-${Math.min(g.from + GROUP, pages.length)}`,
            deadline,
          ),
        ));
        settled.forEach((res, k) => {
          const g = wave[k];
          const label = `${g.from + 1}-${Math.min(g.from + GROUP, pages.length)}`;
          if (res.status === "fulfilled") results[i + k] = res.value;
          else {
            const msg = res.reason?.message ?? String(res.reason);
            // The day's AI budget is gone; the remaining groups would all fail
            // the same way. Stop and say so, rather than grinding through them.
            if (msg === "daily_quota") dailyQuota = true;
            failedPages.push(label);
            console.error(`extract-reports: group pages ${label} failed:`, msg);
          }
          done += Math.min(GROUP, pages.length - g.from);
        });
        await patch({ done_pages: done });
      }

      if (dailyQuota) {
        await patch({
          status: "failed",
          error: "The daily AI limit for this account has been reached, so the report could not be read. Nothing has been imported. The limit resets each day — or raise it by enabling billing on the Google AI API key.",
        });
        return;
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
      const r = await callGemini(
        [
          { text: "Extract every student page from this term report. Align each number to its column by its position on the page, and return \"\" for any cell that is blank." },
          { inline_data: { mime_type: mimeType ?? "application/pdf", data: fileBase64 } },
        ],
        "whole document",
        deadline,
      );
      year = r.year ?? ""; form = r.form ?? ""; terms = r.terms ?? []; students = r.students ?? [];
      if ((r as any).__usage) usages.push((r as any).__usage);
    }

    console.log(`extract-reports: ${students.length} students in ${Date.now() - t0}ms`);

    // Usage is logged for whatever was actually spent, including on a run that
    // ends up failing — those calls were still made and still cost money.
    await logUsage({
      userId,
      functionName: "extract-reports",
      model: "google/gemini-3.1-pro-preview",
      units: students.length,
      usage: {
        prompt_tokens: usages.reduce((s, u) => s + (u?.promptTokenCount ?? 0), 0),
        completion_tokens: usages.reduce((s, u) => s + (u?.candidatesTokenCount ?? 0), 0),
      },
      metadata: { students: students.length, pages: pages.length, calls: usages.length, positional_layer: pages.length > 0, failed: failedPages.length },
    });

    // All or nothing. A class built from a marksheet quietly missing nine
    // children is worse than an import the teacher has to run again, and the
    // comments generated from it would be wrong in a way nobody would catch.
    if (failedPages.length) {
      await patch({
        status: "failed",
        error: `Could not read pages ${failedPages.join(", ")} of ${pages.length}. Nothing has been imported — please try again.`,
      });
      return;
    }
    if (!students.length) {
      await patch({ status: "failed", error: "No student reports were found in that PDF." });
      return;
    }

    await patch({
      status: "done",
      done_pages: pages.length,
      result: { year, form, terms, students, positional_layer: pages.length > 0 },
    });
  } catch (e) {
    console.error("extract-reports: job failed", e);
    await patch({ status: "failed", error: e instanceof Error ? e.message : "Extraction failed" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Reported back on failure so a browser-side error says how far it got.
  let stage = "start";
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
    // A Pro project keeps a worker alive for 400s, against the 150s a request
    // gets. Parsing happens here — it takes under a second — and the Gemini
    // calls happen after the response has gone, where that budget applies.
    const deadline = t0 + 380_000;
    stage = "decode_base64";
    const pdfBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    console.log(`extract-reports: received ${(pdfBytes.length / 1048576).toFixed(2)}MB PDF (${(fileBase64.length / 1048576).toFixed(2)}MB as base64)`);

    let pages: string[] = [];
    let layerError: string | null = null;
    stage = "parse_text_layer";
    try {
      pages = await positionalPages(pdfBytes);
    } catch (e) {
      // Do NOT quietly drop to the vision path here. That path sends the whole
      // PDF in one call, which is the slow shape this function was rewritten to
      // avoid — swallowing the error would silently restore it.
      layerError = e instanceof Error ? e.message : String(e);
      console.error("extract-reports: positional text layer threw", layerError);
    }
    console.log(`extract-reports: ${pages.length} text-layer pages in ${Date.now() - t0}ms${layerError ? ` (layer error: ${layerError})` : ""}`);

    if (layerError) {
      return new Response(
        JSON.stringify({ error: `Could not read the PDF's text layer: ${layerError}`, stage: "positional_text_layer" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // A genuinely scanned PDF needs the whole file in one vision call. Refuse a
    // big one up front rather than starting a job that cannot finish.
    //
    // Do NOT tell them to split it. Size is the symptom, not the cause: the
    // reports that work carry a text layer and the ones that land here do not,
    // which is what a scan or an image export looks like. Splitting a scan in
    // half just produces two scans.
    const MAX_VISION_BYTES = 1_500_000;
    if (pages.length === 0 && pdfBytes.length > MAX_VISION_BYTES) {
      return new Response(
        JSON.stringify({
          error: `This PDF has no text in it — it looks like a scan or an image export (${(pdfBytes.length / 1048576).toFixed(1)}MB), and at that size it cannot be read as pictures in one pass. Download the report straight from your school's system as a PDF rather than scanning or printing it to image, and upload that. A text PDF of a whole form is usually well under 1MB.`,
          stage: "no_text_layer",
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    stage = "create_job";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: job, error: jobError } = await admin
      .from("report_imports")
      .insert({ teacher_id: user.id, status: "running", total_pages: pages.length, done_pages: 0 })
      .select("id")
      .single();
    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: `Could not start the import: ${jobError?.message ?? "unknown"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Hand the work to the worker and answer straight away. waitUntil keeps the
    // isolate alive until this settles, which is the whole point: the browser
    // is no longer holding a connection open while Gemini works.
    EdgeRuntime.waitUntil(runExtraction(job.id, user.id, pages, fileBase64, mimeType, deadline));

    return new Response(
      JSON.stringify({ job_id: job.id, total_pages: pages.length, positional_layer: pages.length > 0 }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(
      JSON.stringify({ error: msg, stage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
