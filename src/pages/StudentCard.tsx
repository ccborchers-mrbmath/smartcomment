import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, Mic, Square, Image as ImageIcon, FileText, Paperclip, Loader2, Trash2, Sparkles, Pencil, Check, X, Camera, FileSearch, Download, Lightbulb, Save, History } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import ImageCropDialog from "@/components/ImageCropDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";

type Student = { id: string; name: string; class_id: string; overrides: any };
type Input = {
  id: string;
  type: "voice" | "handwriting" | "typed" | "file";
  text: string | null;
  transcript: string | null;
  media_url: string | null;
  media_path: string | null;
  term: string | null;
  created_at: string;
};

const fileToBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function StudentCard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [activeTerm, setActiveTerm] = useState<string>("2026 Term 2");
  const [siblings, setSiblings] = useState<{ id: string }[]>([]);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showAllTerms, setShowAllTerms] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState<string>("");
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionText, setInterventionText] = useState<string>("");
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const [savedReports, setSavedReports] = useState<{ id: string; title: string | null; created_at: string; updated_at: string }[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = async () => {
    if (!id) return;
    const { data: s } = await supabase.from("students").select("id, name, class_id, overrides").eq("id", id).single();
    setStudent(s);
    if (s) {
      const { data: sibs } = await supabase
        .from("students")
        .select("id")
        .eq("class_id", s.class_id)
        .order("position", { ascending: true });
      setSiblings((sibs ?? []) as { id: string }[]);
      const { data: cls } = await supabase.from("classes").select("active_term").eq("id", s.class_id).single();
      if (cls?.active_term) setActiveTerm(cls.active_term);
    }
    const { data: ins } = await supabase
      .from("student_inputs")
      .select("*")
      .eq("student_id", id)
      .order("created_at", { ascending: false });
    setInputs((ins ?? []) as Input[]);
  };

  useEffect(() => { load(); }, [id]);

  const saveTyped = async () => {
    if (!typed.trim() || !student) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("student_inputs").insert({
      student_id: student.id,
      teacher_id: u.user!.id,
      type: "typed",
      text: typed.trim(),
      term: activeTerm,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setTyped("");
    load();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadVoice(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const uploadVoice = async (blob: Blob) => {
    if (!student) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${student.id}/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("audio-notes").upload(path, blob);
      if (upErr) throw upErr;
      const base64 = await fileToBase64(blob);
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64: base64, mimeType: "audio/webm" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { error: insErr } = await supabase.from("student_inputs").insert({
        student_id: student.id,
        teacher_id: u.user!.id,
        type: "voice",
        transcript: data?.text ?? "",
        media_path: path,
        term: activeTerm,
      });
      if (insErr) throw insErr;
      toast.success("Voice note saved");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadHandwriting = async (files: File[]) => {
    if (!student || files.length === 0) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const stamp = Date.now();
      const paths: string[] = [];
      // Upload pages sequentially so we never hold more than one large blob in flight.
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${u.user!.id}/${student.id}/${stamp}-p${i + 1}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("handwriting").upload(path, f, {
          contentType: f.type || "image/jpeg",
        });
        if (upErr) throw upErr;
        paths.push(path);
      }
      // Hand the storage paths to the edge function — it will stream each image
      // from storage. This avoids base64-encoding everything in the browser and
      // sending a huge request body (the source of "low memory" on phones).
      const { data, error } = await supabase.functions.invoke("ocr-handwriting", {
        body: { bucket: "handwriting", paths },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { error: insErr } = await supabase.from("student_inputs").insert({
        student_id: student.id,
        teacher_id: u.user!.id,
        type: "handwriting",
        transcript: data?.text ?? "",
        media_path: paths[0],
        term: activeTerm,
      });
      if (insErr) throw insErr;
      toast.success(files.length > 1 ? `${files.length} pages transcribed` : "Note transcribed");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!student) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${student.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("student_inputs").insert({
        student_id: student.id,
        teacher_id: u.user!.id,
        type: "file",
        text: file.name,
        media_path: path,
        term: activeTerm,
      });
      if (insErr) throw insErr;
      toast.success("File attached");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteInput = async (input: Input) => {
    if (!confirm("Delete this note?")) return;
    if (input.media_path) {
      const bucket = input.type === "voice" ? "audio-notes" : input.type === "handwriting" ? "handwriting" : "attachments";
      await supabase.storage.from(bucket).remove([input.media_path]);
    }
    await supabase.from("student_inputs").delete().eq("id", input.id);
    load();
  };

  const generate = async () => {
    if (!student) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-comments", {
        body: { studentIds: [student.id] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Comment generated");
      navigate(`/classes/${student.class_id}/review`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setGenerating(false);
    }
  };

  const generateReport = async () => {
    if (!student) return;
    setReportOpen(true);
    setReportText("");
    setInterventionText("");
    setCurrentReportId(null);
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-report", {
        body: { studentId: student.id, mode: "synthesis" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReportText(data?.text ?? "");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate report");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const generateInterventions = async () => {
    if (!student || !reportText) return;
    setInterventionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-report", {
        body: { studentId: student.id, mode: "interventions", synthesis: reportText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInterventionText(data?.text ?? "");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate analysis");
    } finally {
      setInterventionLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!student) return;
    const combinedMd = interventionText ? `${reportText}\n\n---\n\n${interventionText}` : reportText;
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
      Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
    } = await import("docx");

    const tokens = marked.lexer(combinedMd, { gfm: true });

    const inlineRuns = (text: string): any[] => {
      // very small inline parser: **bold**, *italic*, `code`
      const runs: any[] = [];
      const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
      let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
        if (m[2]) runs.push(new TextRun({ text: m[2], bold: true }));
        else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true }));
        else if (m[4]) runs.push(new TextRun({ text: m[4], font: "Consolas" }));
        last = m.index + m[0].length;
      }
      if (last < text.length) runs.push(new TextRun(text.slice(last)));
      return runs.length ? runs : [new TextRun(text)];
    };

    const border = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
    const cellBorders = { top: border, bottom: border, left: border, right: border };

    const children: any[] = [];

    for (const tok of tokens as any[]) {
      if (tok.type === "heading") {
        const level = Math.min(Math.max(tok.depth, 1), 4);
        const heading = ([HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4])[level - 1];
        children.push(new Paragraph({ heading, children: inlineRuns(tok.text) }));
      } else if (tok.type === "paragraph") {
        children.push(new Paragraph({ children: inlineRuns(tok.text) }));
      } else if (tok.type === "space") {
        children.push(new Paragraph({ children: [new TextRun("")] }));
      } else if (tok.type === "hr") {
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 1 } }, children: [new TextRun("")] }));
      } else if (tok.type === "list") {
        for (const item of tok.items) {
          children.push(new Paragraph({
            bullet: tok.ordered ? undefined : { level: 0 },
            numbering: tok.ordered ? undefined : undefined,
            children: [new TextRun(tok.ordered ? `• ${item.text}` : `• ${item.text}`)],
          }));
        }
      } else if (tok.type === "table") {
        const headerRow = new TableRow({
          tableHeader: true,
          children: tok.header.map((h: any) => new TableCell({
            borders: cellBorders,
            shading: { fill: "EEEEEE", type: ShadingType.CLEAR, color: "auto" },
            children: [new Paragraph({ children: inlineRuns(typeof h === "string" ? h : h.text) })],
          })),
        });
        const bodyRows = tok.rows.map((row: any[]) => new TableRow({
          children: row.map((c: any) => new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: inlineRuns(typeof c === "string" ? c : c.text) })],
          })),
        }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }));
        children.push(new Paragraph({ children: [new TextRun("")] }));
      } else if (tok.type === "blockquote") {
        children.push(new Paragraph({ children: inlineRuns(tok.text), indent: { left: 360 } }));
      }
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Calibri", size: 22 } } },
      },
      sections: [{ children }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${student.name.replace(/\s+/g, "_")}_report.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSavedReports = async () => {
    if (!student) return;
    const { data, error } = await supabase
      .from("student_reports")
      .select("id, title, created_at, updated_at")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setSavedReports(data ?? []);
  };

  const saveReport = async () => {
    if (!student || !reportText) return;
    setSavingReport(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        student_id: student.id,
        teacher_id: u.user!.id,
        synthesis: reportText,
        interventions: interventionText || null,
        title: `Report — ${new Date().toLocaleDateString()}`,
      };
      if (currentReportId) {
        const { error } = await supabase.from("student_reports")
          .update({ synthesis: reportText, interventions: interventionText || null })
          .eq("id", currentReportId);
        if (error) throw error;
        toast.success("Report updated");
      } else {
        const { data, error } = await supabase.from("student_reports").insert(payload).select("id").single();
        if (error) throw error;
        setCurrentReportId(data.id);
        toast.success("Report saved");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSavingReport(false);
    }
  };

  const openSavedReport = async (rid: string) => {
    const { data, error } = await supabase
      .from("student_reports")
      .select("id, synthesis, interventions")
      .eq("id", rid)
      .maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Not found"); return; }
    setReportText(data.synthesis);
    setInterventionText(data.interventions ?? "");
    setCurrentReportId(data.id);
    setSavedOpen(false);
    setReportOpen(true);
  };

  const deleteSavedReport = async (rid: string) => {
    if (!confirm("Delete this saved report?")) return;
    const { error } = await supabase.from("student_reports").delete().eq("id", rid);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    if (currentReportId === rid) setCurrentReportId(null);
    loadSavedReports();
  };

  if (!student) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      {(() => {
        const idx = siblings.findIndex((s) => s.id === student.id);
        const prev = idx > 0 ? siblings[idx - 1] : null;
        const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
        return (
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/classes/${student.class_id}`}><ArrowLeft className="w-4 h-4 mr-1.5" />Back to class</Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!prev} asChild={!!prev}>
                {prev ? <Link to={`/students/${prev.id}`}><ArrowLeft className="w-4 h-4 mr-1.5" />Previous</Link> : <span><ArrowLeft className="w-4 h-4 mr-1.5" />Previous</span>}
              </Button>
              <Button variant="outline" size="sm" disabled={!next} asChild={!!next}>
                {next ? <Link to={`/students/${next.id}`}>Next<ArrowRight className="w-4 h-4 ml-1.5" /></Link> : <span>Next<ArrowRight className="w-4 h-4 ml-1.5" /></span>}
              </Button>
            </div>
          </div>
        );
      })()}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <h1 className="font-display text-4xl">{student.name}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={async () => { await loadSavedReports(); setSavedOpen(true); }}>
            <History className="w-4 h-4 mr-1.5" /> Saved reports
          </Button>
          <Button variant="outline" onClick={generateReport} disabled={reportLoading}>
            {reportLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSearch className="w-4 h-4 mr-1.5" />}
            Comprehensive report
          </Button>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            Generate comment
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-display text-xl mb-1">Add input</h2>
          <p className="text-xs text-muted-foreground mb-4">Recording for: <span className="font-medium text-foreground">{activeTerm}</span></p>
          <Tabs defaultValue="typed">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="typed"><FileText className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="voice"><Mic className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="hand"><ImageIcon className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="file"><Paperclip className="w-3.5 h-3.5" /></TabsTrigger>
            </TabsList>
            <TabsContent value="typed" className="space-y-3 mt-4">
              <Textarea rows={5} placeholder="Type a note about this student…" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <Button onClick={saveTyped} disabled={busy || !typed.trim()} className="w-full">Save note</Button>
            </TabsContent>
            <TabsContent value="voice" className="mt-4 text-center">
              {!recording ? (
                <Button onClick={startRecording} disabled={busy} size="lg" className="w-full">
                  <Mic className="w-4 h-4 mr-1.5" />Record voice note
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full animate-pulse">
                  <Square className="w-4 h-4 mr-1.5" />Stop & transcribe
                </Button>
              )}
              {busy && <p className="text-sm text-muted-foreground mt-3">Transcribing…</p>}
            </TabsContent>
            <TabsContent value="hand" className="mt-4 space-y-3">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/50">
                {busy ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <>
                  <Camera className="w-6 h-6 mb-2 text-muted-foreground" />
                  <span className="text-sm">Take photo</span>
                </>}
                <input type="file" className="hidden" accept="image/*" capture="environment" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingCrop(f); e.target.value = ""; }} />
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/50">
                {busy ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <>
                  <ImageIcon className="w-6 h-6 mb-2 text-muted-foreground" />
                  <span className="text-sm">Upload image from device</span>
                </>}
                <input type="file" className="hidden" accept="image/*" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingCrop(f); e.target.value = ""; }} />
              </label>
            </TabsContent>
            <TabsContent value="file" className="mt-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/50">
                {busy ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <>
                  <Paperclip className="w-6 h-6 mb-2 text-muted-foreground" />
                  <span className="text-sm">Attach a file</span>
                </>}
                <input type="file" className="hidden" disabled={busy}
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
              </label>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="p-6">
          {(() => {
            const visibleInputs = showAllTerms
              ? inputs
              : inputs.filter((i) => (i.term ?? "2026 Term 2") === activeTerm);
            const hiddenCount = inputs.length - visibleInputs.length;
            return (
              <>
                <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                  <h2 className="font-display text-xl">
                    Notes ({visibleInputs.length}{showAllTerms ? "" : ` · ${activeTerm}`})
                  </h2>
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showAllTerms}
                      onChange={(e) => setShowAllTerms(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    Show all terms{hiddenCount > 0 && !showAllTerms ? ` (${hiddenCount} hidden)` : ""}
                  </label>
                </div>
                {visibleInputs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {inputs.length === 0
                      ? "No notes yet — add the first one."
                      : `No notes for ${activeTerm} yet. Tick "Show all terms" to see notes from other terms.`}
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {visibleInputs.map((i) => (
                      <div key={i.id} className="border border-border rounded-lg p-3 group">
                        <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{i.type}</span>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                              {i.term ?? "2026 Term 2"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</span>
                            {editingId === i.id ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                                  const useTranscript = i.transcript !== null && i.transcript !== undefined && i.type !== "file";
                                  const update = useTranscript ? { transcript: editText } : { text: editText };
                                  const { error } = await supabase.from("student_inputs").update(update).eq("id", i.id);
                                  if (error) { toast.error(error.message); return; }
                                  setEditingId(null);
                                  toast.success("Saved");
                                  load();
                                }}>
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setEditingId(i.id); setEditText(i.transcript || i.text || ""); }}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteInput(i)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        {editingId === i.id ? (
                          <Textarea rows={4} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{i.transcript || i.text || "(no text)"}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </Card>
      </div>
      <ImageCropDialog
        file={pendingCrop}
        onCancel={() => setPendingCrop(null)}
        onConfirm={(files) => { setPendingCrop(null); uploadHandwriting(files); }}
      />
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Comprehensive report — {student.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            {reportLoading && !reportText ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Synthesizing all data for this student…
              </div>
            ) : (
              <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-display prose-table:text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportText}</ReactMarkdown>
                {interventionText && (
                  <>
                    <hr />
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{interventionText}</ReactMarkdown>
                  </>
                )}
                {interventionLoading && (
                  <div className="flex items-center text-muted-foreground mt-4">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating support & intervention analysis…
                  </div>
                )}
              </article>
            )}
          </div>
          {reportText && !reportLoading && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadReport}>
                <Download className="w-4 h-4 mr-1.5" /> Download
              </Button>
              <Button variant="outline" size="sm" onClick={saveReport} disabled={savingReport}>
                {savingReport ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                {currentReportId ? "Update saved" : "Save report"}
              </Button>
              {!interventionText && (
                <Button size="sm" onClick={generateInterventions} disabled={interventionLoading}>
                  {interventionLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Lightbulb className="w-4 h-4 mr-1.5" />}
                  Add support & intervention analysis
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={savedOpen} onOpenChange={setSavedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Saved reports</DialogTitle>
          </DialogHeader>
          {savedReports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No saved reports yet.</p>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {savedReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 gap-2">
                  <button className="text-left flex-1 hover:underline" onClick={() => openSavedReport(r.id)}>
                    <div className="text-sm font-medium">{r.title ?? "Untitled report"}</div>
                    <div className="text-xs text-muted-foreground">
                      Saved {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      {r.updated_at !== r.created_at && ` · updated ${formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}`}
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSavedReport(r.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
