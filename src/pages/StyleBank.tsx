import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

const GRADES = ["All Grades", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"] as const;
type Grade = typeof GRADES[number];

type Sample = { id: string; text: string; source: string | null; created_at: string; active: boolean; grade: Grade };

export default function StyleBank() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<Grade[]>([...GRADES]);

  const toggleGradeFilter = (g: Grade) => {
    setGradeFilter((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const load = async () => {
    const { data } = await supabase.from("style_samples").select("*").order("created_at", { ascending: false });
    setSamples((data ?? []) as Sample[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    // Allow pasting many comments separated by blank lines
    const items = text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
    const rows = items.map((t) => ({ teacher_id: u.user!.id, text: t, source: "pasted" }));
    const { error } = await supabase.from("style_samples").insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${items.length} sample${items.length > 1 ? "s" : ""}`);
    setText("");
    load();
  };

  const del = async (id: string) => {
    await supabase.from("style_samples").delete().eq("id", id);
    load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
    const { error } = await supabase.from("style_samples").update({ active }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const setGrade = async (id: string, grade: Grade) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, grade } : s)));
    const { error } = await supabase.from("style_samples").update({ grade }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const activeCount = samples.filter((s) => s.active).length;

  const filteredSamples = samples.filter((s) => gradeFilter.includes(s.grade));
  const sortedSamples = [...filteredSamples].sort((a, b) => {
    const ai = GRADES.indexOf(a.grade);
    const bi = GRADES.indexOf(b.grade);
    if (ai !== bi) return ai - bi;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="font-display text-4xl mb-2">Style bank</h1>
        <p className="text-muted-foreground">
          Paste examples of comments you've written before. The AI will mimic your voice when generating new ones.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-3 h-fit">
          <h2 className="font-display text-xl">Add samples</h2>
          <p className="text-xs text-muted-foreground">
            Paste one or many comments. Separate multiple comments with a blank line.
          </p>
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Sarah has had a wonderful term…" />
          <Button onClick={add} disabled={busy || !text.trim()} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Add to style bank
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl mb-1">Saved samples ({samples.length})</h2>
          <p className="text-xs text-muted-foreground mb-3">
            {activeCount} active — only checked samples are used when generating comments.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs text-muted-foreground mr-1">Filter:</span>
            {GRADES.map((g) => {
              const on = gradeFilter.includes(g);
              return (
                <Toggle
                  key={g}
                  size="sm"
                  pressed={on}
                  onPressedChange={() => toggleGradeFilter(g)}
                  className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {g}
                </Toggle>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs ml-auto"
              onClick={() =>
                setGradeFilter(gradeFilter.length === GRADES.length ? [] : [...GRADES])
              }
            >
              {gradeFilter.length === GRADES.length ? "Clear" : "All"}
            </Button>
          </div>
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {sortedSamples.map((s) => (
                <div key={s.id} className="border border-border rounded-lg p-3 group">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={s.active}
                      onCheckedChange={(v) => toggleActive(s.id, v === true)}
                      className="mt-0.5"
                      aria-label="Use this sample when generating"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className={`text-sm whitespace-pre-wrap ${s.active ? "" : "opacity-50"}`}>{s.text}</p>
                      <Select value={s.grade ?? "All Grades"} onValueChange={(v) => setGrade(s.id, v as Grade)}>
                        <SelectTrigger className="h-7 text-xs w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADES.map((g) => (
                            <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => del(s.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
