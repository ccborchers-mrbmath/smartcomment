import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, FileText, GraduationCap } from "lucide-react";

type Row = {
  user_id: string;
  function_name: string;
  units: number;
  credits_used: number;
  cost_usd_estimate: number;
  created_at: string;
};

function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

function rangeFor(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function SchoolInvoice() {
  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [schools, setSchools] = useState<{ id: string; name: string | null; domain: string }[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Load schools the user can invoice for
  useEffect(() => {
    if (!user) return;
    (async () => {
      if (isSuperAdmin) {
        // Super admin: read schools that have any usage events
        const { data } = await supabase.from("schools").select("id, name, domain").order("name");
        setSchools(data ?? []);
        if ((data ?? []).length && !schoolId) setSchoolId(data![0].id);
      } else {
        // School admin: only their schools
        const { data: admins } = await supabase.from("school_admins").select("school_id");
        const ids = (admins ?? []).map((a) => a.school_id);
        if (!ids.length) { setSchools([]); return; }
        const { data } = await supabase.from("schools").select("id, name, domain").in("id", ids).order("name");
        setSchools(data ?? []);
        if ((data ?? []).length && !schoolId) setSchoolId(data![0].id);
      }
    })();
  }, [user, isSuperAdmin]);

  // Fetch usage rows for school + month
  useEffect(() => {
    if (!schoolId) { setRows([]); return; }
    const schoolDomain = schools.find((s) => s.id === schoolId)?.domain;
    if (!schoolDomain) { setRows([]); return; }
    setLoading(true);
    const { start, end } = rangeFor(month);
    (async () => {
      // Match by school_id (newer events) OR attributed_domain (older events lacking school_id)
      const { data } = await supabase
        .from("usage_events")
        .select("user_id, function_name, units, credits_used, cost_usd_estimate, created_at")
        .or(`school_id.eq.${schoolId},attributed_domain.eq.${schoolDomain}`)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false })
        .limit(10000);
      setRows((data as Row[]) ?? []);

      // Fetch emails for these users from profiles
      const uids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", uids);
        const m: Record<string, string> = {};
        (profs ?? []).forEach((p) => { m[p.id] = p.full_name ? `${p.full_name} <${p.email}>` : (p.email ?? p.id); });
        setUserEmails(m);
      }
      setLoading(false);
    })();
  }, [schoolId, month, schools]);

  const totals = useMemo(() => {
    const t = { events: 0, units: 0, credits: 0, cost: 0 };
    rows.forEach((r) => {
      t.events++;
      t.units += r.units;
      t.credits += r.credits_used;
      t.cost += Number(r.cost_usd_estimate);
    });
    return t;
  }, [rows]);

  const perUser = useMemo(() => {
    const map = new Map<string, { events: number; units: number; credits: number; cost: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.user_id) ?? { events: 0, units: 0, credits: 0, cost: 0 };
      cur.events++; cur.units += r.units; cur.credits += r.credits_used; cur.cost += Number(r.cost_usd_estimate);
      map.set(r.user_id, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);

  const perFeature = useMemo(() => {
    const map = new Map<string, { events: number; units: number; cost: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.function_name) ?? { events: 0, units: 0, cost: 0 };
      cur.events++; cur.units += r.units; cur.cost += Number(r.cost_usd_estimate);
      map.set(r.function_name, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);

  const school = schools.find((s) => s.id === schoolId);
  const monthLabel = months.find((m) => m.value === month)?.label ?? month;

  const downloadCsv = () => {
    const header = "user,function,events,units,credits,cost_usd\n";
    const lines = perUser.map(([uid, t]) => `"${(userEmails[uid] ?? uid).replace(/"/g, '""')}",ALL,${t.events},${t.units},${t.credits},${t.cost.toFixed(6)}`);
    const featureLines = perFeature.map(([fn, t]) => `ALL,${fn},${t.events},${t.units},,${t.cost.toFixed(6)}`);
    const blob = new Blob([header + lines.join("\n") + "\n" + featureLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invoice-${school?.domain ?? "school"}-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-6 h-6 text-accent" />
          <h1 className="font-display text-3xl">School invoice</h1>
        </div>

        <Card className="p-5 flex flex-wrap items-end gap-4">
          {schools.length > 1 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">School</div>
              <Select value={schoolId ?? undefined} onValueChange={setSchoolId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Pick school" /></SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name ?? s.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Month</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={downloadCsv} disabled={!rows.length} className="ml-auto">
            <Download className="w-4 h-4 mr-2" />CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!rows.length}>
            <FileText className="w-4 h-4 mr-2" />Print / PDF
          </Button>
        </Card>

        {school && (
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Invoice for</div>
                <div className="font-display text-2xl">{school.name ?? school.domain}</div>
                <div className="text-sm text-muted-foreground">{monthLabel} · {school.domain}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total estimated cost</div>
                <div className="font-display text-3xl">${totals.cost.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{totals.events} AI actions · {perUser.length} teachers</div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="font-semibold mb-3">By teacher</div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-2">Teacher</th><th>AI actions</th><th>Units</th><th>Credits</th><th className="text-right">Cost</th></tr>
              </thead>
              <tbody>
                {perUser.map(([uid, t]) => (
                  <tr key={uid} className="border-t border-border">
                    <td className="py-2">{userEmails[uid] ?? uid}</td>
                    <td>{t.events}</td>
                    <td>{t.units}</td>
                    <td>{t.credits}</td>
                    <td className="text-right">${t.cost.toFixed(4)}</td>
                  </tr>
                ))}
                {!perUser.length && <tr><td colSpan={5} className="py-4 text-muted-foreground text-center">No usage this month.</td></tr>}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <div className="font-semibold mb-3">By AI feature</div>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left">
              <tr><th className="py-2">Feature</th><th>Calls</th><th>Units</th><th className="text-right">Cost</th></tr>
            </thead>
            <tbody>
              {perFeature.map(([fn, t]) => (
                <tr key={fn} className="border-t border-border">
                  <td className="py-2 font-mono text-xs">{fn}</td>
                  <td>{t.events}</td>
                  <td>{t.units}</td>
                  <td className="text-right">${t.cost.toFixed(4)}</td>
                </tr>
              ))}
              {!perFeature.length && <tr><td colSpan={4} className="py-4 text-muted-foreground text-center">No usage this month.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
