import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type MyFeedback = {
  id: string;
  category: string;
  message: string;
  created_at: string;
};

type Reply = {
  id: string;
  feedback_id: string;
  message: string;
  created_at: string;
};

export default function FeedbackDialog() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<MyFeedback[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [unreadCount, setUnreadCount] = useState(0);

  const lastSeenKey = user ? `feedback_replies_seen_${user.id}` : "";

  const loadMine = async () => {
    if (!user) return;
    const { data: fb } = await supabase
      .from("feedback")
      .select("id, category, message, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const list = (fb as MyFeedback[]) ?? [];
    setMine(list);
    if (list.length) {
      const { data: rp } = await supabase
        .from("feedback_replies")
        .select("*")
        .in("feedback_id", list.map((f) => f.id))
        .order("created_at", { ascending: true });
      const grouped: Record<string, Reply[]> = {};
      const all = (rp as Reply[]) ?? [];
      all.forEach((r) => { (grouped[r.feedback_id] ||= []).push(r); });
      setReplies(grouped);

      const lastSeen = lastSeenKey ? Number(localStorage.getItem(lastSeenKey) || 0) : 0;
      setUnreadCount(all.filter((r) => new Date(r.created_at).getTime() > lastSeen).length);
    } else {
      setReplies({});
      setUnreadCount(0);
    }
  };

  useEffect(() => { loadMine(); }, [user?.id]);

  useEffect(() => {
    if (open && lastSeenKey) {
      localStorage.setItem(lastSeenKey, String(Date.now()));
      setUnreadCount(0);
    }
  }, [open, lastSeenKey]);

  const submit = async () => {
    if (!message.trim() || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      email: user.email,
      category,
      message: message.trim(),
      page: location.pathname,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not send feedback");
      return;
    }
    toast.success("Thanks for your feedback!");
    setMessage("");
    setCategory("suggestion");
    loadMine();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <MessageSquarePlus className="w-4 h-4 mr-1.5" />
          Feedback
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-semibold rounded-full bg-primary text-primary-foreground h-4 min-w-4 px-1">
              {unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription>
            Send a new note or view replies to your previous feedback.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={unreadCount > 0 ? "replies" : "new"}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="new">New</TabsTrigger>
            <TabsTrigger value="replies">
              Replies{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your thoughts..."
                rows={5}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting || !message.trim()}>
                {submitting ? "Sending..." : "Send"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="replies">
            <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">You haven't sent any feedback yet.</p>
              ) : (
                mine.map((f) => {
                  const thread = replies[f.id] ?? [];
                  return (
                    <div key={f.id} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{f.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(f.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{f.message}</p>
                      {thread.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No reply yet.</p>
                      ) : (
                        <div className="space-y-2 border-l-2 border-primary/40 pl-3 mt-2">
                          {thread.map((r) => (
                            <div key={r.id} className="bg-muted/50 rounded-md p-2">
                              <p className="text-[11px] text-muted-foreground mb-1">
                                Reply · {new Date(r.created_at).toLocaleString()}
                              </p>
                              <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
