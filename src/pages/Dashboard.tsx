import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, ArrowRight, Download, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type ClassRow = {
  id: string;
  name: string;
  year_grade: string | null;
  subject: string | null;
  term: string | null;
  is_registration: boolean;
  created_at: string;
  student_count?: number;
};

const INPUT_TYPE_LABEL: Record<string, string> = {
  voice: "Voice note",
  handwriting: "Handwritten (photo)",
  typed: "Typed",
  file: "File",
};

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const exportAllNotes = async () => {
    setExporting(true);
    try {
      const { data: cls, error: clsErr } = await supabase
        .from("classes")
        .select("id, name, year_grade, subject, term")
        .order("name", { ascending: true });
      if (clsErr) throw clsErr;
      if (!cls || cls.length === 0) {
        toast.error("You don't have any classes yet.");
        return;
      }

      const classIds = cls.map((c) => c.id);
      const { data: studs, error: studErr } = await supabase
        .from("students")
        .select("id, name, class_id, position")
        .in("class_id", classIds)
        .order("position", { ascending: true });
      if (studErr) throw studErr;

      const studentIds = (studs ?? []).map((s) => s.id);
      const { data: inputs, error: inputErr } = studentIds.length
        ? await supabase
            .from("student_inputs")
            .select("student_id, type, text, transcript, term, created_at")
            .in("student_id", studentIds)
            .order("created_at", { ascending: true })
        : { data: [], error: null };
      if (inputErr) throw inputErr;

      const inputsByStudent = new Map<string, typeof inputs>();
      for (const i of inputs ?? []) {
        const list = inputsByStudent.get(i.student_id) ?? [];
        list.push(i);
        inputsByStudent.set(i.student_id, list);
      }
      const studentsByClass = new Map<string, typeof studs>();
      for (const s of studs ?? []) {
        const list = studentsByClass.get(s.class_id) ?? [];
        list.push(s);
        studentsByClass.set(s.class_id, list);
      }

      const lines: string[] = [];
      lines.push("SMARTCOMMENT — ALL NOTES EXPORT");
      lines.push(`Generated: ${new Date().toLocaleString()}`);
      lines.push("");

      for (const c of cls) {
        lines.push("================================");
        lines.push(`CLASS: ${c.name}${[c.year_grade, c.subject, c.term].filter(Boolean).length ? ` (${[c.year_grade, c.subject, c.term].filter(Boolean).join(" · ")})` : ""}`);
        lines.push("================================");
        lines.push("");

        const classStudents = studentsByClass.get(c.id) ?? [];
        if (classStudents.length === 0) {
          lines.push("(no students in this class)");
          lines.push("");
          continue;
        }

        for (const s of classStudents) {
          lines.push(`--- ${s.name} ---`);
          const studentInputs = inputsByStudent.get(s.id) ?? [];
          if (studentInputs.length === 0) {
            lines.push("(no notes)");
          } else {
            for (const i of studentInputs) {
              const body = i.transcript || i.text || "";
              const date = new Date(i.created_at).toLocaleDateString();
              const typeLabel = INPUT_TYPE_LABEL[i.type] ?? i.type;
              lines.push(`[${typeLabel}${i.term ? ` · ${i.term}` : ""} · ${date}]`);
              lines.push(body);
              lines.push("");
            }
          }
          lines.push("");
        }
      }

      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartcomment-all-notes-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message ?? "Could not export notes");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: cls } = await supabase
        .from("classes")
        .select("id, name, year_grade, subject, term, is_registration, created_at")
        .order("created_at", { ascending: false }) as { data: any[] | null };
      const ids = (cls ?? []).map((c) => c.id);
      let counts: Record<string, number> = {};
      if (ids.length) {
        const { data: studs } = await supabase
          .from("students")
          .select("class_id")
          .in("class_id", ids);
        counts = (studs ?? []).reduce<Record<string, number>>((acc, s) => {
          acc[s.class_id] = (acc[s.class_id] || 0) + 1;
          return acc;
        }, {});
      }
      setClasses((cls ?? []).map((c) => ({ ...c, student_count: counts[c.id] || 0 })));
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl mb-2">Your classes</h1>
          <p className="text-muted-foreground">
            Capture notes throughout the term, then generate report comments at the end.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={exportAllNotes} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
            {exporting ? "Exporting…" : "Export all notes"}
          </Button>
          <Button asChild size="lg">
            <Link to="/classes/new"><Plus className="w-4 h-4 mr-1.5" />New class</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : classes.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-warm border-dashed">
          <h2 className="font-display text-2xl mb-2">No classes yet</h2>
          <p className="text-muted-foreground mb-6">
            Start by uploading a roster — a screenshot, Excel, CSV, or Word file works.
          </p>
          <Button asChild size="lg">
            <Link to="/classes/new"><Plus className="w-4 h-4 mr-1.5" />Create your first class</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`}>
              <Card className="p-5 h-full hover:shadow-elevated transition-shadow group cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-xl leading-tight">{c.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {[c.year_grade, c.subject, c.term].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {c.is_registration && (
                      <span className="inline-block mt-1.5 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
                        Registration
                      </span>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {c.student_count} {c.student_count === 1 ? "student" : "students"}
                  </span>
                  <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
