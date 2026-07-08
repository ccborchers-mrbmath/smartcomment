import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, GraduationCap, Repeat, Settings, Sparkles, Zap } from "lucide-react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { getPaddleEnvironment } from "@/lib/paddle";

type Profile = {
  school_email: string | null;
  school_email_verified_at: string | null;
  school_sponsored: boolean;
  trial_started_at: string;
  credits_balance: number;
  subscription_status: string;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  subscription_price_id: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  monthly_credit_allowance: number;
};

type CreditTx = {
  id: string;
  delta: number;
  reason: string;
  pack_key: string | null;
  amount_usd: number | null;
  function_name: string | null;
  created_at: string;
};

const SUBSCRIPTION = {
  priceId: "teacher_monthly",
  name: "Teacher Monthly",
  price: "R49",
  credits: 2000,
  rolloverCap: 4000,
};

const PACKS = [
  { key: "starter", priceId: "credits_starter_onetime", name: "Starter", credits: 500, price: "$5", per: "$0.010 / credit" },
  { key: "standard", priceId: "credits_standard_onetime", name: "Standard", credits: 2000, price: "$18", per: "$0.009 / credit", popular: true },
  { key: "bulk", priceId: "credits_bulk_onetime", name: "Bulk", credits: 10000, price: "$80", per: "$0.008 / credit" },
];

function trialDaysLeft(startIso: string): number {
  const end = new Date(startIso).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}


