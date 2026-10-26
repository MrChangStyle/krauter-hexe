import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import { Bird, Bug, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Droplets, Flower2, Hexagon, Home, Leaf, Microscope, PawPrint, Shovel, Snail, Worm } from "lucide-react";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { ShowMoreButton } from "@/components/show-more-button";
import { BENEFICIALS, PROBLEMS, type Beneficial, type BeneficialId, type Measure, type ProblemId } from "@/lib/beneficials";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;
interface Look {
  icon: Icon;
  /** Background and text colour of the icon square, as on the hub tiles. */
  tone: string;
}

const TONE = {
  lime: "bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  stone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
};

export const PROBLEM_LOOK: Record<ProblemId, Look> = {
  aphids: { icon: Bug, tone: TONE.lime },
  "spider-mites": { icon: Microscope, tone: TONE.red },
  slugs: { icon: Snail, tone: TONE.amber },
  caterpillars: { icon: Leaf, tone: TONE.emerald },
  "fungus-gnats": { icon: Home, tone: TONE.sky },
  whitefly: { icon: Bug, tone: TONE.yellow },
  grubs: { icon: Worm, tone: TONE.orange },
  soil: { icon: Shovel, tone: TONE.stone },
  pollination: { icon: Flower2, tone: TONE.pink },
};

export const BENEFICIAL_LOOK: Record<BeneficialId, Look> = {
  ladybird: { icon: Bug, tone: TONE.red },
  lacewing: { icon: Bug, tone: TONE.emerald },
  hoverfly: { icon: Flower2, tone: TONE.yellow },
  earwig: { icon: Bug, tone: TONE.amber },
  "parasitic-wasp": { icon: Bug, tone: TONE.violet },
  "predatory-mite": { icon: Microscope, tone: TONE.sky },
  "ground-beetle": { icon: Bug, tone: TONE.stone },
  hedgehog: { icon: PawPrint, tone: TONE.orange },
  toad: { icon: Droplets, tone: TONE.teal },
  birds: { icon: Bird, tone: TONE.sky },
  nematodes: { icon: Microscope, tone: TONE.stone },
  earthworm: { icon: Worm, tone: TONE.rose },
  "wild-bees": { icon: Hexagon, tone: TONE.amber },
};

export const problemHref = (id: ProblemId) => `/schaedlinge/hilfe/${id}`;
export const beneficialHref = (id: BeneficialId) => `/schaedlinge/nuetzling/${id}`;
export const GUIDE_HREF = "/schaedlinge?tab=nuetzlinge";

/** How many tiles a section shows before "… weitere anzeigen". */
export const TILES_SHOWN = 4;

/** A tile grid that shows the first four tiles and opens the rest on a tap. */
function CollapsibleHubGrid({ children }: { children: ReactNode[] }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = children.length - TILES_SHOWN;
  return (
    <div className="space-y-3">
      <HubGrid>{expanded ? children : children.slice(0, TILES_SHOWN)}</HubGrid>
      {hidden > 0 && <ShowMoreButton hidden={hidden} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />}
    </div>
  );
}

/** The tab "Nützlinge fördern": tiles for the problems and the beneficials. */
export function BeneficialsHub() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Viele Schädlinge erledigen Nützlinge von selbst. Wähle, wobei du Hilfe brauchst – oder lerne die Helfer kennen und erfahre, wie du sie in deinen Garten holst.
      </p>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Wobei brauchst du Hilfe?</h2>
        <CollapsibleHubGrid>
          {PROBLEMS.map((p) => (
            <HubTile key={p.id} href={problemHref(p.id)} icon={PROBLEM_LOOK[p.id].icon} tone={PROBLEM_LOOK[p.id].tone} label={p.title} hint={p.hint} />
          ))}
        </CollapsibleHubGrid>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Nützlinge kennenlernen</h2>
        <CollapsibleHubGrid>
          {Object.values(BENEFICIALS).map((b) => (
            <HubTile key={b.id} href={beneficialHref(b.id)} icon={BENEFICIAL_LOOK[b.id].icon} tone={BENEFICIAL_LOOK[b.id].tone} label={b.name} hint={b.buy ? "Auch zu kaufen" : "Selbst ansiedeln"} />
          ))}
        </CollapsibleHubGrid>
      </section>
    </div>
  );
}

/** Back link on the guide's sub pages. */
export function BackToGuide() {
  return (
    <Link href={GUIDE_HREF} className="inline-flex items-center gap-1 h-9 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <ChevronLeft className="w-4 h-4" />
      Nützlinge fördern
    </Link>
  );
}

/** The head of a guide page: coloured icon square, title, hint. */
export function GuideHeader({ look, title, hint }: { look: Look; title: string; hint: string }) {
  const Icon = look.icon;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center", look.tone)}>
        <Icon className="w-6 h-6" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/** A beneficial as a row that opens its page. */
export function BeneficialRow({ beneficial: b }: { beneficial: Beneficial }) {
  const look = BENEFICIAL_LOOK[b.id];
  const Icon = look.icon;
  return (
    <Link href={beneficialHref(b.id)} className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:shadow-md active:scale-[0.99] transition-all" data-testid={`beneficial-${b.id}`}>
      <span className={cn("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center", look.tone)}>
        <Icon className="w-5 h-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{b.name}</span>
        <span className="block text-xs text-muted-foreground line-clamp-2">{b.helps}</span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function MeasureCard({ measure, open, onToggle }: { measure: Measure; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border bg-card" id={`massnahme-${measure.id}`}>
      <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{measure.title}</p>
          <p className="text-xs text-muted-foreground">{measure.short}</p>
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

/** "So holst du sie in deinen Garten": the measures, one open at a time. */
export function MeasureList({ measures }: { measures: Measure[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">So holst du sie in deinen Garten</h2>
      <div className="space-y-2">
        {measures.map((m) => (
          <MeasureCard key={m.id} measure={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Zahlen sind Richtwerte – Gärten, Lagen und Jahre sind verschieden.</p>
    </section>
  );
}
