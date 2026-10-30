import { Link, useParams } from "wouter";
import { ShoppingBag, Sparkles } from "lucide-react";
import { BENEFICIAL_LOOK, BackToGuide, BeneficialRow, GuideHeader, MeasureList, PROBLEM_LOOK, problemHref } from "@/components/beneficials-guide";
import { BENEFICIALS, beneficialById, measuresFor, problemById, problemsForBeneficial } from "@/lib/beneficials";

function NotFound() {
  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      <BackToGuide />
      <p className="text-sm text-muted-foreground py-8 text-center">Diese Seite gibt es nicht.</p>
    </div>
  );
}

/** /schaedlinge/hilfe/:problem – which beneficials help, and what to do (docs/schaedlinge.md). */
export function ProblemPage() {
  const problem = problemById(useParams<{ problem: string }>().problem);
  if (!problem) return <NotFound />;
  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <BackToGuide />
      <GuideHeader look={PROBLEM_LOOK[problem.id]} title={problem.title} hint={problem.hint} />
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="font-semibold text-emerald-900 dark:text-emerald-200">Als Erstes</p>
        <p className="mt-1 text-foreground/80">{problem.first}</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Diese Nützlinge helfen</h2>
        <div className="space-y-2">
          {problem.beneficials.map((id) => (
            <BeneficialRow key={id} beneficial={BENEFICIALS[id]} />
          ))}
        </div>
      </section>
      <MeasureList measures={measuresFor(problem.beneficials)} />
    </div>
  );
}

/** /schaedlinge/nuetzling/:id – one beneficial and how to attract it. */
export function BeneficialPage() {
  const b = beneficialById(useParams<{ id: string }>().id);
  if (!b) return <NotFound />;
  const helpsWith = problemsForBeneficial(b.id);
  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <BackToGuide />
      <GuideHeader look={BENEFICIAL_LOOK[b.id]} title={b.name} hint="Nützling" />
      <div className="rounded-2xl border bg-card p-4 space-y-2 text-sm">
        <p>{b.helps}</p>
        {b.fact && (
          <p className="flex gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {b.fact}
          </p>
        )}
        {b.buy && (
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Zu kaufen: {b.buy}
          </p>
        )}
      </div>
      {helpsWith.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Hilft bei</h2>
          <div className="flex flex-wrap gap-2">
            {helpsWith.map((p) => (
              <Link key={p.id} href={problemHref(p.id)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                {p.title}
              </Link>
            ))}
          </div>
        </section>
      )}
      <MeasureList measures={measuresFor([b.id])} />
    </div>
  );
}