export default function Billing() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<CreditTx[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const [{ data: prof }, { data: txs }] = await Promise.all([
      supabase
        .from("profiles")
        .select("school_email, school_email_verified_at, school_sponsored, trial_started_at, credits_balance, subscription_status, paddle_subscription_id, paddle_customer_id, subscription_price_id, subscription_current_period_end, subscription_cancel_at_period_end, monthly_credit_allowance")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("id, delta, reason, pack_key, amount_usd, function_name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (prof) setProfile(prof as Profile);
    if (txs) setTransactions(txs as CreditTx[]);
  };


  useEffect(() => { load(); }, [user]);

  // Handle Paddle return URL
  useEffect(() => {
    const purchase = params.get("purchase");
    if (!purchase) return;
    if (purchase === "success") {
      toast.success("Payment received — credits will appear shortly.");
      // Poll a few times: webhook usually lands within seconds.
      let tries = 0;
      const timer = setInterval(async () => {
        tries += 1;
        await load();
        if (tries >= 6) clearInterval(timer);
      }, 2000);
    } else if (purchase === "cancelled") {
      toast("Purchase cancelled.");
    }
    params.delete("purchase");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-school-verification", {
        body: { email: email.trim().toLowerCase(), redirectBase: window.location.origin },
      });
      // supabase-js raises `error` for any non-2xx status. The real reason is in
      // the response body — read it from error.context before falling back.
      let payload: any = data;
      if (error) {
        try {
          payload = await (error as any).context?.json?.();
        } catch { /* ignore */ }
      }
      if (payload?.error) {
        toast.error(payload.message ?? payload.error);
      } else if (error) {
        toast.error(error.message ?? "Could not send verification");
      } else if (payload?.devLink) {
        toast.success("Email service not configured — opening verification link directly.");
        window.location.href = payload.devLink;
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

  const buyPack = async (pack: typeof PACKS[number]) => {
    if (!user) return;
    setPendingPack(pack.key);
    try {
      await openCheckout({
        priceId: pack.priceId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/billing?purchase=success`,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Could not open checkout");
    } finally {
      setPendingPack(null);
    }
  };

  const subscribe = async () => {
    if (!user) return;
    setPendingPack("subscription");
    try {
      await openCheckout({
        priceId: SUBSCRIPTION.priceId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/billing?purchase=success`,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Could not open checkout");
    } finally {
      setPendingPack(null);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("paddle-portal-url", {
        body: { environment: getPaddleEnvironment() },
      });
      if (error || !data?.url) throw new Error(error?.message ?? "Could not open portal");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err.message ?? "Could not open portal");
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
  const isSubscribed =
    !sponsored &&
    profile.subscription_price_id === SUBSCRIPTION.priceId &&
    ["active", "trialing", "past_due"].includes(profile.subscription_status);
  const isPaused = profile.subscription_status === "paused";
  const isCanceled =
    profile.subscription_status === "canceled" &&
    profile.subscription_current_period_end &&
    new Date(profile.subscription_current_period_end) > new Date();
  const periodEndLabel = profile.subscription_current_period_end
    ? new Date(profile.subscription_current_period_end).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
    : null;

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
                ) : isSubscribed ? (
                  <>Teacher Monthly <Badge className="bg-accent text-accent-foreground">{SUBSCRIPTION.price}/mo</Badge></>
                ) : isPaused ? (
                  <>Teacher Monthly <Badge variant="secondary">Paused</Badge></>
                ) : isCanceled ? (
                  <>Teacher Monthly <Badge variant="secondary">Ends {periodEndLabel}</Badge></>
                ) : inTrial ? (
                  <>Free trial <Badge variant="secondary">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</Badge></>
                ) : (
                  <>Pay-as-you-go</>
                )}
              </div>
              {(isSubscribed || isPaused || isCanceled) && periodEndLabel && (
                <div className="text-sm text-muted-foreground mt-2">
                  {isCanceled
                    ? `Access until ${periodEndLabel}.`
                    : profile.subscription_cancel_at_period_end
                    ? `Cancels on ${periodEndLabel}.`
                    : isPaused
                    ? "Paused — resume anytime from the billing portal."
                    : `Next billing: ${periodEndLabel}. ${SUBSCRIPTION.credits.toLocaleString()} credits per cycle, rollover capped at ${SUBSCRIPTION.rolloverCap.toLocaleString()}.`}
                </div>
              )}
              {(isSubscribed || isPaused || isCanceled) && (
                <Button variant="outline" size="sm" className="mt-3" onClick={openPortal} disabled={busy}>
                  <Settings className="w-4 h-4" />
                  Manage subscription
                </Button>
              )}

              {sponsored && profile.school_email && (
                <>
                  <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    Verified as {profile.school_email}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 -ml-2 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      if (!confirm("Unlink your school email? You'll lose sponsored access and will need to re-verify to get it back.")) return;
                      const { error } = await supabase.functions.invoke("unlink-school-email", { body: {} });
                      if (error) toast.error(error.message);
                      else { toast.success("School email unlinked."); load(); }
                    }}
                  >
                    Unlink school email
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground">Credits balance</div>
          <div className="font-display text-3xl mt-1">
            {sponsored ? "Unlimited" : profile.credits_balance.toLocaleString()}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {sponsored
              ? "Sponsored accounts have unlimited AI usage — no credits are deducted."
              : "Credits are used by AI features (generate, rewrite, transcribe, OCR)."}
          </p>
        </Card>

        {!sponsored && !isSubscribed && !isPaused && !isCanceled && (
          <Card className="p-6 border-accent">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-accent" />
                  <h2 className="font-display text-xl">Teacher Monthly</h2>
                  <Badge className="bg-accent text-accent-foreground">Best value</Badge>
                </div>
                <div className="font-display text-3xl mt-2">{SUBSCRIPTION.price}<span className="text-base font-sans text-muted-foreground"> / month</span></div>
                <ul className="text-sm text-muted-foreground mt-3 space-y-1">
                  <li>• {SUBSCRIPTION.credits.toLocaleString()} credits every month</li>
                  <li>• Unused credits roll over, capped at {SUBSCRIPTION.rolloverCap.toLocaleString()}</li>
                  <li>• Pause or cancel anytime from the billing portal</li>
                </ul>
              </div>
              <Button size="lg" onClick={subscribe} disabled={checkoutLoading && pendingPack === "subscription"}>
                <Repeat className="w-4 h-4" />
                {checkoutLoading && pendingPack === "subscription" ? "Opening…" : "Subscribe"}
              </Button>
            </div>
          </Card>
        )}

        {!sponsored && (
          <div>

            <h2 className="font-display text-2xl mb-1">Buy credits</h2>
            <p className="text-muted-foreground mb-4">One-time top-ups. Credits never expire.</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {PACKS.map((pack) => (
                <Card key={pack.key} className={`p-5 flex flex-col ${pack.popular ? "border-accent" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-display text-lg">{pack.name}</div>
                    {pack.popular && <Badge className="bg-accent text-accent-foreground">Best value</Badge>}
                  </div>
                  <div className="mt-3">
                    <div className="font-display text-3xl">{pack.price}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {pack.credits.toLocaleString()} credits
                    </div>
                    <div className="text-xs text-muted-foreground">{pack.per}</div>
                  </div>
                  <Button
                    className="mt-5"
                    onClick={() => buyPack(pack)}
                    disabled={checkoutLoading && pendingPack === pack.key}
                  >
                    <Zap className="w-4 h-4" />
                    {checkoutLoading && pendingPack === pack.key ? "Opening…" : "Buy"}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

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

        {transactions.length > 0 && (
          <Card className="p-6">
            <h2 className="font-display text-xl mb-3">Recent activity</h2>
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">
                      {tx.reason === "purchase"
                        ? `Purchased ${tx.pack_key ?? "credits"} pack`
                        : tx.reason === "spend"
                        ? `Used by ${tx.function_name ?? "AI"}`
                        : tx.reason}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                      {tx.amount_usd != null && ` · $${tx.amount_usd.toFixed(2)}`}
                    </div>
                  </div>
                  <div className={`font-mono ${tx.delta >= 0 ? "text-accent" : "text-muted-foreground"}`}>
                    {tx.delta >= 0 ? "+" : ""}{tx.delta.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
