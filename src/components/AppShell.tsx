import { Link, useNavigate } from "react-router-dom";
import { Sparkles, BookOpen, LogOut, Library, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="font-display text-xl">SmartComment</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><BookOpen className="w-4 h-4 mr-1.5" />Classes</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/style-bank"><Library className="w-4 h-4 mr-1.5" />Style bank</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/requirements"><Settings className="w-4 h-4 mr-1.5" />Requirements</Link>
            </Button>
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
