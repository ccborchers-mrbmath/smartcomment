import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";

type Sample = { id: string; text: string; source: string | null; created_at: string; active: boolean };

export default function StyleBank() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("style_samples").select("*").order("created_at", { ascending: false });
    setSamples(data ?? []);
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

  const activeCount = samples.filter((s) => s.active).length;

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
          <p className="text-xs text-muted-foreground mb-4">
            {activeCount} active — only checked samples are used when generating comments.
          </p>
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {samples.map((s) => (
                <div key={s.id} className="border border-border rounded-lg p-3 group">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={s.active}
                      onCheckedChange={(v) => toggleActive(s.id, v === true)}
                      className="mt-0.5"
                      aria-label="Use this sample when generating"
                    />
                    <p className={`text-sm whitespace-pre-wrap flex-1 ${s.active ? "" : "opacity-50"}`}>{s.text}</p>
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
