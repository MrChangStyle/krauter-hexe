
import { ExternalLink } from "lucide-react";
import { LEGAL_POINTS, LEGAL_SOURCES, LEGAL_STAND } from "@/lib/grow-legal";
import { PageHeader } from "@/components/page-header";

/** /grow/recht – the KCanG in plain words, as information with its sources. */
export default function GrowRechtPage() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="grow-recht" subtitle={<>Die wichtigsten Regeln zum privaten Eigenanbau in Deutschland nach dem Konsumcannabisgesetz (KCanG). Stand: {LEGAL_STAND}.</>} />
      <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        Unverbindliche Information, keine Rechtsberatung. Gesetze ändern sich – maßgeblich ist der aktuelle Gesetzestext. Im Zweifel bei einer Anwältin oder einem Anwalt nachfragen.
      </p>
      <ul className="space-y-3">
        {LEGAL_POINTS.map((p) => (
          <li key={p.title} className="space-y-1 rounded-2xl border bg-card p-4 text-sm">
            <h2 className="font-semibold">{p.title}</h2>
            <p>{p.text}</p>
            <p className="text-xs text-muted-foreground">{p.ref}</p>
          </li>
        ))}
      </ul>
      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Quellen</h2>
        <ul className="space-y-1.5">
          {LEGAL_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                {s.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
