import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { toast } from "sonner";

const PACKS = [
  { key: "starter", priceId: "credits_starter_onetime", name: "Starter", credits: 500, price: "$5" },
  { key: "standard", priceId: "credits_standard_onetime", name: "Standard", credits: 2000, price: "$18", popular: true },
  { key: "bulk", priceId: "credits_bulk_onetime", name: "Bulk", credits: 10000, price: "$80" },
];

type Ctx = { openBuyCredits: (balance?: number) => void };
const BuyCreditsCtx = createContext<Ctx>({ openBuyCredits: () => {} });

export function BuyCreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const { openCheckout, loading } = usePaddleCheckout();
  const [pending, setPending] = useState<string | null>(null);

  const openBuyCredits = useCallback((b?: number) => {
    setBalance(b ?? null);
    setOpen(true);
  }, []);

  const buy = async (pack: typeof PACKS[number]) => {
    if (!user) return;
    setPending(pack.key);
    try {
      await openCheckout({
        priceId: pack.priceId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}${window.location.pathname}?purchase=success`,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Could not open checkout");
    } finally {
      setPending(null);
    }
  };

  return (
    <BuyCreditsCtx.Provider value={{ openBuyCredits }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">You're out of credits</DialogTitle>
            <DialogDescription>
              {balance !== null
                ? `Your balance is ${balance.toLocaleString()} credits.`
                : ""}{" "}
              Pick a top-up to keep generating. Credits never expire.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-3 gap-3 mt-2">
            {PACKS.map((pack) => (
              <Card key={pack.key} className={`p-4 flex flex-col ${pack.popular ? "border-accent" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg">{pack.name}</div>
                  {pack.popular && <Badge className="bg-accent text-accent-foreground">Best value</Badge>}
                </div>
                <div className="mt-2">
                  <div className="font-display text-2xl">{pack.price}</div>
                  <div className="text-sm text-muted-foreground">{pack.credits.toLocaleString()} credits</div>
                </div>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => buy(pack)}
                  disabled={loading && pending === pack.key}
                >
                  <Zap className="w-4 h-4" />
                  {loading && pending === pack.key ? "Opening…" : "Buy"}
                </Button>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </BuyCreditsCtx.Provider>
  );
}

export const useBuyCredits = () => useContext(BuyCreditsCtx);

/**
 * Inspect a supabase.functions.invoke result; if it's a 402 insufficient_credits
 * error, open the buy-credits dialog and return true (caller should bail).
 */
export function handleInsufficientCredits(
  result: { error?: any; data?: any },
  openBuyCredits: (balance?: number) => void,
): boolean {
  const err = result?.error;
  const data = result?.data;
  const status = err?.context?.status ?? err?.status;
  const payloadErr = (data && typeof data === "object" && "error" in data) ? (data as any).error : null;
  if (status === 402 || payloadErr === "insufficient_credits") {
    const balance = (data as any)?.balance;
    openBuyCredits(typeof balance === "number" ? balance : undefined);
    return true;
  }
  return false;
}
