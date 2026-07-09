import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

const OWNER_EMAIL = "ccborchers@gmail.com";

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Owner gets full access
  if (user && user.email?.toLowerCase() === OWNER_EMAIL) {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() !== OWNER_EMAIL) {
      toast.error("This app is in maintenance mode.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-warm flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 justify-center mb-6 text-foreground">
          <Sparkles className="w-5 h-5 text-accent" />
          <span className="font-display text-2xl">SmartComment</span>
        </div>

        <Card className="p-8 shadow-elevated border-border/50 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-5">
            <Wrench className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl mb-3">
            We're temporarily out of action
          </h1>
          <p className="text-muted-foreground text-lg mb-2">
            SmartComment is undergoing maintenance right now.
          </p>
          <p className="text-muted-foreground mb-6">
            Sign-ups and sign-ins are paused. Please check back soon — thank you for your patience.
          </p>

          {user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You're signed in as <span className="text-foreground font-medium">{user.email}</span>,
                but access is restricted during maintenance.
              </p>
              <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
            </div>
          ) : showLogin ? (
            <form onSubmit={handleOwnerLogin} className="space-y-4 text-left mt-4">
              <div>
                <Label htmlFor="owner-email">Email</Label>
                <Input
                  id="owner-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="owner-password">Password</Label>
                <Input
                  id="owner-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} className="flex-1">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowLogin(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-4"
            >
              Owner sign-in
            </button>
          )}
        </Card>
      </div>
    </main>
  );
}
