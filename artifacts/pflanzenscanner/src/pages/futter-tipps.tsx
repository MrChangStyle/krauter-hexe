import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Loader2, Plus, ShieldCheck, Trash2, Warehouse } from "lucide-react";
import {
  getListFeedRecipesQueryKey,
  useDeleteFeedRecipe,
  useEnsureOwnFarm,
  useGetFeedCalendar,
  useListFeedRecipes,
  useSubmitFeedRecipe,
  type CalendarCrop,
  type FarmSpecies,
  type FarmSummary,
  type FeedRecipe,
  type RecipeKind,
} from "@workspace/api-client-react";
import { PremiumBadge } from "@/components/premium-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { RECIPE_KIND_LABELS, lines } from "@/lib/feed-labels";
import { MONTHS } from "@/lib/garden-calendar";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const RECIPE_SPECIES: FarmSpecies[] = ["poultry", "rabbit", "guineaPig", "goat", "sheep", "pig", "horse", "cattle", "alpaca"];

// ── Futterkalender ───────────────────────────────────────────────────────────

function CropChip({ crop, stored }: { crop: CalendarCrop; stored?: boolean }) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
        crop.planted ? "border-primary bg-primary/10 font-medium text-foreground" : "border-dashed border-border text-muted-foreground",
      )}
      title={crop.species.map((s) => SPECIES_LABELS[s]).join(", ")}
    >
      {stored && <Warehouse className="h-3 w-3" />}
      {crop.name}
      <span className="font-normal text-muted-foreground">· {crop.species.map((s) => SPECIES_LABELS[s]).join(", ")}</span>
    </li>
  );
}

function FodderCalendar({ farm }: { farm: FarmSummary }) {
  const calendar = useGetFeedCalendar(farm.id);
  if (!calendar.data) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  const { species, months } = calendar.data;
  const now = new Date().getMonth() + 1;
  const ordered = [...months.slice(now - 1), ...months.slice(0, now - 1)];
  const planted = months.some((m) => m.fresh.some((c) => c.planted));

  if (species.length === 0) {
    return <p className="text-sm text-muted-foreground">Für eure Tiere kommt kein Futter aus dem Beet – oder es sind noch keine Tiere eingetragen.</p>;
  }
  return (
    <div className="space-y-2 text-sm">
      {!planted && (
        <p className="text-muted-foreground">
          In euren Beeten wächst dieses Jahr noch keine Futterpflanze – gestrichelt sind Vorschläge. Der{" "}
          <Link href="/beete/assistent" className="underline">
            Garten-Assistent
          </Link>{" "}
          plant ein Futterbeet ein.
        </p>
      )}
      {ordered.map((m, k) => {
        const content = (
          <ul className="flex flex-wrap gap-1.5 pt-1.5">
            {m.fresh.map((c) => (
              <CropChip key={c.key} crop={c} />
            ))}
            {m.stored.map((c) => (
              <CropChip key={`s-${c.key}`} crop={c} stored />
            ))}
            {m.fresh.length + m.stored.length === 0 && <li className="text-xs text-muted-foreground">Nichts aus dem Beet – Heu und Fertigfutter.</li>}
          </ul>
        );
        return k < 3 ? (
          <div key={m.month} className={cn("rounded-xl border p-3", k === 0 ? "border-primary/40 bg-primary/5" : "border-border")}>
            <p className="font-medium">
              {MONTHS[m.month - 1]}
              {k === 0 && <span className="ml-1.5 text-xs font-normal text-primary">jetzt</span>}
            </p>
            {content}
          </div>
        ) : (
          <details key={m.month} className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer font-medium">
              {MONTHS[m.month - 1]} <span className="text-xs font-normal text-muted-foreground">({m.fresh.length + m.stored.length})</span>
            </summary>
            {content}
          </details>
        );
      })}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Kräftig umrandet: wächst in euren Beeten · <Warehouse className="h-3 w-3" /> aus dem Lager
      </p>
    </div>
  );
}

// ── Rezepte ──────────────────────────────────────────────────────────────────

function StatusBadge({ recipe }: { recipe: FeedRecipe }) {
  if (recipe.status === "builtIn" || recipe.status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
        <ShieldCheck className="h-3 w-3" />
        geprüft
      </span>
    );
  }
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", recipe.status === "pending" ? "bg-amber-400 text-amber-950" : "bg-muted text-muted-foreground")}>
      {recipe.status === "pending" ? "wartet auf Freigabe" : "nicht freigegeben"}
    </span>
  );
}

