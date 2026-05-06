import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2, X, Plus, ArrowLeft, ClipboardPaste, ImageIcon } from "lucide-react";
import { toast } from "sonner";

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

export default function NewClass() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [yearGrade, setYearGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("");
  const [pasted, setPasted] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [genders, setGenders] = useState<("male" | "female" | null)[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addNames = (extracted: string[]) => {
    setNames((prev) => [...prev, ...extracted]);
    setGenders((prev) => [...prev, ...extracted.map(() => null)]);
  };

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
    if (file) handleFile(file);
  };

  const handleFile = async (file: File) => {
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
        setNames((prev) => [...prev, ...extracted]);
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
      setNames((prev) => [...prev, ...extracted]);
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
      const { data: cls, error } = await supabase
        .from("classes")
        .insert({ teacher_id: teacherId, name, year_grade: yearGrade || null, subject: subject || null, term: term || null })
        .select()
        .single();
      if (error) throw error;
      const rows = names.map((n, i) => ({ class_id: cls.id, teacher_id: teacherId, name: n, position: i }));
      const { error: sErr } = await supabase.from("students").insert(rows);
      if (sErr) throw sErr;
      toast.success("Class created");
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grade">Year / grade</Label>
              <Input id="grade" placeholder="Year 6" value={yearGrade} onChange={(e) => setYearGrade(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="term">Term</Label>
              <Input id="term" placeholder="Term 4 2026" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="subject">Subject (optional)</Label>
            <Input id="subject" placeholder="English" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-display text-xl">Roster</h2>
          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">
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
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={pasteFromClipboard}>
                        <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />Paste from clipboard
                      </Button>
                      <label>
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span><Upload className="w-3.5 h-3.5 mr-1.5" />Upload file</span>
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.csv,.txt,.tsv"
                          disabled={busy}
                          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
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
              <p className="text-sm text-muted-foreground">Review and edit before saving. {names.length} students.</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {names.map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={n}
                      onChange={(e) => setNames((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setNames((p) => p.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setNames((p) => [...p, ""])} className="w-full">
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
    </AppShell>
  );
}
