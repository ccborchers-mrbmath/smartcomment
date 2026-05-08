import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Upload, FileText, Lock } from "lucide-react";
import { toast } from "sonner";

const FIELD_LABELS: Record<string, string> = {
  policy: "School policy", tone: "Tone", structure: "Structure",
  minWords: "Min words", maxWords: "Max words", maxChars: "Max chars",
  pronoun: "Pronoun usage", bannedPhrases: "Banned phrases",
  mustInclude: "Must include", notes: "Other notes",
};

export default function Requirements() {
  const navigate = useNavigate();
  const [reqs, setReqs] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [schoolReqs, setSchoolReqs] = useState<any>({});
  const [lockedFields, setLockedFields] = useState<string[]>([]);
  const [schoolDomain, setSchoolDomain] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const isLocked = (k: string) => lockedFields.includes(k);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const domain = u.user.email?.split("@")[1]?.toLowerCase() || "";
      setSchoolDomain(domain);
      const [{ data }, { data: s }] = await Promise.all([
        supabase.from("teacher_defaults").select("requirements").eq("teacher_id", u.user.id).maybeSingle(),
        domain ? supabase.from("schools").select("requirements, locked_fields").eq("domain", domain).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      setReqs((data?.requirements as any) ?? {});
      setSchoolReqs(((s as any)?.requirements as any) ?? {});
      setLockedFields(((s as any)?.locked_fields as any) ?? []);
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

  const handlePolicyFile = async (file: File) => {
    setExtracting(true);
    try {
      const isText = /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/");
      const body: any = {};
      if (isText) {
        body.text = await file.text();
      } else {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        body.fileBase64 = btoa(bin);
        body.mimeType = file.type || "application/octet-stream";
      }
      const { data, error } = await supabase.functions.invoke("extract-policy", { body });
      if (error) throw error;
      const policy = (data as any)?.policy;
      if (!policy) throw new Error("No policy extracted");
      setReqs((r: any) => ({
        ...r,
        policy,
        policySource: file.name,
        policyUploadedAt: new Date().toISOString(),
      }));
      toast.success("Policy extracted — review below and click Save defaults");
    } catch (e: any) {
      toast.error(e.message || "Failed to extract policy");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

      {lockedFields.length > 0 && (
        <Card className="p-4 max-w-2xl mb-6 border-accent/40 bg-accent/5">
          <div className="flex items-start gap-2 text-sm">
            <Lock className="w-4 h-4 mt-0.5 text-accent shrink-0" />
            <div>
              <p className="font-medium">Locked by your school ({schoolDomain})</p>
              <p className="text-muted-foreground mt-1">
                These fields are set school-wide and can't be changed here:{" "}
                <span className="font-medium text-foreground">
                  {lockedFields.map((k) => FIELD_LABELS[k] || k).join(", ")}
                </span>
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 max-w-2xl space-y-6">
        <div className="space-y-3 border-b pb-6">
          <div>
            <Label>School policy document</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your school's report-writing policy (PDF, Word, image, Markdown, or text). The AI will extract every rule and follow it on every comment generated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.markdown,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePolicyFile(f);
              }}
            />
            <Button type="button" variant="outline" disabled={extracting || isLocked("policy")} onClick={() => fileRef.current?.click()}>
              {extracting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {extracting ? "Extracting…" : "Upload policy document"}
            </Button>
            {reqs.policySource && (
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />{reqs.policySource}
              </span>
            )}
          </div>
          <div>
            <Label htmlFor="policy">Extracted policy (editable)</Label>
            <Textarea
              id="policy"
              rows={10}
              disabled={isLocked("policy")}
              placeholder={isLocked("policy") ? "Locked by your school." : "Upload a document above, or paste/type your school's report-writing rules here."}
              value={isLocked("policy") ? (schoolReqs.policy || "") : (reqs.policy || "")}
              onChange={(e) => setReqs({ ...reqs, policy: e.target.value })}
            />
            {reqs.policy && !isLocked("policy") && (
              <Button type="button" variant="ghost" size="sm" className="mt-2"
                onClick={() => setReqs({ ...reqs, policy: "", policySource: null, policyUploadedAt: null })}>
                Clear policy
              </Button>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="tone">Tone</Label>
          <Input id="tone" disabled={isLocked("tone")} placeholder="e.g. warm, professional, encouraging" value={isLocked("tone") ? (schoolReqs.tone || "") : (reqs.tone || "")} onChange={(e) => setReqs({ ...reqs, tone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="structure">Required structure</Label>
          <Input id="structure" disabled={isLocked("structure")} placeholder="strengths → growth areas → next steps" value={isLocked("structure") ? (schoolReqs.structure || "") : (reqs.structure || "")} onChange={(e) => setReqs({ ...reqs, structure: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="min">Min words</Label>
            <Input id="min" type="number" disabled={isLocked("minWords")} value={isLocked("minWords") ? (schoolReqs.minWords ?? "") : (reqs.minWords ?? "")} onChange={(e) => setReqs({ ...reqs, minWords: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div>
            <Label htmlFor="max">Max words</Label>
            <Input id="max" type="number" disabled={isLocked("maxWords")} value={isLocked("maxWords") ? (schoolReqs.maxWords ?? "") : (reqs.maxWords ?? "")} onChange={(e) => setReqs({ ...reqs, maxWords: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div>
            <Label htmlFor="chars">Max chars</Label>
            <Input id="chars" type="number" disabled={isLocked("maxChars")} value={isLocked("maxChars") ? (schoolReqs.maxChars ?? "") : (reqs.maxChars ?? "")} onChange={(e) => setReqs({ ...reqs, maxChars: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        <div>
          <Label htmlFor="pronoun">Pronoun usage</Label>
          <Input id="pronoun" disabled={isLocked("pronoun")} placeholder="third person (he/she/they)" value={isLocked("pronoun") ? (schoolReqs.pronoun || "") : (reqs.pronoun || "")} onChange={(e) => setReqs({ ...reqs, pronoun: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="banned">Banned phrases</Label>
          <Textarea id="banned" rows={2} disabled={isLocked("bannedPhrases")} placeholder="comma-separated" value={isLocked("bannedPhrases") ? (schoolReqs.bannedPhrases || "") : (reqs.bannedPhrases || "")} onChange={(e) => setReqs({ ...reqs, bannedPhrases: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="must">Must include</Label>
          <Textarea id="must" rows={2} disabled={isLocked("mustInclude")} value={isLocked("mustInclude") ? (schoolReqs.mustInclude || "") : (reqs.mustInclude || "")} onChange={(e) => setReqs({ ...reqs, mustInclude: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="notes">Other notes for the AI</Label>
          <Textarea id="notes" rows={3} disabled={isLocked("notes")} value={isLocked("notes") ? (schoolReqs.notes || "") : (reqs.notes || "")} onChange={(e) => setReqs({ ...reqs, notes: e.target.value })} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
          Save defaults
        </Button>
      </Card>
    </AppShell>
  );
}
