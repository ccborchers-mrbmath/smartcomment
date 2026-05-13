import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Send } from "lucide-react";
import { toast } from "sonner";

type Feedback = {
  id: string;
  email: string | null;
  category: string;
  message: string;
  page: string | null;
  created_at: string;
};

type Reply = {
  id: string;
  feedback_id: string;
  message: string;
  created_at: string;
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.email?.toLowerCase() === "ccborchers@gmail.com";

  const load = async () => {
    setLoading(true);
    const { data: fb, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (fb as Feedback[]) ?? [];
    setItems(list);

    if (list.length) {
      const { data: rp } = await supabase
        .from("feedback_replies")
        .select("*")
        .in("feedback_id", list.map((f) => f.id))
        .order("created_at", { ascending: true });
      const grouped: Record<string, Reply[]> = {};
      ((rp as Reply[]) ?? []).forEach((r) => {
        (grouped[r.feedback_id] ||= []).push(r);
      });
      setReplies(grouped);
    } else {
      setReplies({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const sendReply = async (feedbackId: string) => {
    const message = (drafts[feedbackId] ?? "").trim();
    if (!message) return;
    setSending((s) => ({ ...s, [feedbackId]: true }));
    const { data, error } = await supabase
      .from("feedback_replies")
      .insert({ feedback_id: feedbackId, message })
      .select()
      .single();
    setSending((s) => ({ ...s, [feedbackId]: false }));
    if (error) return toast.error(error.message);
    setReplies((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] ?? []), data as Reply],
    }));
    setDrafts((d) => ({ ...d, [feedbackId]: "" }));
    toast.success("Reply sent");
  };

  const deleteReply = async (feedbackId: string, replyId: string) => {
    const { error } = await supabase.from("feedback_replies").delete().eq("id", replyId);
    if (error) return toast.error(error.message);
    setReplies((prev) => ({
      ...prev,
      [feedbackId]: (prev[feedbackId] ?? []).filter((r) => r.id !== replyId),
    }));
  };

  if (!isSuperAdmin) {
    return (
      <AppShell>
        <p className="text-muted-foreground">You don't have access to this page.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">Feedback inbox</h1>
          <p className="text-muted-foreground">All user-submitted feedback and suggestions.</p>
        </div>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No feedback yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((f) => {
              const thread = replies[f.id] ?? [];
              return (
                <Card key={f.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="secondary">{f.category}</Badge>
                        <span className="text-sm text-muted-foreground">{f.email ?? "anonymous"}</span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(f.created_at).toLocaleString()} · {f.page ?? "—"}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap">{f.message}</p>

                    {thread.length > 0 && (
                      <div className="space-y-2 border-l-2 border-border pl-4">
                        {thread.map((r) => (
                          <div key={r.id} className="bg-muted/50 rounded-md p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs text-muted-foreground">
                                You · {new Date(r.created_at).toLocaleString()}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => deleteReply(f.id, r.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                            <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Write a reply to this user..."
                        value={drafts[f.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [f.id]: e.target.value }))
                        }
                        rows={2}
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => sendReply(f.id)}
                          disabled={sending[f.id] || !(drafts[f.id] ?? "").trim()}
                        >
                          <Send className="w-4 h-4 mr-1.5" />
                          {sending[f.id] ? "Sending..." : "Send reply"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
