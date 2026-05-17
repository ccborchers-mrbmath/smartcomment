import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function VerifySchool() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");
  const [school, setSchool] = useState<{ name: string; domain: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!token) { setState("error"); setMessage("Missing token."); return; }
    if (!user) { navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("confirm-school-verification", {
          body: { token },
        });
        if (error) throw error;
        const d = data as any;
        if (d?.error) { setState("error"); setMessage(d.error); return; }
        setSchool(d.school);
        setState("ok");
      } catch (e: any) {
        setState("error");
        setMessage(e.message ?? "Verification failed.");
      }
    })();
  }, [token, user, loading, navigate]);

  return (
    <AppShell>
      <div className="max-w-md mx-auto mt-12">
        <Card className="p-8 text-center">
          {state === "working" && (
            <>
              <Loader2 className="w-10 h-10 mx-auto text-muted-foreground animate-spin mb-4" />
              <h1 className="font-display text-2xl mb-2">Verifying your school email…</h1>
              <p className="text-muted-foreground">One moment.</p>
            </>
          )}
          {state === "ok" && (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-accent mb-4" />
              <h1 className="font-display text-2xl mb-2">You're all set!</h1>
              <p className="text-muted-foreground mb-6">
                {school ? <>Linked to <strong>{school.name}</strong>. </> : null}
                Your account is now sponsored — free AI usage, forever.
              </p>
              <Button onClick={() => navigate("/billing")}>Go to billing</Button>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h1 className="font-display text-2xl mb-2">We couldn't verify that link</h1>
              <p className="text-muted-foreground mb-6">{message}</p>
              <Button variant="outline" onClick={() => navigate("/billing")}>Back to billing</Button>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
