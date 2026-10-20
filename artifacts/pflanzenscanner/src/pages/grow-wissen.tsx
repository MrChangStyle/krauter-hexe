import { Link } from "wouter";
import { ArrowLeft, BookOpen } from "lucide-react";
import { KNOWLEDGE } from "@/lib/grow-knowledge";

/** /grow/wissen – the fixed grow guide: soil, pots, feeding, training, growth, flowering, harvest. */
export default function GrowWissenPage() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/grow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Grow
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Grow · ab 18</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookOpen className="h-6 w-6 text-primary" />
          Grow-Wissen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Gärtnerische Grundlagen für den Eigenanbau – von der Erde bis zum Curing.</p>
      </div>
      <nav aria-label="Inhalt" className="flex flex-wrap gap-1.5 text-xs">
        {KNOWLEDGE.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-muted">
            {s.title}
          </a>
        ))}
      </nav>
      {KNOWLEDGE.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-4 space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="font-semibold">{s.title}</h2>
          <p className="text-muted-foreground">{s.intro}</p>
          <dl className="space-y-2">
            {s.points.map((p) => (
              <div key={p.title}>
                <dt className="font-medium">{p.title}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
