import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Leaf, ShoppingBag, Sparkles } from "lucide-react";
import { BENEFICIALS, PROBLEMS, measuresFor, problemById, type BeneficialId, type Measure, type ProblemId } from "@/lib/beneficials";

function MeasureCard({ measure, open, onToggle }: { measure: Measure; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border bg-card" id={`massnahme-${measure.id}`}>
      <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{measure.title}</p>
          <p className="text-sm text-muted-foreground">{measure.short}</p>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 pb-3 pt-2">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {measure.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {measure.season}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Nützlinge-Ratgeber (docs/schaedlinge.md): pick a problem, see which
 * beneficials help and what to do so they settle in the garden.
 */
export function BeneficialsGuide({ initialProblem, initialBeneficial }: { initialProblem?: string | null; initialBeneficial?: string | null }) {
  const fromBeneficial = initialBeneficial && initialBeneficial in BENEFICIALS ? (initialBeneficial as BeneficialId) : null;
  const start = problemById(initialProblem)?.id ?? (fromBeneficial ? PROBLEMS.find((p) => p.beneficials.includes(fromBeneficial))?.id : undefined) ?? "aphids";
  const [problemId, setProblemId] = useState<ProblemId>(start);
  const [focus, setFocus] = useState<BeneficialId | null>(fromBeneficial);
  const [openMeasure, setOpenMeasure] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  const problem = problemById(problemId)!;
  const helpers = focus ? [focus] : problem.beneficials;
  const measures = measuresFor(helpers);

  useEffect(() => {
    if (fromBeneficial) focusRef.current?.scrollIntoView({ block: "start" });
  }, [fromBeneficial]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
          <Leaf className="h-4 w-4" />
          Nützlinge arbeiten für dich
        </p>
        <p className="mt-1 text-foreground/80">
          Wähle, wobei du Hilfe brauchst. Die App zeigt, welche Tiere das von selbst erledigen – und was du tun kannst, damit sie in deinen Garten kommen und bleiben.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Wobei brauchst du Hilfe?</h3>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Problem wählen">
          {PROBLEMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === problemId && !focus}
              onClick={() => {
                setProblemId(p.id);
                setFocus(null);
                setOpenMeasure(null);
              }}
              className={`rounded-xl border p-2.5 text-left transition-colors ${p.id === problemId && !focus ? "border-primary bg-primary/10" : "bg-card hover:border-primary"}`}
            >
              <span className="block text-sm font-medium">{p.title}</span>
              <span className="block text-xs text-muted-foreground">{p.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <div ref={focusRef} className="scroll-mt-20 space-y-5">
        {!focus && (
          <p className="rounded-xl bg-muted/60 p-3 text-sm">
            <span className="font-medium">Als Erstes: </span>
            {problem.first}
          </p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{focus ? "Dieser Nützling" : `Diese Nützlinge helfen bei „${problem.title}“`}</h3>
          <div className="space-y-2">
            {helpers.map((id) => {
              const b = BENEFICIALS[id];
              return (
                <div key={id} className="rounded-xl border bg-card p-3" data-testid={`beneficial-${id}`}>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted-foreground">{b.helps}</p>
                  {b.fact && <p className="mt-1 flex gap-1.5 text-xs text-emerald-800 dark:text-emerald-300"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />{b.fact}</p>}
                  {b.buy && <p className="mt-1 flex gap-1.5 text-xs text-muted-foreground"><ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0" />Zu kaufen: {b.buy}</p>}
                </div>
              );
            })}
          </div>
          {focus && (
            <button type="button" className="text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => setFocus(null)}>
              Alle Nützlinge bei „{problem.title}“ zeigen
            </button>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">So holst du sie in deinen Garten</h3>
          <div className="space-y-2">
            {measures.map((m) => (
              <MeasureCard key={m.id} measure={m} open={openMeasure === m.id} onToggle={() => setOpenMeasure(openMeasure === m.id ? null : m.id)} />
            ))}
          </div>
        </section>
        <p className="text-xs text-muted-foreground">Zahlen sind Richtwerte – Gärten, Lagen und Jahre sind verschieden.</p>
      </div>
    </div>
  );
}
