import { useEffect } from "react";
import PublicLayout from "@/components/PublicLayout";

export default function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} — SmartComment`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
  }, [title, description]);

  return (
    <PublicLayout>
      <article className="max-w-3xl mx-auto px-6 py-16 prose prose-neutral dark:prose-invert prose-headings:font-display prose-h1:text-4xl prose-h2:text-2xl prose-h2:mt-10 prose-h3:text-lg prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-accent">
        <h1>{title}</h1>
        <p className="text-sm not-prose text-muted-foreground">Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
        {children}
      </article>
    </PublicLayout>
  );
}
