import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, X, Plus, ArrowLeft, ClipboardPaste, ImageIcon, Camera, FileText } from "lucide-react";
import { toast } from "sonner";
import ImageCropDialog from "@/components/ImageCropDialog";
import { useBuyCredits, handleInsufficientCredits } from "@/components/BuyCreditsDialog";

const TERMS = ["2026 Term 1", "2026 Term 2", "2026 Term 3", "2026 Term 4"];

type ExtractedMark = { term: string; student_mark: string; form_average: string };
type ExtractedSubject = { name: string; marks: ExtractedMark[] };
type TermAverage = { term: string; average: string };
type StudentReport = {
  name: string;
  term_averages?: TermAverage[];
  days_absent?: string;
  promotion_result?: string;
  extracurricular?: string;
  subjects: ExtractedSubject[];
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const fileToText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(file);
  });

const num = (s: string | undefined | null): number | null => {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().replace(/[%,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// "Term 3" + year 2026 -> "2026 Term 3", falling back to the raw label when the
// report doesn't line up with the terms the app knows about.
const normaliseTerm = (label: string, year: string): string => {
  const m = String(label).match(/(\d)/);
  const y = String(year).match(/(20\d{2})/)?.[1];
  if (m && y) {
    const candidate = `${y} Term ${m[1]}`;
    if (TERMS.includes(candidate)) return candidate;
    return candidate;
  }
  return label;
};

export default function NewClass() {
  const navigate = useNavigate();
  const { openBuyCredits } = useBuyCredits();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [yearGrade, setYearGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [isRegistration, setIsRegistration] = useState(false);

  const [pasted, setPasted] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [genders, setGenders] = useState<("male" | "female" | null)[]>([]);
  // Parallel to `names` — carries the imported marksheet for that student, or
  // null when they came from a plain roster. Kept in step with every edit below.
  const [reports, setReports] = useState<(StudentReport | null)[]>([]);
  const [reportYear, setReportYear] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  const addNames = (extracted: string[]) => {
    setNames((prev) => [...prev, ...extracted]);
    setGenders((prev) => [...prev, ...extracted.map(() => null)]);
    setReports((prev) => [...prev, ...extracted.map(() => null)]);
  };

  // An in-flight import lives only in component state, so leaving the page
  // throws the work away. Warn rather than let it vanish silently.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // Listen for paste anywhere on the page while on step 1
  useEffect(() => {
    if (step !== 1) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        const hasImage = Array.from(e.clipboardData?.items ?? []).some((it) => it.type.startsWith("image/"));
        if (!hasImage) return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            toast.success("Screenshot pasted — extracting names…");
            handleFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const pasteFromClipboard = async () => {
    try {
      // @ts-ignore
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t: string) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const file = new File([blob], "pasted.png", { type: imgType });
          toast.success("Screenshot pasted — extracting names…");
          handleFile(file);
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setPasted(text);
        toast.info("Text pasted — click Extract names");
      } else {
        toast.error("No image or text found in clipboard");
      }
    } catch {
      toast.error("Couldn't read clipboard. Try Ctrl/Cmd+V instead.");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf" && isRegistration) handleReportPdf(file);
    else handleFile(file);
  };

  // Registration classes only: pull the whole form's marksheet out of a school
  // MIS term report (one page per student).
  const handleReportPdf = async (file: File) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-reports", {
        body: { fileBase64: await fileToBase64(file), mimeType: file.type || "application/pdf" },
      });
      if (handleInsufficientCredits({ data, error }, openBuyCredits)) return;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const students: StudentReport[] = data?.students ?? [];
      if (students.length === 0) {
        toast.error("No student reports found in that PDF.");
        return;
      }
      if (!data?.positional_layer) {
        toast.warning("That PDF had no readable text layer, so marks were read from the page image. Check the marksheet carefully after creating.");
      }
      setReportYear(String(data?.year ?? ""));
      setNames((p) => [...p, ...students.map((s) => s.name)]);
      setGenders((p) => [...p, ...students.map(() => null)]);
      setReports((p) => [...p, ...students]);
      if (!name.trim() && data?.form) setName(String(data.form));
      setStep(2);

      const subjectCount = new Set(students.flatMap((s) => s.subjects.map((x) => x.name))).size;
      toast.success(`Found ${students.length} students and ${subjectCount} subjects`);
    } catch (e: any) {
      // supabase-js reports a timed-out or crashed function as a send failure,
      // which tells the teacher nothing useful on its own.
      const raw = String(e?.message ?? "");
      toast.error(
        /failed to send|fetch/i.test(raw)
          ? "The report couldn't be processed — it may be too large. Try splitting it into two smaller PDFs."
          : raw || "Could not read that report",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type === "application/pdf") {
      if (isRegistration) return handleReportPdf(file);
      toast.info("PDF reports are only imported for registration classes. Tick “This is a registration class” first.");
      return;
    }
    setBusy(true);
    try {
      let body: any = {};
      if (file.type.startsWith("image/")) {
        body = { imageBase64: await fileToBase64(file), mimeType: file.type };
      } else if (file.name.match(/\.(csv|txt|tsv)$/i) || file.type.startsWith("text/")) {
        body = { text: await fileToText(file) };
      } else {
        toast.info("For Excel/Word files, paste content into the text box for now.");
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("extract-roster", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const extracted: string[] = data?.names ?? [];
      if (extracted.length === 0) {
        toast.error("No names detected. Try pasting text or use a clearer image.");
      } else {
        addNames(extracted);
        setStep(2);
        toast.success(`Found ${extracted.length} names`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed");
    } finally {
      setBusy(false);
    }
  };

  const extractFromText = async () => {
    if (!pasted.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-roster", { body: { text: pasted } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const extracted: string[] = data?.names ?? [];
      addNames(extracted);
      setPasted("");
      if (extracted.length) {
        setStep(2);
        toast.success(`Found ${extracted.length} names`);
      } else toast.error("No names detected.");
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed");
    } finally {
      setBusy(false);
    }
  };

  // Summary rows and page furniture that must never become a marksheet column,
  // in case they slip through the extractor.
  const NOT_A_SUBJECT = /^(total|average\s*%?|promotion result|days absent|extra-?curricular|form teacher|head|curriculum|report)\b/i;

  // Union of every (subject, term) pair across all imported students — students
  // don't all take the same subjects, so each becomes one marksheet column.
  const buildMarksheet = () => {
    const cols = new Map<string, { subject: string; term: string; classAverage: number | null; hasMark: boolean }>();
    reports.forEach((r) => {
      r?.subjects?.forEach((sub) => {
        const subjectName = (sub.name ?? "").trim();
        if (!subjectName || NOT_A_SUBJECT.test(subjectName)) return;
        sub.marks?.forEach((mk) => {
          const term = normaliseTerm(mk.term, reportYear);
          const key = `${subjectName}||${term}`;
          const existing = cols.get(key);
          const avg = num(mk.form_average);
          const hasMark = num(mk.student_mark) !== null;
          if (!existing) cols.set(key, { subject: subjectName, term, classAverage: avg, hasMark });
          else {
            if (existing.classAverage === null && avg !== null) existing.classAverage = avg;
            if (hasMark) existing.hasMark = true;
          }
        });
      });
    });
    // A column with no mark for anyone and no form average carries nothing —
    // usually a non-subject line that was misread as one. Drop it rather than
    // leave an empty column in the teacher's marksheet.
    Array.from(cols.entries()).forEach(([key, c]) => {
      if (!c.hasMark && c.classAverage === null) cols.delete(key);
    });
    // Order by term, then by first appearance of the subject in the report.
    const subjectOrder: string[] = [];
    reports.forEach((r) => r?.subjects?.forEach((s) => {
      const n = (s.name ?? "").trim();
      if (n && !subjectOrder.includes(n)) subjectOrder.push(n);
    }));
    return Array.from(cols.values()).sort((a, b) => {
      if (a.term !== b.term) return a.term.localeCompare(b.term);
      return subjectOrder.indexOf(a.subject) - subjectOrder.indexOf(b.subject);
    });
  };

  const marksheetCols = isRegistration ? buildMarksheet() : [];
  const importedCount = reports.filter(Boolean).length;

  const create = async () => {
    if (!name.trim()) {
      toast.error("Please give the class a name");
      return;
    }
    if (names.length === 0) {
      toast.error("Add at least one student");
      return;
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const teacherId = u.user!.id;

      const cols = isRegistration ? buildMarksheet() : [];
      // Land a registration class on the most recent term the report covers, so
      // the class opens showing the term the teacher is actually writing about.
      const latestTerm = cols.length ? cols.map((c) => c.term).sort().slice(-1)[0] : null;

      const { data: cls, error } = await supabase
        .from("classes")
        .insert({
          teacher_id: teacherId,
          name,
          year_grade: yearGrade || null,
          subject: subject || null,
          is_registration: isRegistration,
          active_term: latestTerm ?? "2026 Term 1",
        } as never)
        .select()
        .single();
      if (error) throw error;

      const rows = names.map((n, i) => {
        const rep = reports[i];
        return {
          class_id: cls.id,
          teacher_id: teacherId,
          name: n,
          position: i,
          overrides: genders[i] ? { gender: genders[i] } : {},
          days_absent: rep ? num(rep.days_absent) : null,
          extracurricular: rep?.extracurricular?.trim() || null,
          // The school's own printed average per term, keyed by the app's term
          // label. Deliberately not recomputed from the subject marks.
          term_averages: (rep?.term_averages ?? []).reduce((acc, ta) => {
            const v = num(ta.average);
            if (v !== null) acc[normaliseTerm(ta.term, reportYear)] = v;
            return acc;
          }, {} as Record<string, number>),
        };
      });
      const { data: createdStudents, error: sErr } = await supabase
        .from("students")
        .insert(rows as never)
        .select("id, position");
      if (sErr) throw sErr;

      if (cols.length && createdStudents?.length) {
        const byPosition = new Map<number, string>();
        createdStudents.forEach((s: any) => byPosition.set(s.position, s.id));

        const { data: createdAssessments, error: aErr } = await supabase
          .from("assessments")
          .insert(cols.map((c, i) => ({
            class_id: cls.id,
            teacher_id: teacherId,
            name: c.subject,
            description: c.subject,
            term: c.term,
            max_marks: 100,
            weight: 1,
            position: i,
            class_average: c.classAverage,
          })))
          .select("id, name, term");
        if (aErr) throw aErr;

        const assessmentId = new Map<string, string>();
        (createdAssessments ?? []).forEach((a: any) => assessmentId.set(`${a.name}||${a.term}`, a.id));

        const markRows: any[] = [];
        reports.forEach((rep, i) => {
          if (!rep) return;
          const studentId = byPosition.get(i);
          if (!studentId) return;
          rep.subjects?.forEach((sub) => {
            sub.marks?.forEach((mk) => {
              const raw = num(mk.student_mark);
              if (raw === null) return; // blank cell stays blank — never a zero
              const aid = assessmentId.get(`${(sub.name ?? "").trim()}||${normaliseTerm(mk.term, reportYear)}`);
              if (!aid) return;
              markRows.push({
                assessment_id: aid,
                student_id: studentId,
                teacher_id: teacherId,
                raw_mark: raw,
                status: "graded",
              });
            });
          });
        });

        for (let i = 0; i < markRows.length; i += 500) {
          const { error: mErr } = await supabase.from("assessment_marks").insert(markRows.slice(i, i + 500));
          if (mErr) throw mErr;
        }
      }

      toast.success(isRegistration && cols.length ? "Registration class created with marksheet" : "Class created");
      navigate(`/classes/${cls.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back
      </Button>
      <h1 className="font-display text-4xl mb-8">New class</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4 h-fit">
          <h2 className="font-display text-xl">Class details</h2>
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input id="name" placeholder="e.g. Year 6 Blue" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="grade">Year / grade</Label>
            <Input id="grade" placeholder="Year 6" value={yearGrade} onChange={(e) => setYearGrade(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="subject">Subject (optional)</Label>
            <Input id="subject" placeholder="English" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-border bg-card/50 p-3">
            <Checkbox
              checked={isRegistration}
              onCheckedChange={(v) => setIsRegistration(!!v)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">This is a registration class</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Also called a form or home group. Comments cover the whole child across every
                subject, and you can import the full marksheet from a school report PDF.
              </span>
            </span>
          </label>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-display text-xl">Roster</h2>
          {step === 1 ? (
            <>
              {isRegistration && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Import from a term report PDF</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Upload the report your school's system produces for the whole form (one page
                        per student). We'll pull out every student, every subject and their marks for
                        each term, and build the marksheet for you.
                      </p>
                    </div>
                  </div>
                  <label className="block">
                    <Button type="button" variant="default" size="sm" disabled={busy} asChild>
                      <span>
                        {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                        {busy ? "Reading report…" : "Upload report PDF"}
                      </span>
                    </Button>
                    {busy && (
                      <p className="text-xs text-muted-foreground mt-2">
                        A full form takes up to a minute. Please stay on this page — you'll
                        review the students and marks before anything is created.
                      </p>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept="application/pdf,.pdf"
                      disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReportPdf(f); e.currentTarget.value = ""; }}
                    />
                  </label>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {isRegistration ? "Or build the roster by hand — " : ""}
                Snip your class list and paste it here (Ctrl/Cmd+V), drag in an image, or upload a CSV. AI extracts the names for you to review.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
              >
                {busy ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ImageIcon className="w-7 h-7 mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">Paste a screenshot</p>
                    <p className="text-xs text-muted-foreground mb-4">Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[10px]">Ctrl/Cmd + V</kbd> anywhere, or drag an image here</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <Button type="button" variant="secondary" size="sm" onClick={pasteFromClipboard}>
                        <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />Paste from clipboard
                      </Button>
                      <label>
                        <Button type="button" variant="default" size="sm" asChild>
                          <span><Camera className="w-3.5 h-3.5 mr-1.5" />Take photo</span>
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          capture="environment"
                          disabled={busy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingCrop(f); e.currentTarget.value = ""; }}
                        />
                      </label>
                      <label>
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span><Upload className="w-3.5 h-3.5 mr-1.5" />Upload file</span>
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept={isRegistration ? "image/*,.csv,.txt,.tsv,application/pdf,.pdf" : "image/*,.csv,.txt,.tsv"}
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.type.startsWith("image/")) setPendingCrop(f);
                            else handleFile(f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div className="text-center text-xs text-muted-foreground">or</div>
              <Textarea
                placeholder="Paste a list of names (one per line, or from Excel/Word)…"
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <Button variant="secondary" onClick={extractFromText} disabled={busy || !pasted.trim()} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Extract names
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Review names, fix any spelling mistakes, and set gender for accurate pronouns. {names.length} students.</p>
              {marksheetCols.length > 0 && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
                  <p className="font-medium">Marksheet ready to import</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Set(marksheetCols.map((c) => c.subject)).size} subjects across{" "}
                    {new Set(marksheetCols.map((c) => c.term)).size} terms ({marksheetCols.length} columns)
                    for {importedCount} students. Blank cells stay blank — nothing is guessed.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Check it on the Marksheet page after creating, then correct anything the import misread.
                  </p>
                </div>
              )}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {names.map((n, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={n}
                      placeholder="Student name"
                      onChange={(e) => setNames((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                    />
                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setGenders((p) => p.map((x, idx) => (idx === i ? (x === "male" ? null : "male") : x)))}
                        className={`px-2.5 py-2 text-xs font-medium transition-colors ${genders[i] === "male" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                        title="Male (he/him/his)"
                      >M</button>
                      <button
                        type="button"
                        onClick={() => setGenders((p) => p.map((x, idx) => (idx === i ? (x === "female" ? null : "female") : x)))}
                        className={`px-2.5 py-2 text-xs font-medium border-l border-input transition-colors ${genders[i] === "female" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                        title="Female (she/her/hers)"
                      >F</button>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => {
                      setNames((p) => p.filter((_, idx) => idx !== i));
                      setGenders((p) => p.filter((_, idx) => idx !== i));
                      setReports((p) => p.filter((_, idx) => idx !== i));
                    }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => {
                setNames((p) => [...p, ""]);
                setGenders((p) => [...p, null]);
                setReports((p) => [...p, null]);
              }} className="w-full">
                <Plus className="w-4 h-4 mr-1.5" />Add student
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">Add more</Button>
                <Button onClick={create} disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                  Create class
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
      <ImageCropDialog
        file={pendingCrop}
        onCancel={() => setPendingCrop(null)}
        onConfirm={(files) => { setPendingCrop(null); if (files[0]) handleFile(files[0]); }}
      />
    </AppShell>
  );
}
