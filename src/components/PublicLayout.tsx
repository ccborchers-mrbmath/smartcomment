import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="font-display text-xl">SmartComment</span>
          </Link>
          <nav className="ml-auto flex items-center gap-2 text-sm">
            <Link to="/pricing" className="px-3 py-1.5 hover:text-foreground text-muted-foreground">Pricing</Link>
            {user ? (
              <Button size="sm" asChild><Link to="/app">Open app</Link></Button>
            ) : (
              <>
                <Link to="/auth" className="px-3 py-1.5 hover:text-foreground text-muted-foreground">Sign in</Link>
                <Button size="sm" asChild><Link to="/auth">Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card/30 mt-16">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-6 justify-between text-sm text-muted-foreground">
        <div>
          <div className="font-display text-base text-foreground">SmartComment</div>
          <div className="mt-1">© {new Date().getFullYear()} Christopher Charles Borchers. All rights reserved.</div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/legal/refunds" className="hover:text-foreground">Refunds</Link>
        </nav>
      </div>
    </footer>
  );
}