function RecipeCard({ recipe, onDelete }: { recipe: FeedRecipe; onDelete?: () => void }) {
  return (
    <details className="group rounded-xl border border-border p-3 text-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
        <span>
          <span className="font-medium">{recipe.title}</span>
          <span className="block text-xs text-muted-foreground">
            {RECIPE_KIND_LABELS[recipe.kind]} · {recipe.species.map((s) => SPECIES_LABELS[s]).join(", ")}
          </span>
        </span>
        <StatusBadge recipe={recipe} />
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zutaten</p>
          <ul className="mt-1 space-y-0.5">
            {recipe.ingredients.map((i) => (
              <li key={i.name} className="flex justify-between gap-2">
                <span>{i.name}</span>
                <span className="text-right text-muted-foreground">{i.amount}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">So geht's</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {recipe.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        {recipe.hygiene.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-wide">Hygiene</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {recipe.hygiene.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        {onDelete && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Zurückziehen
          </Button>
        )}
      </div>
    </details>
  );
}

function SubmitDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [species, setSpecies] = useState<FarmSpecies[]>([]);
  const [kind, setKind] = useState<RecipeKind>("mix");
  const [ingredients, setIngredients] = useState([{ name: "", amount: "" }]);
  const [steps, setSteps] = useState("");
  const [hygiene, setHygiene] = useState("");
  const submit = useSubmitFeedRecipe({
    mutation: {
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: getListFeedRecipesQueryKey() });
        toast({ title: "Rezept eingereicht", description: "Nach der Prüfung sehen es alle." });
        onClose();
      },
      onError: (err) => toast({ title: "Nicht eingereicht", description: errorText(err, "Bitte prüfe die Angaben."), variant: "destructive" }),
    },
  });

  function send(event: FormEvent) {
    event.preventDefault();
    submit.mutate({
      data: {
        title: title.trim(),
        species,
        kind,
        ingredients: ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: i.amount.trim() })),
        steps: lines(steps),
        hygiene: lines(hygiene),
      },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submit.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rezept vorschlagen</DialogTitle>
          <DialogDescription>Wird geprüft und erst dann für alle sichtbar. Keine Küchen- oder Speisereste.</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-title">Name</Label>
            <Input id="recipe-title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Für</p>
            <div className="flex flex-wrap gap-1.5">
              {RECIPE_SPECIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={species.includes(s)}
                  onClick={() => setSpecies(species.includes(s) ? species.filter((x) => x !== s) : [...species, s])}
                  className={cn("rounded-full border px-3 py-1 text-xs", species.includes(s) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
                >
                  {SPECIES_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-kind">Art</Label>
            <select id="recipe-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as RecipeKind)}>
              {(Object.keys(RECIPE_KIND_LABELS) as RecipeKind[]).map((k) => (
                <option key={k} value={k}>
                  {RECIPE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Zutaten</p>
            {ingredients.map((i, k) => (
              <div key={k} className="flex gap-2">
                <Input aria-label={`Zutat ${k + 1}`} placeholder="Zutat" value={i.name} onChange={(e) => setIngredients(ingredients.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
                <Input aria-label={`Menge ${k + 1}`} placeholder="Menge" className="w-32" value={i.amount} onChange={(e) => setIngredients(ingredients.map((x, j) => (j === k ? { ...x, amount: e.target.value } : x)))} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setIngredients([...ingredients, { name: "", amount: "" }])}>
              <Plus className="h-4 w-4" />
              Zutat
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-steps">Schritte (einer je Zeile)</Label>
            <Textarea id="recipe-steps" rows={4} required value={steps} onChange={(e) => setSteps(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-hygiene">Hygieneregeln (eine je Zeile, freiwillig)</Label>
            <Textarea id="recipe-hygiene" rows={3} value={hygiene} onChange={(e) => setHygiene(e.target.value)} />
          </div>
          <Button type="submit" disabled={submit.isPending} className="gap-1.5">
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Einreichen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Recipes() {
  const queryClient = useQueryClient();
  const recipes = useListFeedRecipes();
  const [filter, setFilter] = useState<FarmSpecies | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const remove = useDeleteFeedRecipe({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListFeedRecipesQueryKey() }) } });
  const all = recipes.data ?? [];
  const species = useMemo(() => RECIPE_SPECIES.filter((s) => all.some((r) => r.species.includes(s))), [all]);
  const shown = filter ? all.filter((r) => r.species.includes(filter)) : all;

  return (
    <div className="space-y-3">
      {species.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...species].map((s) => (
            <button
              key={s ?? "alle"}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn("rounded-full border px-3 py-1 text-xs", filter === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
            >
              {s ? SPECIES_LABELS[s] : "Alle"}
            </button>
          ))}
        </div>
      )}
      {recipes.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <RecipeCard key={r.id} recipe={r} onDelete={r.mine && r.status !== "approved" ? () => remove.mutate({ recipeId: r.id }) : undefined} />
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSubmitting(true)}>
        <Plus className="h-4 w-4" />
        Rezept vorschlagen
      </Button>
      <p className="text-xs text-muted-foreground">Rezepte und Mengen sind Richtwerte; bei kranken oder jungen Tieren Tierarzt fragen.</p>
      {submitting && <SubmitDialog onClose={() => setSubmitting(false)} />}
    </div>
  );
}

/** /farm/futter/tipps – Futterkalender aus dem Garten und Rezepte. */
export default function FutterTippsPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="futter-tipps" subtitle="Was der Garten im Jahr liefert, und geprüfte Rezepte mit Hygieneregeln." />
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          Futterkalender aus dem Garten <PremiumBadge />
        </h2>
        {!farm ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <FodderCalendar farm={farm} />}
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          Rezepte
        </h2>
        <Recipes />
      </section>
    </div>
  );
}
