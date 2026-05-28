import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy, Download, Loader2, Pencil, SpellCheck, Sparkles, ChevronDown, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { useBuyCredits, handleInsufficientCredits } from "@/components/BuyCreditsDialog";

type Version = { id: string; text: string; version: number; created_at: string };
type Row = {
  student_id: string;
  student_name: string;
  comment_id: string | null;
  text: string;
  version: number;
  versions: Version[];
};

export default function ReviewExport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openBuyCredits } = useBuyCredits();
  const [klass, setKlass] = useState<{ id: string; name: string; requirements: any } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [regenIds, setRegenIds] = useState<Record<string, boolean>>({});
  const [spellIds, setSpellIds] = useState<Record<string, boolean>>({});
  const [editableIds, setEditableIds] = useState<Record<string, boolean>>({});
  const [selectedVersion, setSelectedVersion] = useState<Record<string, string>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [selections, setSelections] = useState<Record<string, { start: number; end: number }>>({});
  const [rewriteState, setRewriteState] = useState<{
    sid: string;
    commentId: string;
    selStart: number;
    selEnd: number;
    selection: string;
    instruction: string;
    loading: boolean;
  } | null>(null);

  const openRewrite = (sid: string, commentId: string | null) => {
    if (!commentId) return;
    const sel = selections[sid];
    const value = edits[sid] ?? "";
    if (!sel || sel.start === sel.end) {
      toast.error("Select some text in the comment first");
      return;
    }
    const selection = value.slice(sel.start, sel.end);
    if (!selection.trim()) {
      toast.error("Select some text in the comment first");
      return;
    }
    setRewriteState({ sid, commentId, selStart: sel.start, selEnd: sel.end, selection, instruction: "", loading: false });
  };

  const runRewrite = async () => {
    if (!rewriteState) return;
    const { sid, commentId, selStart, selEnd, selection, instruction } = rewriteState;
    const fullComment = edits[sid] ?? "";
    if (fullComment.slice(selStart, selEnd) !== selection) {
      toast.error("The comment changed since you opened this. Reselect and try again.");
      setRewriteState(null);
      return;
    }
    setRewriteState({ ...rewriteState, loading: true });
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-selection", {
        body: { studentId: sid, fullComment, selection, instruction: instruction.trim() || undefined },
      });
      if (handleInsufficientCredits({ data, error }, openBuyCredits)) { setRewriteState((s) => (s ? { ...s, loading: false } : s)); return; }
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const replacement = (data?.text ?? "").trim();
      if (!replacement) throw new Error("Empty response");
      const next = fullComment.slice(0, selStart) + replacement + fullComment.slice(selEnd);
      setEdits((p) => ({ ...p, [sid]: next }));
      const { error: upErr } = await supabase.from("generated_comments").update({ text: next }).eq("id", commentId);
      if (upErr) throw upErr;
      toast.success("Selection rewritten");
      setRewriteState(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
      setRewriteState((s) => (s ? { ...s, loading: false } : s));
    }
  };

  const load = async () => {
    if (!id) return;
    const { data: c } = await supabase.from("classes").select("id, name, requirements").eq("id", id).single();
    setKlass(c);
    const { data: students } = await supabase.from("students").select("id, name").eq("class_id", id).order("position");
    const ids = (students ?? []).map((s) => s.id);
    const { data: comments } = await supabase
      .from("generated_comments")
      .select("id, student_id, text, version, created_at")
      .in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("version", { ascending: false });
    const versionsByStudent = new Map<string, Version[]>();
    (comments ?? []).forEach((c) => {
      const arr = versionsByStudent.get(c.student_id) ?? [];
      arr.push(c as Version);
      versionsByStudent.set(c.student_id, arr);
    });
    const built: Row[] = (students ?? []).map((s) => {
      const vs = versionsByStudent.get(s.id) ?? [];
      const c = vs[0];
      return {
        student_id: s.id,
        student_name: s.name,
        comment_id: c?.id ?? null,
        text: c?.text ?? "",
        version: c?.version ?? 0,
        versions: vs,
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
      if (handleInsufficientCredits({ data, error }, openBuyCredits)) { setRegenIds((p) => ({ ...p, [sid]: false })); return; }
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
    setEditableIds((p) => ({ ...p, [sid]: true }));
    setTimeout(() => {
      const el = textareaRefs.current[sid];
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
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

  const selectVersion = (sid: string, v: Version) => {
    setSelectedVersion((p) => ({ ...p, [sid]: v.id }));
    setEdits((p) => ({ ...p, [sid]: v.text }));
    setEditableIds((p) => ({ ...p, [sid]: false }));
  };

  const deleteVersion = async (sid: string, commentId: string | null, versionNum: number) => {
    if (!commentId) return;
    if (!confirm(`Delete version ${versionNum}? This cannot be undone.`)) return;
    const { error } = await supabase.from("generated_comments").delete().eq("id", commentId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSelectedVersion((p) => {
      const n = { ...p };
      delete n[sid];
      return n;
    });
    toast.success("Version deleted");
    load();
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

  const exportDocx = async () => {
    const children: Paragraph[] = [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${klass?.name ?? "Class"} — Comments`)] }),
    ];
    rows.forEach((r) => {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun(r.student_name)] }),
        new Paragraph({ children: [new TextRun(edits[r.student_id] ?? "")] }),
      );
    });
    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${klass?.name ?? "class"}-comments.docx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("DOCX exported");
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
          <Button variant="outline" onClick={exportDocx}><Download className="w-4 h-4 mr-1.5" />Export DOCX</Button>
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
            const activeVersion =
              r.versions.find((v) => v.id === selectedVersion[r.student_id]) ?? r.versions[0];
            const activeCommentId = activeVersion?.id ?? r.comment_id;
            const activeVersionNum = activeVersion?.version ?? r.version;
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
                    {r.version > 0 && (
                      r.versions.length > 1 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                            v{activeVersionNum}<ChevronDown className="w-3 h-3" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                            {r.versions.map((v) => (
                              <DropdownMenuItem
                                key={v.id}
                                onClick={() => selectVersion(r.student_id, v)}
                                className="flex flex-col items-start gap-0.5"
                              >
                                <span className="text-xs font-medium">
                                  v{v.version} {v.id === activeCommentId ? "(viewing)" : v.version === r.version ? "(latest)" : ""}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(v.created_at).toLocaleString()}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <p className="text-xs text-muted-foreground">v{r.version}</p>
                      )
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => focusEdit(r.student_id)} disabled={!activeCommentId}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />Manual edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => spellcheck(r.student_id, activeCommentId, r.student_name)} disabled={!activeCommentId || spellIds[r.student_id] || editableIds[r.student_id]} title={editableIds[r.student_id] ? "Finish editing first" : undefined}>
                      {spellIds[r.student_id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <SpellCheck className="w-3.5 h-3.5 mr-1.5" />}
                      Spelling & grammar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => openRewrite(r.student_id, activeCommentId)}
                      disabled={!activeCommentId || !editableIds[r.student_id]}
                      title={!editableIds[r.student_id] ? "Click Manual edit first, then select text" : "Select text in the comment, then click"}
                    >
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" />Rewrite selection
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => regen(r.student_id)} disabled={regenIds[r.student_id] || editableIds[r.student_id]} title={editableIds[r.student_id] ? "Finish editing to regenerate the full comment" : undefined}>
                      {regenIds[r.student_id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                      Regenerate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyOne(r.student_id)}><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteVersion(r.student_id, activeCommentId, activeVersionNum)} disabled={!activeCommentId || editableIds[r.student_id]} title={editableIds[r.student_id] ? "Finish editing first" : undefined} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete version
                    </Button>
                  </div>
                </div>
                {activeCommentId ? (
                  <>
                    <Textarea
                      ref={(el) => { textareaRefs.current[r.student_id] = el; }}
                      rows={5}
                      value={text}
                      readOnly={!editableIds[r.student_id]}
                      className={!editableIds[r.student_id] ? "bg-muted/40 cursor-default focus-visible:ring-0 focus-visible:ring-offset-0" : ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [r.student_id]: e.target.value }))}
                      onSelect={(e) => {
                        const t = e.currentTarget;
                        setSelections((p) => ({ ...p, [r.student_id]: { start: t.selectionStart ?? 0, end: t.selectionEnd ?? 0 } }));
                      }}
                      onBlur={() => {
                        if (editableIds[r.student_id]) {
                          saveEdit(r.student_id, activeCommentId);
                          setEditableIds((p) => ({ ...p, [r.student_id]: false }));
                        }
                      }}
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

      <Dialog open={!!rewriteState} onOpenChange={(o) => { if (!o && !rewriteState?.loading) setRewriteState(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rewrite selection</DialogTitle>
            <DialogDescription>The AI will replace only the highlighted text, keeping the rest of the comment intact.</DialogDescription>
          </DialogHeader>
          {rewriteState && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Selected text</p>
                <p className="text-sm bg-muted/40 rounded-md p-3 italic">"{rewriteState.selection}"</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Optional instruction</p>
                <Input
                  placeholder="e.g. make it shorter, mention effort, soften the tone"
                  value={rewriteState.instruction}
                  onChange={(e) => setRewriteState((s) => (s ? { ...s, instruction: e.target.value } : s))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !rewriteState.loading) runRewrite(); }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRewriteState(null)} disabled={rewriteState?.loading}>Cancel</Button>
            <Button onClick={runRewrite} disabled={rewriteState?.loading}>
              {rewriteState?.loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
              Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
