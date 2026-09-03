import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  credits_balance: number;
  school_sponsored: boolean;
  billing_override: "billed" | "exempt" | null;
};

type Status = "standard" | "billed" | "exempt";

function statusFor(p: Profile): Status {
  return p.billing_override ?? "standard";
}

export default function AdminUsers() {
  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, credits_balance, school_sponsored, billing_override")
      .order("email");
    setProfiles((data as unknown as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.email?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q));
  }, [profiles, search]);

  const setStatus = async (p: Profile, status: Status) => {
    setUpdating(p.id);
    const { error } = await supabase.functions.invoke("admin-set-billing-status", {
      body: { userId: p.id, status },
    });
    if (error) {
      toast.error("Failed to update status");
    } else {
      setProfiles((prev) => prev.map((row) => row.id === p.id
        ? { ...row, billing_override: status === "standard" ? null : status }
        : row));
      toast.success(`${p.email ?? p.id} set to ${status}`);
    }
    setUpdating(null);
  };

  if (!isSuperAdmin) {
    return <AppShell><div className="text-muted-foreground">Not authorised.</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-accent" />
          <h1 className="font-display text-3xl">Billing status</h1>
        </div>
        <p className="text-muted-foreground text-sm -mt-4">
          Standard = normal credit-gated billing. Billed and Exempt both let a user use AI
          features without sufficient credits while usage stays fully tracked (real cost and
          credit-equivalent, not zeroed) for manual invoicing later — the two are just separate
          labels for your own bookkeeping. "School (verified)" is unrelated: it's set via the
          /verify-school flow for actual partner schools, whose usage is already flat-fee and
          isn't tracked per-user for billing.
        </p>

        <Card className="p-5">
          <div className="space-y-1 mb-4">
            <Label htmlFor="search" className="text-xs text-muted-foreground">Search by name or email</Label>
            <Input id="search" className="w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="teacher@example.com" />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-2">User</th><th>Credits</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const status = statusFor(p);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2">
                        <div>{p.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.email ?? p.id}</div>
                      </td>
                      <td>{p.credits_balance}</td>
                      <td className="space-x-1">
                        {status === "exempt" && <Badge className="bg-accent text-accent-foreground">Exempt</Badge>}
                        {status === "billed" && <Badge variant="secondary">Billed</Badge>}
                        {status === "standard" && <Badge variant="outline">Standard</Badge>}
                        {p.school_sponsored && <Badge variant="outline">School (verified)</Badge>}
                      </td>
                      <td className="text-right">
                        <Select
                          value={status}
                          onValueChange={(v) => setStatus(p, v as Status)}
                          disabled={updating === p.id}
                        >
                          <SelectTrigger className="w-36 ml-auto"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="billed">Billed</SelectItem>
                            <SelectItem value="exempt">Exempt</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={4} className="py-4 text-muted-foreground text-center">No users found.</td></tr>}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
