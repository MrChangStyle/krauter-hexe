

import { KNOWLEDGE } from "@/lib/grow-knowledge";
import { PageHeader } from "@/components/page-header";

/** /grow/wissen – the fixed grow guide: soil, pots, feeding, training, growth, flowering, harvest. */
export default function GrowWissenPage() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="grow-wissen" subtitle="Gärtnerische Grundlagen für den Eigenanbau – von der Erde bis zum Curing." />
      <nav aria-label="Inhalt" className="flex flex-wrap gap-1.5 text-xs">
        {KNOWLEDGE.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-muted">
            {s.title}
          </a>
        ))}
      </nav>
      {KNOWLEDGE.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-4 space-y-2 rounded-2xl border bg-card p-4 text-sm">
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
