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
import { ArrowLeft, ArrowRight, Plus, Settings, Sparkles, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Klass = { id: string; name: string; year_grade: string | null; subject: string | null; term: string | null; requirements: any };
type Student = { id: string; name: string; position: number; overrides: any };

export default function ClassView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [klass, setKlass] = useState<Klass | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newStudent, setNewStudent] = useState("");
  const [reqs, setReqs] = useState<any>({});
  const [savingReqs, setSavingReqs] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("classes").select("*").eq("id", id).single();
      setKlass(c);
      setReqs(c?.requirements ?? {});
      const { data: s } = await supabase.from("students").select("id, name, position, overrides").eq("class_id", id).order("position");
      setStudents((s ?? []) as Student[]);
      const ids = (s ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: ins } = await supabase.from("student_inputs").select("student_id").in("student_id", ids);
        const cnt: Record<string, number> = {};
        (ins ?? []).forEach((i) => { cnt[i.student_id] = (cnt[i.student_id] || 0) + 1; });
        setCounts(cnt);
      }
    })();
  }, [id]);

  const addStudent = async () => {
    if (!newStudent.trim() || !klass) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("students")
      .insert({ class_id: klass.id, teacher_id: u.user!.id, name: newStudent.trim(), position: students.length })
      .select("id, name, position, overrides")
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
        body: { studentIds: students.map((s) => s.id) },
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

  if (!klass) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />All classes
      </Button>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">{klass.name}</h1>
          <p className="text-muted-foreground mt-1">
            {[klass.year_grade, klass.subject, klass.term].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/classes/${klass.id}/review`}>Review comments <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
          <Button onClick={generateAll} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            Generate all
          </Button>
        </div>
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="requirements"><Settings className="w-3.5 h-3.5 mr-1.5" />Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {students.map((s) => (
              <Card key={s.id} className="p-4 hover:shadow-elevated transition-shadow group">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/students/${s.id}`} className="flex-1">
                    <h3 className="font-display text-lg leading-tight">{s.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {counts[s.id] || 0} {(counts[s.id] || 0) === 1 ? "note" : "notes"}
                    </p>
                  </Link>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteStudent(s.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
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
