import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Requirements() {
  const navigate = useNavigate();
  const [reqs, setReqs] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("teacher_defaults")
        .select("requirements")
        .eq("teacher_id", u.user.id)
        .maybeSingle();
      setReqs((data?.requirements as any) ?? {});
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("teacher_defaults")
      .upsert({ teacher_id: u.user!.id, requirements: reqs });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Default requirements saved — applied to all classes");
  };

  if (loading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back
      </Button>
      <h1 className="font-display text-4xl">Default requirements</h1>
      <p className="text-muted-foreground mt-1 mb-8">
        These apply to every class. A class can override any field in its own Requirements tab.
      </p>

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
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
          Save defaults
        </Button>
      </Card>
    </AppShell>
  );
}
