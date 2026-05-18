import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Download, Globe } from "lucide-react";

type Row = {
  attributed_domain: string | null;
  school_id: string | null;
  events: number;
  units: number;
  credits: number;
  cost: number;
};

export default function AdminDomains() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "sponsored" | "paying">("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoading(true);
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();
    (async () => {
      const { data } = await supabase
        .from("usage_events")
        .select("attributed_domain, school_id, units, credits_used, cost_usd_estimate")
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(50000);
      const map = new Map<string, Row>();
      (data ?? []).forEach((r: any) => {
        const key = r.attributed_domain ?? "(unknown)";
        const cur = map.get(key) ?? { attributed_domain: r.attributed_domain, school_id: r.school_id, events: 0, units: 0, credits: 0, cost: 0 };
        cur.events++; cur.units += r.units; cur.credits += r.credits_used; cur.cost += Number(r.cost_usd_estimate);
        if (r.school_id) cur.school_id = r.school_id;
        map.set(key, cur);
      });
      setRows(Array.from(map.values()).sort((a, b) => b.cost - a.cost));
      setLoading(false);
    })();
  }, [isSuperAdmin, month]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filter === "sponsored") return !!r.school_id;
    if (filter === "paying") return !r.school_id;
    return true;
  }), [rows, filter]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => ({ events: acc.events + r.events, cost: acc.cost + r.cost }),
    { events: 0, cost: 0 }
  ), [filtered]);

  const downloadCsv = () => {
    const header = "domain,sponsored,events,units,credits,cost_usd\n";
    const body = filtered.map((r) => `"${r.attributed_domain ?? ""}",${r.school_id ? "yes" : "no"},${r.events},${r.units},${r.credits},${r.cost.toFixed(6)}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `domains-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperAdmin) {
    return <AppShell><div className="text-muted-foreground">Not authorised.</div></AppShell>;
  }

  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString(undefined, { month: "long", year: "numeric" }),
    });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-accent" />
          <h1 className="font-display text-3xl">Domains</h1>
        </div>

        <Card className="p-5 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Month</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Filter</div>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sponsored">Sponsored (schools)</SelectItem>
                <SelectItem value="paying">Paying / trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">{totals.events} actions</div>
            <div className="font-display text-2xl">${totals.cost.toFixed(2)}</div>
          </div>
          <Button variant="outline" onClick={downloadCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-2" />CSV
          </Button>
        </Card>

        <Card className="p-5">
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-2">Domain</th><th>Type</th><th>Actions</th><th>Credits</th><th className="text-right">Cost</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.attributed_domain ?? "unknown"} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.attributed_domain ?? "(unknown)"}</td>
                    <td>{r.school_id ? "Sponsored" : "Paying / trial"}</td>
                    <td>{r.events}</td>
                    <td>{r.credits}</td>
                    <td className="text-right">${r.cost.toFixed(4)}</td>
                    <td className="text-right">
                      {r.school_id && (
                        <Button size="sm" variant="ghost" onClick={() => navigate("/school/invoice")}>Invoice</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={6} className="py-4 text-muted-foreground text-center">No usage in range.</td></tr>}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
