import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Feedback = {
  id: string;
  email: string | null;
  category: string;
  message: string;
  page: string | null;
  created_at: string;
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Feedback[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!isSuperAdmin) {
    return (
      <AppShell>
        <p className="text-muted-foreground">You don't have access to this page.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">Feedback inbox</h1>
          <p className="text-muted-foreground">All user-submitted feedback and suggestions.</p>
        </div>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No feedback yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((f) => (
              <Card key={f.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="secondary">{f.category}</Badge>
                      <span className="text-sm text-muted-foreground">{f.email ?? "anonymous"}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(f.created_at).toLocaleString()} · {f.page ?? "—"}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{f.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
