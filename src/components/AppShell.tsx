import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sparkles, BookOpen, LogOut, Library, Settings, School, Inbox, CreditCard, GraduationCap, Globe, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import FeedbackDialog from "@/components/FeedbackDialog";

function trialDaysLeft(startIso: string): number {
  const end = new Date(startIso).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ sponsored: boolean; daysLeft: number; sub: string } | null>(null);
  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("school_sponsored, trial_started_at, subscription_status")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setStatus({
          sponsored: !!data.school_sponsored,
          daysLeft: trialDaysLeft(data.trial_started_at),
          sub: data.subscription_status,
        });
      });
    supabase.from("school_admins").select("school_id").eq("user_id", user.id).then(({ data }) => {
      setIsSchoolAdmin(!!data?.length);
    });
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="font-display text-xl">SmartComment</span>
          </Link>
          <nav className="flex items-center gap-1 ml-auto shrink-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><BookOpen className="w-4 h-4 mr-1.5" />Classes</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/style-bank"><Library className="w-4 h-4 mr-1.5" />Style bank</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/requirements"><Settings className="w-4 h-4 mr-1.5" />Requirements</Link>
            </Button>
            <FeedbackDialog />
            {/* Invoice + Domains nav links temporarily hidden until ready to roll out to school admins.
                Routes still work directly for testing: /school/invoice and /admin/domains */}
            {user?.email?.toLowerCase() === "ccborchers@gmail.com" && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/feedback"><Inbox className="w-4 h-4 mr-1.5" />Inbox</Link>
              </Button>
            )}
            {status && (
              <Link to="/billing" className="shrink-0">
                {status.sponsored ? (
                  <Badge className="bg-accent text-accent-foreground gap-1">
                    <GraduationCap className="w-3 h-3" />School
                  </Badge>
                ) : status.sub === "active" ? (
                  <Badge variant="secondary" className="gap-1">
                    <CreditCard className="w-3 h-3" />Pro
                  </Badge>
                ) : status.daysLeft > 0 ? (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="w-3 h-3" />Trial · {status.daysLeft}d
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    Trial ended
                  </Badge>
                )}
              </Link>
            )}
            <span className="hidden sm:inline text-sm text-muted-foreground mx-3">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
