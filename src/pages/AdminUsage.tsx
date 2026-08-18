import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, FileText, ShieldCheck } from "lucide-react";

type Row = {
  user_id: string;
  function_name: string;
  units: number;
  credits_used: number;
  cost_usd_estimate: number;
  attributed_domain: string | null;
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

export default function AdminUsage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].value);
  const [suffix, setSuffix] = useState("");
  const [appliedSuffix, setAppliedSuffix] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = () => {
    setAppliedSuffix(suffix.trim().toLowerCase().replace(/^@/, ""));
    setSearched(true);
  };

  useEffect(() => {
    if (!isSuperAdmin || !searched || !appliedSuffix) { setRows([]); return; }
    setLoading(true);
    const { start, end } = rangeFor(month);
    (async () => {
      const PAGE = 1000;
      const all: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("usage_events")
          .select("user_id, function_name, units, credits_used, cost_usd_estimate, attributed_domain, created_at")
          .gte("created_at", start)
          .lt("created_at", end)
          .ilike("attributed_domain", `%${appliedSuffix}`)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data?.length) break;
        all.push(...(data as Row[]));
        if (data.length < PAGE) break;
        if (all.length >= 100000) break; // safety cap
      }
      setRows(all);

      const uids = Array.from(new Set(all.map((r) => r.user_id)));
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", uids);
        const m: Record<string, string> = {};
        (profs ?? []).forEach((p) => { m[p.id] = p.full_name ? `${p.full_name} <${p.email}>` : (p.email ?? p.id); });
        setUserEmails(m);
      } else {
        setUserEmails({});
      }
      setLoading(false);
    })();
  }, [isSuperAdmin, searched, appliedSuffix, month]);

  const perUser = useMemo(() => {
    const map = new Map<string, { events: number; units: number; credits: number; cost: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.user_id) ?? { events: 0, units: 0, credits: 0, cost: 0 };
      cur.events++; cur.units += r.units; cur.credits += r.credits_used; cur.cost += Number(r.cost_usd_estimate);
      map.set(r.user_id, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);

  const totals = useMemo(() => {
    const t = { events: 0, units: 0, credits: 0, cost: 0 };
    rows.forEach((r) => {
      t.events++; t.units += r.units; t.credits += r.credits_used; t.cost += Number(r.cost_usd_estimate);
    });
    return t;
  }, [rows]);

  const monthLabel = months.find((m) => m.value === month)?.label ?? month;

  const downloadCsv = () => {
    const header = "teacher,ai_actions,units,credits,cost_usd\n";
    const lines = perUser.map(([uid, t]) => `"${(userEmails[uid] ?? uid).replace(/"/g, '""')}",${t.events},${t.units},${t.credits},${t.cost.toFixed(6)}`);
    const blob = new Blob([header + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${appliedSuffix || "filtered"}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperAdmin) {
    return <AppShell><div className="text-muted-foreground">Not authorised.</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-accent" />
          <h1 className="font-display text-3xl">Usage by email domain</h1>
        </div>
        <p className="text-muted-foreground text-sm -mt-4">
          Filter usage by email suffix for manual/interim billing — no school registration required.
        </p>

        <Card className="p-5 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="suffix" className="text-xs text-muted-foreground">Email suffix</Label>
            <Input
              id="suffix"
              className="w-64"
              placeholder="e.g. theschool.edu"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Month</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSearch} disabled={!suffix.trim()}>Search</Button>
          <Button variant="outline" onClick={downloadCsv} disabled={!rows.length} className="ml-auto">
            <Download className="w-4 h-4 mr-2" />CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!rows.length}>
            <FileText className="w-4 h-4 mr-2" />Print / PDF
          </Button>
        </Card>

        {searched && appliedSuffix && (
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Usage for domains ending in</div>
                <div className="font-display text-2xl font-mono">{appliedSuffix}</div>
                <div className="text-sm text-muted-foreground">{monthLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total estimated AI cost</div>
                <div className="font-display text-3xl">${totals.cost.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{totals.events} AI actions · {perUser.length} teachers</div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="font-semibold mb-3">By teacher</div>
          {!searched ? (
            <div className="text-sm text-muted-foreground text-center py-4">Enter an email suffix and search.</div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-2">Teacher</th><th>AI actions</th><th>Units</th><th>Credits</th><th className="text-right">Cost (raw AI cost, no markup)</th></tr>
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
                {!perUser.length && <tr><td colSpan={5} className="py-4 text-muted-foreground text-center">No usage for this domain/month.</td></tr>}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
