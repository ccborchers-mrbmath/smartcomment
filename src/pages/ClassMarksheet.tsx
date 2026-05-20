import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Trash2, Download, MoreVertical } from "lucide-react";
import { toast } from "sonner";

const TERMS = ["2026 Term 1", "2026 Term 2", "2026 Term 3", "2026 Term 4"] as const;

type Klass = { id: string; name: string };
type Student = { id: string; name: string; first_name: string | null; last_name: string | null };
type Assessment = {
  id: string;
  name: string;
  description: string;
  term: string | null;
  max_marks: number;
  weight: number;
  position: number;
};
type Mark = {
  id: string;
  assessment_id: string;
  student_id: string;
  raw_mark: number | null;
  status: "graded" | "absent" | "exempt";
};

type SortKey = "first" | "last";

export default function ClassMarksheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [klass, setKlass] = useState<Klass | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({}); // keyed by `${assessmentId}:${studentId}`
  const [sortBy, setSortBy] = useState<SortKey>("first");
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const markKey = (a: string, s: string) => `${a}:${s}`;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setTeacherId(u.user?.id ?? null);
      const [c, s, a] = await Promise.all([
        supabase.from("classes").select("id, name").eq("id", id).single(),
        supabase.from("students").select("id, name, first_name, last_name").eq("class_id", id),
        supabase.from("assessments").select("*").eq("class_id", id).order("position"),
      ]);
      if (c.data) setKlass(c.data as Klass);
      setStudents((s.data ?? []) as Student[]);
      setAssessments((a.data ?? []) as Assessment[]);
      const aIds = (a.data ?? []).map((x: any) => x.id);
      if (aIds.length) {
        const { data: m } = await supabase.from("assessment_marks").select("*").in("assessment_id", aIds);
        const map: Record<string, Mark> = {};
        (m ?? []).forEach((row: any) => { map[markKey(row.assessment_id, row.student_id)] = row as Mark; });
        setMarks(map);
      }
    })();
  }, [id]);

  const sortedStudents = useMemo(() => {
    const copy = [...students];
    copy.sort((a, b) => {
      const av = (sortBy === "first" ? a.first_name : a.last_name) || a.name || "";
      const bv = (sortBy === "first" ? b.first_name : b.last_name) || b.name || "";
      return av.localeCompare(bv, undefined, { sensitivity: "base" });
    });
    return copy;
  }, [students, sortBy]);

  const addAssessment = async () => {
    if (!id || !teacherId) return;
    const position = assessments.length;
    const { data, error } = await supabase
      .from("assessments")
      .insert({ class_id: id, teacher_id: teacherId, name: `Assessment ${position + 1}`, max_marks: 100, weight: 1, position, term: "2026 Term 1" })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setAssessments((p) => [...p, data as Assessment]);
  };

  const updateAssessment = async (aid: string, patch: Partial<Assessment>) => {
    setAssessments((p) => p.map((a) => (a.id === aid ? { ...a, ...patch } : a)));
  };

  const commitAssessment = async (aid: string, patch: Partial<Assessment>) => {
    const { error } = await supabase.from("assessments").update(patch).eq("id", aid);
    if (error) toast.error(error.message);
  };

  const deleteAssessment = async (aid: string) => {
    if (!confirm("Delete this assessment column and all marks in it?")) return;
    const { error } = await supabase.from("assessments").delete().eq("id", aid);
    if (error) { toast.error(error.message); return; }
    setAssessments((p) => p.filter((a) => a.id !== aid));
    setMarks((p) => {
      const n = { ...p };
      Object.keys(n).forEach((k) => { if (k.startsWith(`${aid}:`)) delete n[k]; });
      return n;
    });
  };

  const upsertMark = async (aid: string, sid: string, patch: Partial<Mark>) => {
    if (!teacherId) return;
    const key = markKey(aid, sid);
    const existing = marks[key];
    const next: Mark = {
      id: existing?.id ?? "",
      assessment_id: aid,
      student_id: sid,
      raw_mark: existing?.raw_mark ?? null,
      status: existing?.status ?? "graded",
      ...patch,
    };
    setMarks((p) => ({ ...p, [key]: next }));
    const { data, error } = await supabase
      .from("assessment_marks")
      .upsert(
        { assessment_id: aid, student_id: sid, teacher_id: teacherId, raw_mark: next.raw_mark, status: next.status },
        { onConflict: "assessment_id,student_id" }
      )
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setMarks((p) => ({ ...p, [key]: data as Mark }));
  };

  // Parse a token pasted from Excel into a Mark patch. Returns null if cell should be left untouched.
  const parsePastedToken = (tokenRaw: string): Partial<Mark> | null => {
    const t = tokenRaw.trim();
    if (t === "") return { raw_mark: null, status: "graded" }; // blank clears
    const low = t.toLowerCase();
    if (["a", "abs", "absent"].includes(low)) return { raw_mark: null, status: "absent" };
    if (["e", "ex", "exempt"].includes(low)) return { raw_mark: null, status: "exempt" };
    // Strip % and commas; accept "17/20" form
    const slash = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*\d+/);
    const cleaned = (slash ? slash[1] : t).replace(/[,%]/g, "").trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return { raw_mark: n, status: "graded" };
  };

  const handleColumnPaste = async (aid: string, startStudentId: string, text: string) => {
    // If single value with no newline/tab, let the normal input handler take it
    if (!/[\n\t]/.test(text)) return false;
    const startIdx = sortedStudents.findIndex((s) => s.id === startStudentId);
    if (startIdx < 0) return false;
    // Take first column only if user pasted a grid
    const rows = text.replace(/\r/g, "").split("\n").map((r) => r.split("\t")[0]);
    // Trim trailing blank row Excel adds
    while (rows.length && rows[rows.length - 1].trim() === "") rows.pop();
    if (rows.length === 0) return false;
    const slice = rows.slice(0, sortedStudents.length - startIdx);
    // Optimistic update first so the UI feels instant
    setMarks((prev) => {
      const next = { ...prev };
      slice.forEach((tok, i) => {
        const sid = sortedStudents[startIdx + i].id;
        const patch = parsePastedToken(tok);
        if (!patch) return;
        const existing = next[markKey(aid, sid)];
        next[markKey(aid, sid)] = {
          id: existing?.id ?? "",
          assessment_id: aid,
          student_id: sid,
          raw_mark: existing?.raw_mark ?? null,
          status: existing?.status ?? "graded",
          ...patch,
        };
      });
      return next;
    });
    // Persist sequentially (small N, keeps it simple and order-safe)
    let written = 0, skipped = 0;
    for (let i = 0; i < slice.length; i++) {
      const sid = sortedStudents[startIdx + i].id;
      const patch = parsePastedToken(slice[i]);
      if (!patch) { skipped++; continue; }
      await upsertMark(aid, sid, patch);
      written++;
    }
    toast.success(`Pasted ${written} mark${written === 1 ? "" : "s"}${skipped ? ` · ${skipped} unrecognised` : ""}`);
    return true;
  };

  const pct = (raw: number | null, max: number) => {
    if (raw === null || raw === undefined || !max) return null;
    return Math.round((raw / max) * 100);
  };

  const termTotal = (sid: string, term: string) => {
    const rel = assessments.filter((a) => a.term === term);
    let num = 0, den = 0;
    for (const a of rel) {
      const m = marks[markKey(a.id, sid)];
      if (!m || m.status !== "graded" || m.raw_mark === null || m.raw_mark === undefined) continue;
      const w = Number(a.weight) || 0;
      num += (Number(m.raw_mark) / Number(a.max_marks)) * w;
      den += w;
    }
    if (den === 0) return null;
    return Math.round((num / den) * 100);
  };

  const termsUsed = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => { if (a.term) set.add(a.term); });
    return TERMS.filter((t) => set.has(t));
  }, [assessments]);

  const downloadCsv = () => {
    if (!klass) return;
    const head: string[] = ["Surname", "First name"];
    assessments.forEach((a) => {
      head.push(`${a.name || "Assessment"} [${a.term || ""}] /${a.max_marks} w${a.weight}`);
      head.push(`${a.name || "Assessment"} %`);
    });
    termsUsed.forEach((t) => head.push(`${t} total %`));
    const rows = [head];
    for (const s of sortedStudents) {
      const row: string[] = [s.last_name || "", s.first_name || s.name];
      for (const a of assessments) {
        const m = marks[markKey(a.id, s.id)];
        if (!m) { row.push("", ""); continue; }
        if (m.status === "absent") { row.push("Absent", ""); continue; }
        if (m.status === "exempt") { row.push("Exempt", ""); continue; }
        row.push(m.raw_mark === null ? "" : String(m.raw_mark));
        const p = pct(m.raw_mark, Number(a.max_marks));
        row.push(p === null ? "" : `${p}%`);
      }
      for (const t of termsUsed) {
        const p = termTotal(s.id, t);
        row.push(p === null ? "" : `${p}%`);
      }
      rows.push(row);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${klass.name} marksheet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!klass) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate(`/classes/${klass.id}`)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back to class
      </Button>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">Marksheet</h1>
          <p className="text-muted-foreground mt-1">{klass.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort:</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first">First name</SelectItem>
                <SelectItem value="last">Surname</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={downloadCsv} disabled={assessments.length === 0}>
            <Download className="w-4 h-4 mr-1.5" />Download CSV
          </Button>
          <Button onClick={addAssessment}>
            <Plus className="w-4 h-4 mr-1.5" />Add assessment
          </Button>
        </div>
      </div>

      {assessments.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No assessments yet.</p>
          <Button onClick={addAssessment}><Plus className="w-4 h-4 mr-1.5" />Add your first assessment</Button>
        </div>
      ) : (
        <>
        <p className="text-xs text-muted-foreground mb-2">
          Tip: copy a column of marks from Excel and paste into any raw-mark cell — the values fill down from that student. Blank clears, <span className="font-medium">A</span>/<span className="font-medium">Abs</span> = absent, <span className="font-medium">E</span>/<span className="font-medium">Ex</span> = exempt.
        </p>
        <div className="overflow-x-auto border border-border rounded-lg bg-card">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="sticky left-0 z-20 bg-muted/40 border-b border-r border-border p-2 text-left min-w-[200px]">Student</th>
                {assessments.map((a) => (
                  <th key={a.id} colSpan={2} className="border-b border-r border-border p-2 align-top min-w-[260px]">
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-1">
                        <Input
                          value={a.name}
                          onChange={(e) => updateAssessment(a.id, { name: e.target.value })}
                          onBlur={(e) => commitAssessment(a.id, { name: e.target.value })}
                          placeholder="Assessment name"
                          className="h-8 font-medium"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => deleteAssessment(a.id)} title="Delete column">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      <Input
                        value={a.description}
                        onChange={(e) => updateAssessment(a.id, { description: e.target.value })}
                        onBlur={(e) => commitAssessment(a.id, { description: e.target.value })}
                        placeholder="What did it cover?"
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-1">
                        <Select value={a.term ?? undefined} onValueChange={(v) => { updateAssessment(a.id, { term: v }); commitAssessment(a.id, { term: v }); }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Term" /></SelectTrigger>
                          <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          out of
                          <Input
                            type="number"
                            value={a.max_marks}
                            onChange={(e) => updateAssessment(a.id, { max_marks: Number(e.target.value) })}
                            onBlur={(e) => commitAssessment(a.id, { max_marks: Number(e.target.value) || 0 })}
                            className="h-7 text-xs"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          weight
                          <Input
                            type="number"
                            step="0.1"
                            value={a.weight}
                            onChange={(e) => updateAssessment(a.id, { weight: Number(e.target.value) })}
                            onBlur={(e) => commitAssessment(a.id, { weight: Number(e.target.value) || 0 })}
                            className="h-7 text-xs"
                          />
                        </label>
                      </div>
                      <div className="flex text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
                        <span className="flex-1 text-center">Raw</span>
                        <span className="flex-1 text-center">%</span>
                      </div>
                    </div>
                  </th>
                ))}
                {termsUsed.map((t) => (
                  <th key={t} className="border-b border-r border-border p-2 min-w-[110px] text-center align-bottom">
                    <div className="text-xs">{t}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">weighted %</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((s) => {
                const display = sortBy === "last" && s.last_name
                  ? `${s.last_name}, ${s.first_name ?? ""}`.trim()
                  : (s.name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim());
                return (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card hover:bg-muted/20 border-b border-r border-border p-2 font-medium whitespace-nowrap">
                      {display}
                    </td>
                    {assessments.map((a) => {
                      const m = marks[markKey(a.id, s.id)];
                      const isAbsent = m?.status === "absent";
                      const isExempt = m?.status === "exempt";
                      const raw = m?.raw_mark;
                      const p = (m && m.status === "graded") ? pct(raw ?? null, Number(a.max_marks)) : null;
                      return (
                        <Fragment key={a.id}>
                          <td key={`${a.id}-raw`} className="border-b border-border p-1 w-[110px]">
                            <div className="flex items-center gap-1">
                              {isAbsent || isExempt ? (
                                <span className={`flex-1 text-xs px-2 py-1.5 rounded text-center ${isAbsent ? "bg-amber-500/15 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                                  {isAbsent ? "Absent" : "Exempt"}
                                </span>
                              ) : (
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={raw ?? ""}
                                  onPaste={async (e) => {
                                    const text = e.clipboardData.getData("text");
                                    if (/[\n\t]/.test(text)) {
                                      e.preventDefault();
                                      await handleColumnPaste(a.id, s.id, text);
                                    }
                                  }}
                                  onChange={(e) => {
                                    const str = e.target.value;
                                    const v = str === "" ? null : Number(str);
                                    setMarks((p2) => ({
                                      ...p2,
                                      [markKey(a.id, s.id)]: {
                                        id: m?.id ?? "",
                                        assessment_id: a.id,
                                        student_id: s.id,
                                        raw_mark: Number.isFinite(v as number) ? (v as number) : null,
                                        status: "graded",
                                      },
                                    }));
                                  }}
                                  onBlur={(e) => {
                                    const str = e.target.value.trim();
                                    const v = str === "" ? null : Number(str);
                                    upsertMark(a.id, s.id, { raw_mark: Number.isFinite(v as number) ? (v as number) : null, status: "graded" });
                                  }}
                                  className="h-8 text-center"
                                  placeholder="—"
                                />
                              )}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-6 shrink-0" title="Options">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1">
                                  <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted" onClick={() => upsertMark(a.id, s.id, { raw_mark: null, status: "graded" })}>Clear mark</button>
                                  <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted" onClick={() => upsertMark(a.id, s.id, { raw_mark: null, status: "absent" })}>Mark absent</button>
                                  <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted" onClick={() => upsertMark(a.id, s.id, { raw_mark: null, status: "exempt" })}>Mark exempt</button>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </td>
                          <td key={`${a.id}-pct`} className="border-b border-r border-border p-2 text-center text-muted-foreground w-[60px]">
                            {p === null ? "—" : `${p}%`}
                          </td>
                        </Fragment>
                      );
                    })}
                    {termsUsed.map((t) => {
                      const p = termTotal(s.id, t);
                      return (
                        <td key={t} className="border-b border-r border-border p-2 text-center font-medium">
                          {p === null ? "—" : `${p}%`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </AppShell>
  );
}
