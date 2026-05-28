import { Link } from "react-router-dom";
import { useEffect } from "react";
import PublicLayout from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, BookOpen, Mic, ScanLine, Wand2 } from "lucide-react";

const FEATURES = [
  { icon: Wand2, title: "Generate report comments", body: "Turn quick notes and marks into polished, on-voice comments in seconds." },
  { icon: Mic, title: "Voice notes, transcribed", body: "Dictate observations between lessons — we transcribe and tidy them up." },
  { icon: ScanLine, title: "OCR handwriting", body: "Snap a page of marking and pull the text straight into the student's record." },
  { icon: BookOpen, title: "Class-wide review", body: "Edit, spellcheck and export a full set of comments in one workflow." },
];

export default function Landing() {
  useEffect(() => {
    document.title = "SmartComment — AI report comments for teachers";
    const desc = "Write better student report comments in a fraction of the time. Voice notes, OCR, and AI generation built for teachers.";
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
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted-foreground mb-6">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          Built for teachers, by a teacher
        </div>
        <h1 className="font-display text-5xl sm:text-6xl tracking-tight mb-6 max-w-3xl mx-auto">
          Report comments that sound like <em>you</em>, in a fraction of the time.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          SmartComment turns your voice notes, marks and observations into polished student
          report comments — in your voice, ready to export.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button size="lg" asChild><Link to="/auth">Start free — 200 credits</Link></Button>
          <Button size="lg" variant="ghost" asChild><Link to="/pricing">See pricing</Link></Button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <f.icon className="w-5 h-5 text-accent mb-3" />
              <div className="font-display text-lg mb-1">{f.title}</div>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20 text-center">
        <h2 className="font-display text-3xl mb-3">Free for partner schools</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          If your school has signed up, verify your school email and SmartComment is free —
          forever. Otherwise, start with 200 free credits and top up only when you need more.
        </p>
        <Button className="mt-6" asChild><Link to="/pricing">View credit packs</Link></Button>
      </section>
    </PublicLayout>
  );
}
