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
const ALLOWED_EMAILS = [OWNER_EMAIL, "joyfullhart@gmail.com"];

function isAllowedEmail(email?: string | null) {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

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

  // Owner / test staff get full access
  if (user && isAllowedEmail(user.email)) {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllowedEmail(email.trim())) {
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
            <div className="space-y-4 mt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: window.location.origin },
                  });
                  if (error) {
                    toast.error("Google sign-in failed");
                    setBusy(false);
                  }
                }}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-card px-3 text-muted-foreground">or</span>
                </div>
              </div>

              <form onSubmit={handleOwnerLogin} className="space-y-4 text-left">
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
            </div>

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
