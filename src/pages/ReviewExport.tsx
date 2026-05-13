import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy, Download, Loader2, Pencil, SpellCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Row = {
  student_id: string;
  student_name: string;
  comment_id: string | null;
  text: string;
  version: number;
};

export default function ReviewExport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [klass, setKlass] = useState<{ id: string; name: string; requirements: any } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [regenIds, setRegenIds] = useState<Record<string, boolean>>({});
  const [spellIds, setSpellIds] = useState<Record<string, boolean>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const load = async () => {
    if (!id) return;
    const { data: c } = await supabase.from("classes").select("id, name, requirements").eq("id", id).single();
    setKlass(c);
    const { data: students } = await supabase.from("students").select("id, name").eq("class_id", id).order("position");
    const ids = (students ?? []).map((s) => s.id);
    const { data: comments } = await supabase
      .from("generated_comments")
      .select("id, student_id, text, version")
      .in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("version", { ascending: false });
    const latestByStudent = new Map<string, any>();
    (comments ?? []).forEach((c) => { if (!latestByStudent.has(c.student_id)) latestByStudent.set(c.student_id, c); });
    const built: Row[] = (students ?? []).map((s) => {
      const c = latestByStudent.get(s.id);
      return {
        student_id: s.id,
        student_name: s.name,
        comment_id: c?.id ?? null,
        text: c?.text ?? "",
        version: c?.version ?? 0,
      };
    });
    setRows(built);
    setEdits(Object.fromEntries(built.map((r) => [r.student_id, r.text])));
  };

  useEffect(() => { load(); }, [id]);

  const saveEdit = async (sid: string, commentId: string | null) => {
    const text = edits[sid] ?? "";
    if (!commentId) return;
    const { error } = await supabase.from("generated_comments").update({ text }).eq("id", commentId);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const regen = async (sid: string) => {
    setRegenIds((p) => ({ ...p, [sid]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("generate-comments", {
        body: { studentIds: [sid] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Regenerated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setRegenIds((p) => ({ ...p, [sid]: false }));
    }
  };

  const focusEdit = (sid: string) => {
    const el = textareaRefs.current[sid];
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  };

  const spellcheck = async (sid: string, commentId: string | null, studentName: string) => {
    if (!commentId) return;
    const current = edits[sid] ?? "";
    if (!current.trim()) return;
    setSpellIds((p) => ({ ...p, [sid]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("spellcheck-comment", {
        body: { text: current, studentName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const corrected = data?.text ?? "";
      if (!corrected) throw new Error("Empty response");
      setEdits((p) => ({ ...p, [sid]: corrected }));
      const { error: upErr } = await supabase.from("generated_comments").update({ text: corrected }).eq("id", commentId);
      if (upErr) throw upErr;
      toast.success("Spelling & grammar checked");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSpellIds((p) => ({ ...p, [sid]: false }));
    }
  };

  const copyOne = (sid: string) => {
    navigator.clipboard.writeText(edits[sid] ?? "");
    toast.success("Copied");
  };

  const copyAll = () => {
    const out = rows.map((r) => `${r.student_name}\n${edits[r.student_id] ?? ""}`).join("\n\n");
    navigator.clipboard.writeText(out);
    toast.success("All comments copied");
  };

  const exportCsv = () => {
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const csv = "Name,Comment\n" + rows.map((r) => `${esc(r.student_name)},${esc(edits[r.student_id] ?? "")}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${klass?.name ?? "class"}-comments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reqs = klass?.requirements ?? {};
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

  if (!klass) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to={`/classes/${klass.id}`}><ArrowLeft className="w-4 h-4 mr-1.5" />Back to class</Link>
      </Button>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">Review comments</h1>
          <p className="text-muted-foreground mt-1">{klass.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyAll}><Copy className="w-4 h-4 mr-1.5" />Copy all</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />Export CSV</Button>
        </div>
      </div>

      {rows.every((r) => !r.comment_id) ? (
        <Card className="p-12 text-center bg-gradient-warm border-dashed">
          <h2 className="font-display text-2xl mb-2">No comments generated yet</h2>
          <p className="text-muted-foreground mb-6">Go back and click "Generate all" — or generate per student from their card.</p>
          <Button onClick={() => navigate(`/classes/${klass.id}`)}>Back to class</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const text = edits[r.student_id] ?? "";
            const wc = wordCount(text);
            const cc = text.length;
            const overWord = reqs.maxWords && wc > reqs.maxWords;
            const underWord = reqs.minWords && wc < reqs.minWords;
            const overChar = reqs.maxChars && cc > reqs.maxChars;
            return (
              <Card key={r.student_id} className="p-5">
                <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
                  <div>
                    <h3 className="font-display text-xl">{r.student_name}</h3>
                    {r.version > 0 && <p className="text-xs text-muted-foreground">v{r.version}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => regen(r.student_id)} disabled={regenIds[r.student_id]}>
                      {regenIds[r.student_id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                      Regenerate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyOne(r.student_id)}><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
                  </div>
                </div>
                {r.comment_id ? (
                  <>
                    <Textarea
                      rows={5}
                      value={text}
                      onChange={(e) => setEdits((p) => ({ ...p, [r.student_id]: e.target.value }))}
                      onBlur={() => saveEdit(r.student_id, r.comment_id)}
                    />
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className={overWord || underWord ? "text-destructive" : "text-muted-foreground"}>
                        {wc} words {reqs.minWords || reqs.maxWords ? `(${reqs.minWords || 0}–${reqs.maxWords || "∞"})` : ""}
                      </span>
                      <span className={overChar ? "text-destructive" : "text-muted-foreground"}>
                        {cc} chars {reqs.maxChars ? `(max ${reqs.maxChars})` : ""}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Not generated yet.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
