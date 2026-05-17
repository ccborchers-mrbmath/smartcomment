import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, GraduationCap, Sparkles } from "lucide-react";

type Profile = {
  school_email: string | null;
  school_email_verified_at: string | null;
  school_sponsored: boolean;
  trial_started_at: string;
  credits_balance: number;
  subscription_status: string;
};

function trialDaysLeft(startIso: string): number {
  const end = new Date(startIso).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function Billing() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("school_email, school_email_verified_at, school_sponsored, trial_started_at, credits_balance, subscription_status")
      .eq("id", user.id)
      .maybeSingle();
    if (data) setProfile(data as Profile);
  };

  useEffect(() => { load(); }, [user]);

  const sendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-school-verification", {
        body: { email: email.trim().toLowerCase(), redirectBase: window.location.origin },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        toast.error((data as any).message ?? (data as any).error);
      } else if ((data as any)?.devLink) {
        toast.success("Email service not configured — opening verification link directly.");
        window.location.href = (data as any).devLink;
      } else {
        toast.success(`Check ${email} for a verification link.`);
        setEmail("");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Could not send verification");
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;
  }

  const sponsored = profile.school_sponsored;
  const daysLeft = trialDaysLeft(profile.trial_started_at);
  const inTrial = profile.subscription_status === "trialing" && daysLeft > 0;

  return (
    <AppShell>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-4xl mb-1">Billing</h1>
          <p className="text-muted-foreground">Plan, credits, and school sponsorship.</p>
        </div>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Current plan</div>
              <div className="font-display text-2xl mt-1 flex items-center gap-2">
                {sponsored ? (
                  <>School sponsored <Badge className="bg-accent text-accent-foreground">Free</Badge></>
                ) : inTrial ? (
                  <>Free trial <Badge variant="secondary">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</Badge></>
                ) : profile.subscription_status === "active" ? (
                  <>Subscribed</>
                ) : (
                  <>Trial ended</>
                )}
              </div>
              {sponsored && profile.school_email && (
                <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  Verified as {profile.school_email}
                </div>
              )}
            </div>
            {!sponsored && (
              <Button disabled title="Coming soon">
                <Sparkles className="w-4 h-4" />
                Subscribe (coming soon)
              </Button>
            )}
          </div>
        </Card>

        {!sponsored && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-5 h-5 text-accent" />
              <h2 className="font-display text-xl">Teacher at a partner school?</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Verify your school email and your account is free — forever. You'll keep signing in
              with {user?.email}; this just links your school for billing purposes.
            </p>
            <form onSubmit={sendVerification} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="school-email" className="sr-only">School email</Label>
                <Input
                  id="school-email"
                  type="email"
                  placeholder="jane@yourschool.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send verification link"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-3">
              Don't see your school?{" "}
              <a href="/school" className="underline">Ask your admin to claim the domain.</a>
            </p>
          </Card>
        )}

        <Card className="p-6">
          <div className="text-sm text-muted-foreground">Credits balance</div>
          <div className="font-display text-3xl mt-1">{profile.credits_balance.toLocaleString()}</div>
          <p className="text-sm text-muted-foreground mt-2">
            {sponsored
              ? "Sponsored accounts have unlimited AI usage."
              : "Credits are used by AI features (generate, rewrite, transcribe, OCR)."}
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
