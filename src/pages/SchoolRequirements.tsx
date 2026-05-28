import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Upload, FileText, Lock, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const FIELDS: { key: string; label: string }[] = [
  { key: "policy", label: "School policy document" },
  { key: "tone", label: "Tone" },
  { key: "structure", label: "Structure" },
  { key: "minWords", label: "Min words" },
  { key: "maxWords", label: "Max words" },
  { key: "maxChars", label: "Max chars" },
  { key: "pronoun", label: "Pronoun usage" },
  { key: "bannedPhrases", label: "Banned phrases" },
  { key: "mustInclude", label: "Must include" },
  { key: "notes", label: "Other notes" },
];

export default function SchoolRequirements() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [school, setSchool] = useState<any>(null);
  const [reqs, setReqs] = useState<any>({});
  const [locked, setLocked] = useState<string[]>([]);
  const [admins, setAdmins] = useState<{ user_id: string; email?: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; email: string | null; school_email: string | null; school_email_verified_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [domain, setDomain] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const email = user?.email || "";
    const d = email.split("@")[1]?.toLowerCase() || "";
    setDomain(d);
    const { data: s } = await supabase.from("schools").select("*").eq("domain", d).maybeSingle();
    if (s) {
      setSchool(s);
      setReqs((s.requirements as any) ?? {});
      setLocked((s.locked_fields as any) ?? []);
      const { data: rows } = await supabase.from("school_admins").select("user_id").eq("school_id", s.id);
      setAdmins(rows ?? []);
      const amAdmin = !!rows?.find((r) => r.user_id === user?.id);
      setIsAdmin(amAdmin);
      if (amAdmin) {
        const { data: tdata } = await supabase.functions.invoke("claim-school-admin", { body: { action: "list_teachers" } });
        setTeachers((tdata as any)?.teachers ?? []);
      } else {
        setTeachers([]);
      }
      setSchool(null);
      setIsAdmin(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const claim = async () => {
    const { data, error } = await supabase.functions.invoke("claim-school-admin", { body: { action: "claim" } });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed");
      return;
    }
    toast.success(`You are now the admin for ${domain}`);
    load();
  };

  const save = async () => {
    if (!school) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({ requirements: reqs, locked_fields: locked })
      .eq("id", school.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("School requirements saved — applied to all teachers at " + domain);
  };

  const toggleLock = (key: string) => {
    setLocked((l) => (l.includes(key) ? l.filter((x) => x !== key) : [...l, key]));
  };

  const addAdmin = async () => {
    const { data, error } = await supabase.functions.invoke("claim-school-admin", {
      body: { action: "add_admin", email: adminEmail },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed");
      return;
    }
    toast.success("Admin added");
    setAdminEmail("");
    load();
  };

  const removeAdmin = async (uid: string) => {
    if (uid === user?.id) {
      if (!confirm("Remove yourself as admin? You will lose access to this page.")) return;
    }
    const { data, error } = await supabase.functions.invoke("claim-school-admin", {
      body: { action: "remove_admin", user_id: uid },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed");
      return;
    }
    load();
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
      setReqs((r: any) => ({ ...r, policy, policySource: file.name, policyUploadedAt: new Date().toISOString() }));
      toast.success("Policy extracted — review below and click Save");
    } catch (e: any) {
      toast.error(e.message || "Failed to extract policy");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  if (!school) {
    return (
      <AppShell>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back
        </Button>
        <h1 className="font-display text-4xl">School requirements</h1>
        <Card className="p-6 mt-6 max-w-2xl space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No admin set for <span className="font-mono">{domain}</span> yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                As the first teacher from this school, you can claim admin rights and set the school-wide report-writing rules. These will be applied to every teacher who signs in with an <span className="font-mono">@{domain}</span> email.
              </p>
            </div>
          </div>
          <Button onClick={claim}>Claim school admin for {domain}</Button>
        </Card>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back
        </Button>
        <h1 className="font-display text-4xl">School requirements</h1>
        <p className="text-muted-foreground mt-1 mb-6">Read-only view for {domain}.</p>
        <Card className="p-6 max-w-2xl space-y-4">
          <p className="text-sm">Your school admin has set the rules below. Locked fields cannot be overridden in your personal defaults or per-class settings.</p>
          {FIELDS.map((f) => (
            <div key={f.key} className="border-t pt-3">
              <div className="flex items-center gap-2">
                <Label>{f.label}</Label>
                {locked.includes(f.key) && <Lock className="w-3.5 h-3.5 text-accent" />}
              </div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                {String((reqs as any)[f.key] ?? "—") || "—"}
              </p>
            </div>
          ))}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back
      </Button>
      <h1 className="font-display text-4xl">School requirements</h1>
      <p className="text-muted-foreground mt-1 mb-8">
        Applies to every teacher signed in with <span className="font-mono">@{domain}</span>. Toggle <Lock className="inline w-3.5 h-3.5" /> to lock a field so teachers and classes can't override it.
      </p>

      <Card className="p-6 max-w-2xl space-y-6">
        <div className="space-y-3 border-b pb-6">
          <div className="flex items-center justify-between">
            <Label>School policy document</Label>
            <LockToggle on={locked.includes("policy")} onClick={() => toggleLock("policy")} />
          </div>
          <p className="text-sm text-muted-foreground">
            Upload your school's official report-writing policy. The AI follows it on every comment generated.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.markdown,image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePolicyFile(f); }}
            />
            <Button type="button" variant="outline" disabled={extracting} onClick={() => fileRef.current?.click()}>
              {extracting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {extracting ? "Extracting…" : "Upload policy document"}
            </Button>
            {reqs.policySource && (
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />{reqs.policySource}
              </span>
            )}
          </div>
          <Textarea
            rows={10}
            placeholder="Upload above, or paste your school's report-writing rules here."
            value={reqs.policy || ""}
            onChange={(e) => setReqs({ ...reqs, policy: e.target.value })}
          />
        </div>

        <Field label="Tone" k="tone" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Input value={reqs.tone || ""} onChange={(e) => setReqs({ ...reqs, tone: e.target.value })} />} />
        <Field label="Required structure" k="structure" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Input value={reqs.structure || ""} onChange={(e) => setReqs({ ...reqs, structure: e.target.value })} />} />
        <div className="grid grid-cols-3 gap-3">
          <NumField k="minWords" label="Min words" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock} />
          <NumField k="maxWords" label="Max words" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock} />
          <NumField k="maxChars" label="Max chars" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock} />
        </div>
        <Field label="Pronoun usage" k="pronoun" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Input value={reqs.pronoun || ""} onChange={(e) => setReqs({ ...reqs, pronoun: e.target.value })} />} />
        <Field label="Banned phrases" k="bannedPhrases" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Textarea rows={2} value={reqs.bannedPhrases || ""} onChange={(e) => setReqs({ ...reqs, bannedPhrases: e.target.value })} />} />
        <Field label="Must include" k="mustInclude" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Textarea rows={2} value={reqs.mustInclude || ""} onChange={(e) => setReqs({ ...reqs, mustInclude: e.target.value })} />} />
        <Field label="Other notes for the AI" k="notes" reqs={reqs} setReqs={setReqs} locked={locked} toggle={toggleLock}
          input={<Textarea rows={3} value={reqs.notes || ""} onChange={(e) => setReqs({ ...reqs, notes: e.target.value })} />} />

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
          Save school requirements
        </Button>
      </Card>

      <Card className="p-6 max-w-2xl mt-8 space-y-4">
        <h2 className="font-display text-2xl">School admins</h2>
        <p className="text-sm text-muted-foreground">
          Other teachers at @{domain} you grant admin can edit these rules. They must already have a SmartComment account.
        </p>
        <div className="space-y-2">
          {admins.map((a) => (
            <div key={a.user_id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
              <span className="font-mono text-xs">{a.user_id === user?.id ? `${user?.email} (you)` : a.user_id}</span>
              <Button variant="ghost" size="sm" onClick={() => removeAdmin(a.user_id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={`teacher@${domain}`}
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <Button onClick={addAdmin} disabled={!adminEmail}>Add</Button>
        </div>
      </Card>
    </AppShell>
  );
}

function LockToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Lock className={`w-3.5 h-3.5 ${on ? "text-accent" : ""}`} />
      <span>Lock</span>
      <Switch checked={on} onCheckedChange={onClick} />
    </div>
  );
}

function Field({ label, k, input, locked, toggle }: any) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <LockToggle on={locked.includes(k)} onClick={() => toggle(k)} />
      </div>
      <div className="mt-1.5">{input}</div>
    </div>
  );
}

function NumField({ k, label, reqs, setReqs, locked, toggle }: any) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <LockToggle on={locked.includes(k)} onClick={() => toggle(k)} />
      </div>
      <Input
        type="number"
        value={reqs[k] ?? ""}
        onChange={(e) => setReqs({ ...reqs, [k]: e.target.value ? Number(e.target.value) : null })}
      />
    </div>
  );
}
