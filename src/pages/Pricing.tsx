import { Link } from "react-router-dom";
import { useEffect } from "react";
import PublicLayout from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Repeat } from "lucide-react";

const SUBSCRIPTION = {
  name: "Teacher Monthly",
  price: "R49",
  credits: 2000,
  rollover: 4000,
};

const PACKS = [
  { name: "Starter", credits: 500, price: "R89", per: "R0.18 / credit" },
  { name: "Standard", credits: 2000, price: "R329", per: "R0.16 / credit", popular: true },
  { name: "Bulk", credits: 10000, price: "R1,449", per: "R0.14 / credit" },
];

export default function Pricing() {
  useEffect(() => {
    document.title = "Pricing — SmartComment";
    const desc = "Simple, one-time credit packs. No subscription. Credits never expire.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  return (
    <PublicLayout>
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
        <h1 className="font-display text-5xl mb-4">Pricing that fits how you teach</h1>
        <p className="text-muted-foreground text-lg">
          Start free with 200 credits. Subscribe for a monthly allowance, or top up
          with a one-time pack whenever you need more.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-8">
        <Card className="p-8 border-accent">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <Repeat className="w-5 h-5 text-accent" />
                <div className="font-display text-2xl">{SUBSCRIPTION.name}</div>
                <Badge className="bg-accent text-accent-foreground">Most popular</Badge>
              </div>
              <div className="font-display text-5xl mt-3">
                {SUBSCRIPTION.price}
                <span className="text-lg font-sans text-muted-foreground"> / month</span>
              </div>
              <ul className="text-sm text-muted-foreground mt-4 space-y-1">
                <li>• {SUBSCRIPTION.credits.toLocaleString()} credits every month</li>
                <li>• Rolls over up to {SUBSCRIPTION.rollover.toLocaleString()} credits</li>
                <li>• Pause anytime for holidays or off-season months</li>
                <li>• Top up with a credit pack if you run out mid-month</li>
              </ul>
            </div>
            <Button size="lg" asChild>
              <Link to="/auth"><Repeat className="w-4 h-4" />Subscribe</Link>
            </Button>
          </div>
        </Card>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-4 text-center">
        <div className="text-sm uppercase tracking-wide text-muted-foreground">Or pay as you go</div>
      </section>


      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {PACKS.map((p) => (
            <Card key={p.name} className={`p-6 flex flex-col ${p.popular ? "border-accent" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-display text-xl">{p.name}</div>
                {p.popular && <Badge className="bg-accent text-accent-foreground">Best value</Badge>}
              </div>
              <div className="mt-4">
                <div className="font-display text-4xl">{p.price}</div>
                <div className="text-sm text-muted-foreground mt-1">{p.credits.toLocaleString()} credits</div>
                <div className="text-xs text-muted-foreground">{p.per}</div>
              </div>
              <Button className="mt-6" asChild>
                <Link to="/auth"><Zap className="w-4 h-4" />Get started</Link>
              </Button>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-6">
          Payments are processed by Paddle.com, our Merchant of Record. Prices in USD; local
          taxes added at checkout where applicable. See our{" "}
          <Link to="/legal/refunds" className="underline">refund policy</Link>.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <Card className="p-6">
          <div className="font-display text-2xl mb-2">Teacher at a partner school?</div>
          <p className="text-muted-foreground">
            If your school has joined SmartComment, verify your school email after signing up
            and your account is free — forever. No credits used, no charges.
          </p>
        </Card>
      </section>
    </PublicLayout>
  );
}
