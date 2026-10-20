import { Link } from "wouter";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";
import { LEGAL_POINTS, LEGAL_SOURCES, LEGAL_STAND } from "@/lib/grow-legal";

/** /grow/recht – the KCanG in plain words, as information with its sources. */
export default function GrowRechtPage() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/grow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Grow
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Grow · ab 18</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-primary" />
          Rechtliches
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Die wichtigsten Regeln zum privaten Eigenanbau in Deutschland nach dem Konsumcannabisgesetz (KCanG). Stand: {LEGAL_STAND}.
        </p>
      </div>
      <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        Unverbindliche Information, keine Rechtsberatung. Gesetze ändern sich – maßgeblich ist der aktuelle Gesetzestext. Im Zweifel bei einer Anwältin oder einem Anwalt nachfragen.
      </p>
      <ul className="space-y-3">
        {LEGAL_POINTS.map((p) => (
          <li key={p.title} className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
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
