import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, Plus, Settings, Sparkles, Loader2, Trash2, Pencil, Check, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const TERMS = ["2026 Term 1", "2026 Term 2", "2026 Term 3", "2026 Term 4"] as const;

type Klass = { id: string; name: string; year_grade: string | null; subject: string | null; term: string | null; active_term: string | null; requirements: any };
type Student = { id: string; name: string; position: number; overrides: any; included_terms: string[] };

export default function ClassView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [klass, setKlass] = useState<Klass | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [notesByStudent, setNotesByStudent] = useState<Record<string, { term: string; body: string }[]>>({});
  const [newStudent, setNewStudent] = useState("");
  const [reqs, setReqs] = useState<any>({});
  const [savingReqs, setSavingReqs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [includeMarks, setIncludeMarks] = useState(false);
  const [markTerms, setMarkTerms] = useState<string[]>([...TERMS]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("classes").select("*").eq("id", id).single();
      setKlass(c);
      setReqs(c?.requirements ?? {});
      const { data: s } = await supabase.from("students").select("id, name, position, overrides, included_terms").eq("class_id", id).order("position");
      setStudents((s ?? []) as Student[]);
      const ids = (s ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: ins } = await supabase.from("student_inputs").select("student_id, text, transcript, term").in("student_id", ids);
        const grouped: Record<string, { term: string; body: string }[]> = {};
        (ins ?? []).forEach((i: any) => {
          const body = (i.transcript || i.text || "").trim();
          if (!body) return;
          (grouped[i.student_id] ||= []).push({ term: i.term || "2026 Term 2", body });
        });
        setNotesByStudent(grouped);
      }
    })();
  }, [id]);

  const setActiveTerm = async (term: string) => {
    if (!klass) return;
    setKlass({ ...klass, active_term: term });
    const { error } = await supabase.from("classes").update({ active_term: term }).eq("id", klass.id);
    if (error) toast.error(error.message);
  };

  const toggleClassIncludedTerm = async (term: string, on: boolean) => {
    if (!klass || students.length === 0) return;
    const next = on
      ? Array.from(new Set([...(students[0].included_terms || []), term]))
      : (students[0].included_terms || []).filter((t) => t !== term);
    setStudents((p) => p.map((s) => ({ ...s, included_terms: next })));
    const { error } = await supabase.from("students").update({ included_terms: next }).eq("class_id", klass.id);
    if (error) toast.error(error.message);
  };

  const addStudent = async () => {
    if (!newStudent.trim() || !klass) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("students")
      .insert({ class_id: klass.id, teacher_id: u.user!.id, name: newStudent.trim(), position: students.length })
      .select("id, name, position, overrides, included_terms")
      .single();
    if (error) { toast.error(error.message); return; }
    setStudents((p) => [...p, data as Student]);
    setNewStudent("");
  };

  const updateStudentName = async (sid: string, name: string) => {
    setStudents((p) => p.map((s) => (s.id === sid ? { ...s, name } : s)));
  };

  const commitStudentName = async (sid: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("students").update({ name: trimmed }).eq("id", sid);
    if (error) toast.error(error.message);
  };

  const setStudentGender = async (sid: string, gender: "male" | "female" | null) => {
    const student = students.find((s) => s.id === sid);
    if (!student) return;
    const newOverrides = { ...(student.overrides || {}) };
    if (gender === null) delete newOverrides.gender;
    else newOverrides.gender = gender;
    setStudents((p) => p.map((s) => (s.id === sid ? { ...s, overrides: newOverrides } : s)));
    const { error } = await supabase.from("students").update({ overrides: newOverrides }).eq("id", sid);
    if (error) toast.error(error.message);
  };

  const cycleGender = (sid: string) => {
    const s = students.find((x) => x.id === sid);
    const cur = s?.overrides?.gender;
    const next = cur === "male" ? "female" : cur === "female" ? null : "male";
    setStudentGender(sid, next as any);
  };

  const deleteStudent = async (sid: string) => {
    if (!confirm("Remove this student and all their notes?")) return;
    const { error } = await supabase.from("students").delete().eq("id", sid);
    if (error) { toast.error(error.message); return; }
    setStudents((p) => p.filter((s) => s.id !== sid));
  };

  const saveReqs = async () => {
    if (!klass) return;
    setSavingReqs(true);
    const { error } = await supabase.from("classes").update({ requirements: reqs }).eq("id", klass.id);
    setSavingReqs(false);
    if (error) toast.error(error.message);
    else toast.success("Requirements saved");
  };

  const generateAll = async () => {
    if (students.length === 0) { toast.error("No students to generate for"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-comments", {
        body: { studentIds: students.map((s) => s.id), includeMarks, markTerms: includeMarks ? markTerms : [] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Generated comments for the whole class");
      navigate(`/classes/${klass!.id}/review`);
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const deleteClass = async () => {
    if (!klass) return;
    if (!confirm(`Delete "${klass.name}" and all its data? This cannot be undone.`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", klass.id);
    if (error) { toast.error(error.message); return; }
    navigate("/");
  };

  const assessCoverage = (text: string) => {
    const t = (text || "").toLowerCase();
    const checks = [
      { key: "strength", label: "a strength or area of praise", patterns: [/strength/, /excel/, /strong/, /good at/, /talent/, /achiev/, /improv/, /well done/, /praise/, /confiden/, /enthusias/, /positive/, /capable/] },
      { key: "growth", label: "an area for growth or improvement", patterns: [/growth/, /improve/, /work on/, /develop/, /weakness/, /struggle/, /challeng/, /needs to/, /focus on/, /could/, /should/, /next step/, /target/] },
      { key: "encourage", label: "encouragement or a next step for the student", patterns: [/encourag/, /keep/, /continue/, /next term/, /push/, /persever/, /aim/, /strive/, /potential/, /effort/] },
      { key: "subject", label: "subject-specific content (e.g. a topic, skill, or task they did)", patterns: [/lesson/, /class/, /test/, /assignment/, /project/, /essay/, /exam/, /homework/, /task/, /chapter/, /topic/, /unit/, /reading/, /writing/, /math/, /science/, /history/, /art/, /pe\b/, /music/, /experiment/, /presentation/, /quiz/] },
    ];
    if (!t.trim()) return { status: "none" as const, missing: checks.map((c) => c.label) };
    const missing = checks.filter((c) => !c.patterns.some((p) => p.test(t))).map((c) => c.label);
    return { status: missing.length === 0 ? ("ok" as const) : ("partial" as const), missing };
  };

  if (!klass) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />All classes
      </Button>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">{klass.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-muted-foreground">
              {[klass.year_grade, klass.subject].filter(Boolean).join(" · ") || "—"}
            </p>
            {(klass.year_grade || klass.subject) && <span className="text-muted-foreground">·</span>}
            <Select value={klass.active_term ?? undefined} onValueChange={setActiveTerm}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" asChild>
              <Link to={`/classes/${klass.id}/marksheet`}>Marksheet</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/classes/${klass.id}/review`}>Review comments <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
            </Button>
            <Button onClick={generateAll} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              Generate all
            </Button>
          </div>
          <div className="rounded-md border border-border bg-card/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Include notes from:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {TERMS.map((t) => {
                const checked = (students[0]?.included_terms ?? TERMS).includes(t);
                return (
                  <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={checked}
                      disabled={students.length === 0}
                      onCheckedChange={(v) => toggleClassIncludedTerm(t, !!v)}
                    />
                    <span>{t}</span>
                  </label>
                );
              })}
          </div>
          <div className="rounded-md border border-border bg-card/50 px-3 py-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={includeMarks} onCheckedChange={(v) => setIncludeMarks(!!v)} />
              <span className="font-medium">Include marksheet data</span>
            </label>
            {includeMarks && (
              <>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 mb-1.5">Marks from terms:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {TERMS.map((t) => {
                    const checked = markTerms.includes(t);
                    return (
                      <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setMarkTerms((p) => (v ? Array.from(new Set([...p, t])) : p.filter((x) => x !== t)))
                          }
                        />
                        <span>{t}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 max-w-[220px] leading-tight">
                  AI infers strengths and growth from marks but never mentions scores or rankings.
                </p>
              </>
            )}
          </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 max-w-[220px] leading-tight">Used when generating comments. Doesn't affect which notes are shown.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="requirements"><Settings className="w-3.5 h-3.5 mr-1.5" />Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-6">
          <p className="text-sm text-muted-foreground mb-3">
            Click the pencil to edit a student's name or set their gender (M/F). Cards are colour-coded by note coverage:
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mx-1.5 align-middle" />no notes,
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mx-1.5 align-middle" />some notes but missing key elements,
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mx-1.5 align-middle" />all key elements covered.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {students.map((s) => {
              const gender = s.overrides?.gender;
              const isEditing = editingId === s.id;
              const activeTerm = klass.active_term ?? "2026 Term 2";
              const includedText = (notesByStudent[s.id] || [])
                .filter((n) => n.term === activeTerm)
                .map((n) => n.body)
                .join("\n");
              const cov = assessCoverage(includedText);
              const cardClass =
                cov.status === "none"
                  ? "border-red-500/60 bg-red-500/5"
                  : cov.status === "partial"
                  ? "border-amber-500/60 bg-amber-500/5"
                  : "border-emerald-500/50 bg-emerald-500/5";
              return (
                <Card key={s.id} className={`p-3 hover:shadow-elevated transition-shadow group border ${cardClass}`}>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={s.name}
                        onChange={(e) => updateStudentName(s.id, e.target.value)}
                        onBlur={(e) => commitStudentName(s.id, e.target.value)}
                        autoFocus
                        className="h-9 font-display"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => cycleGender(s.id)}
                        className={
                          gender === "male"
                            ? "bg-blue-500/15 text-blue-600 border-blue-500/40 hover:bg-blue-500/25"
                            : gender === "female"
                            ? "bg-pink-500/15 text-pink-600 border-pink-500/40 hover:bg-pink-500/25"
                            : ""
                        }
                        title="Toggle gender (for pronouns)"
                      >
                        {gender === "male" ? "M" : gender === "female" ? "F" : "—"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { commitStudentName(s.id, s.name); setEditingId(null); }} title="Done">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteStudent(s.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 font-display px-1 truncate">{s.name}</div>
                      {cov.status !== "ok" && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={
                                "inline-flex items-center justify-center h-7 w-7 rounded-md " +
                                (cov.status === "none"
                                  ? "text-red-600 hover:bg-red-500/10"
                                  : "text-amber-600 hover:bg-amber-500/10")
                              }
                              title="Notes coverage warning"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 text-sm">
                            <p className="font-medium mb-1">
                              {cov.status === "none" ? "No notes saved yet" : "Consider adding…"}
                            </p>
                            {cov.status === "none" ? (
                              <p className="text-muted-foreground">Add some observations before generating a comment so it's based on real evidence.</p>
                            ) : (
                              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                {cov.missing.map((m) => <li key={m}>{m}</li>)}
                              </ul>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">You can still generate a comment — this is just a heads-up.</p>
                          </PopoverContent>
                        </Popover>
                      )}
                      <span
                        className={
                          "inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-md text-xs font-medium border " +
                          (gender === "male"
                            ? "bg-blue-500/15 text-blue-600 border-blue-500/40"
                            : gender === "female"
                            ? "bg-pink-500/15 text-pink-600 border-pink-500/40"
                            : "text-muted-foreground border-border")
                        }
                      >
                        {gender === "male" ? "M" : gender === "female" ? "F" : "—"}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => setEditingId(s.id)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 px-1">
                    <Link to={`/students/${s.id}`} className="text-xs text-primary hover:underline">
                      Open notes →
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {cov.status === "none" ? "no notes" : cov.status === "partial" ? "missing elements" : "looks complete"}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="flex gap-2 max-w-md">
            <Input placeholder="Add a student…" value={newStudent} onChange={(e) => setNewStudent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStudent()} />
            <Button onClick={addStudent}><Plus className="w-4 h-4" /></Button>
          </div>
          <div className="mt-12 pt-6 border-t border-border">
            <Button variant="ghost" size="sm" onClick={deleteClass} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-1.5" />Delete class
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="requirements" className="mt-6">
          <Card className="p-6 max-w-2xl space-y-4">
            <div>
              <Label htmlFor="tone">Tone</Label>
              <Input id="tone" placeholder="e.g. warm, professional, encouraging" value={reqs.tone || ""} onChange={(e) => setReqs({ ...reqs, tone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="structure">Required structure</Label>
              <Input id="structure" placeholder="strengths → growth areas → next steps" value={reqs.structure || ""} onChange={(e) => setReqs({ ...reqs, structure: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="min">Min words</Label>
                <Input id="min" type="number" value={reqs.minWords ?? ""} onChange={(e) => setReqs({ ...reqs, minWords: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <Label htmlFor="max">Max words</Label>
                <Input id="max" type="number" value={reqs.maxWords ?? ""} onChange={(e) => setReqs({ ...reqs, maxWords: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <Label htmlFor="chars">Max chars</Label>
                <Input id="chars" type="number" value={reqs.maxChars ?? ""} onChange={(e) => setReqs({ ...reqs, maxChars: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div>
              <Label htmlFor="pronoun">Pronoun usage</Label>
              <Input id="pronoun" placeholder="third person (he/she/they)" value={reqs.pronoun || ""} onChange={(e) => setReqs({ ...reqs, pronoun: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="banned">Banned phrases</Label>
              <Textarea id="banned" rows={2} placeholder="comma-separated" value={reqs.bannedPhrases || ""} onChange={(e) => setReqs({ ...reqs, bannedPhrases: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="must">Must include</Label>
              <Textarea id="must" rows={2} value={reqs.mustInclude || ""} onChange={(e) => setReqs({ ...reqs, mustInclude: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="notes">Other notes for the AI</Label>
              <Textarea id="notes" rows={3} value={reqs.notes || ""} onChange={(e) => setReqs({ ...reqs, notes: e.target.value })} />
            </div>
            <Button onClick={saveReqs} disabled={savingReqs}>
              {savingReqs ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Save requirements
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
