import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Mic, Square, Image as ImageIcon, FileText, Paperclip, Loader2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Student = { id: string; name: string; class_id: string };
type Input = {
  id: string;
  type: "voice" | "handwriting" | "typed" | "file";
  text: string | null;
  transcript: string | null;
  media_url: string | null;
  media_path: string | null;
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
  const [inputs, setInputs] = useState<Input[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = async () => {
    if (!id) return;
    const { data: s } = await supabase.from("students").select("id, name, class_id").eq("id", id).single();
    setStudent(s);
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

  const uploadHandwriting = async (file: File) => {
    if (!student) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${student.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("handwriting").upload(path, file);
      if (upErr) throw upErr;
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("ocr-handwriting", {
        body: { imageBase64: base64, mimeType: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { error: insErr } = await supabase.from("student_inputs").insert({
        student_id: student.id,
        teacher_id: u.user!.id,
        type: "handwriting",
        transcript: data?.text ?? "",
        media_path: path,
      });
      if (insErr) throw insErr;
      toast.success("Note transcribed");
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

  if (!student) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to={`/classes/${student.class_id}`}><ArrowLeft className="w-4 h-4 mr-1.5" />Back to class</Link>
      </Button>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <h1 className="font-display text-4xl">{student.name}</h1>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Generate comment
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-display text-xl mb-4">Add input</h2>
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
            <TabsContent value="hand" className="mt-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/50">
                {busy ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <>
                  <ImageIcon className="w-6 h-6 mb-2 text-muted-foreground" />
                  <span className="text-sm">Upload handwritten note</span>
                </>}
                <input type="file" className="hidden" accept="image/*" capture="environment" disabled={busy}
                  onChange={(e) => e.target.files?.[0] && uploadHandwriting(e.target.files[0])} />
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
          <h2 className="font-display text-xl mb-4">Notes ({inputs.length})</h2>
          {inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet — add the first one.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {inputs.map((i) => (
                <div key={i.id} className="border border-border rounded-lg p-3 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{i.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteInput(i)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{i.transcript || i.text || "(no text)"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
