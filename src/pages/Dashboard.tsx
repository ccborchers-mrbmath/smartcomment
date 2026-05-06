import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, ArrowRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import { formatDistanceToNow } from "date-fns";

type ClassRow = {
  id: string;
  name: string;
  year_grade: string | null;
  subject: string | null;
  term: string | null;
  created_at: string;
  student_count?: number;
};

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cls } = await supabase
        .from("classes")
        .select("id, name, year_grade, subject, term, created_at")
        .order("created_at", { ascending: false });
      const ids = (cls ?? []).map((c) => c.id);
      let counts: Record<string, number> = {};
      if (ids.length) {
        const { data: studs } = await supabase
          .from("students")
          .select("class_id")
          .in("class_id", ids);
        counts = (studs ?? []).reduce<Record<string, number>>((acc, s) => {
          acc[s.class_id] = (acc[s.class_id] || 0) + 1;
          return acc;
        }, {});
      }
      setClasses((cls ?? []).map((c) => ({ ...c, student_count: counts[c.id] || 0 })));
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl mb-2">Your classes</h1>
          <p className="text-muted-foreground">
            Capture notes throughout the term, then generate report comments at the end.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/classes/new"><Plus className="w-4 h-4 mr-1.5" />New class</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : classes.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-warm border-dashed">
          <h2 className="font-display text-2xl mb-2">No classes yet</h2>
          <p className="text-muted-foreground mb-6">
            Start by uploading a roster — a screenshot, Excel, CSV, or Word file works.
          </p>
          <Button asChild size="lg">
            <Link to="/classes/new"><Plus className="w-4 h-4 mr-1.5" />Create your first class</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`}>
              <Card className="p-5 h-full hover:shadow-elevated transition-shadow group cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-xl leading-tight">{c.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {[c.year_grade, c.subject, c.term].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {c.student_count} {c.student_count === 1 ? "student" : "students"}
                  </span>
                  <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
