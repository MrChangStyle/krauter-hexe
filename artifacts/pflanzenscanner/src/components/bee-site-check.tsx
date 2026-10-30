import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Compass, Loader2, ScanSearch, Trash2 } from "lucide-react";
import {
  getListBeeSiteChecksQueryKey,
  useDeleteBeeSiteCheck,
  useListBeeSiteChecks,
  useRunBeeSiteCheck,
  type BeeSiteCheck,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompass } from "@/hooks/use-compass";
import { useToast } from "@/hooks/use-toast";
import { headingText } from "@/lib/homography";
import { downscaleFile } from "@/lib/image";

const PARTS: [keyof BeeSiteCheck["analysis"], string][] = [
  ["orientation", "Ausrichtung"],
  ["shelter", "Wind und Wetter"],
  ["forage", "Bepflanzung und Tracht"],
  ["moisture", "Feuchtigkeit"],
  ["neighbours", "Wege und Nachbarn"],
];

const when = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function CheckCard({ check, canWrite, onDelete }: { check: BeeSiteCheck; canWrite: boolean; onDelete: () => void }) {
  const a = check.analysis;
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3 text-sm" data-testid="site-check">
      <div className="flex gap-3">
        {check.photoUrl && <img src={check.photoUrl} alt="Bienenstand" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {when(check.createdAt)}
            {check.apiary && ` · ${check.apiary}`}
            {check.heading !== null && ` · Blick nach ${headingText(check.heading)}`}
          </p>
          <p className="font-medium">{a.overall}</p>
        </div>
        {canWrite && (
          <button type="button" aria-label="Standort-Check löschen" className="self-start text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {a.tips.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5">
          {a.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Im Einzelnen{check.question ? " · deine Frage" : ""}</summary>
        <dl className="space-y-1.5 pt-2">
          {check.question && (
            <div>
              <dt className="text-xs font-semibold">Deine Frage</dt>
              <dd className="text-muted-foreground">{check.question}</dd>
            </div>
          )}
          {PARTS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-xs font-semibold">{label}</dt>
              <dd className="text-muted-foreground">{a[key] as string}</dd>
            </div>
          ))}
        </dl>
      </details>
    </li>
  );
}

/**
 * Standort-Check (docs/bienen.md): a photo of a Bienenstand looked at by the
 * AI – orientation, shelter, plants, moisture, neighbours – with tips. Not tied
 * to a colony; the checks are kept.
 */
export function BeeSiteCheckSection({ farm, apiaries }: { farm: FarmSummary; apiaries: string[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const checks = useListBeeSiteChecks(farm.id);
  const input = useRef<HTMLInputElement>(null);
  const compass = useCompass();
  const stopCompass = useRef<(() => void) | null>(null);
  const [draft, setDraft] = useState<{ imageData: string; heading: number | null } | null>(null);
  const [apiary, setApiary] = useState("");
  const [question, setQuestion] = useState("");
  const canWrite = farm.role !== "guest";
  const saved = (next: BeeSiteCheck[]) => queryClient.setQueryData(getListBeeSiteChecksQueryKey(farm.id), next);
  const errorOf = (err: unknown) => (err as { data?: { error?: string } } | null)?.data?.error ?? "Bitte versuche es gleich noch einmal.";
  const run = useRunBeeSiteCheck({
    mutation: {
      onSuccess(next) {
        saved(next);
        setDraft(null);
        setQuestion("");
      },
      onError: (err) => toast({ title: "Kein Standort-Check", description: errorOf(err), variant: "destructive" }),
    },
  });
  const remove = useDeleteBeeSiteCheck({ mutation: { onSuccess: saved } });

  async function choose() {
    stopCompass.current?.();
    stopCompass.current = await compass.start();
    input.current?.click();
  }

  const list = checks.data ?? [];
  if (!canWrite && list.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Standort-Check</h2>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="site-check-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const heading = compass.heading.current;
          stopCompass.current?.();
          if (!file) return;
          setDraft({ imageData: await downscaleFile(file), heading: heading === null ? null : Math.round(heading) });
        }}
      />
      {canWrite && (
        <div className="rounded-xl border border-dashed border-border p-3 text-sm">
          <p className="text-muted-foreground">
            Fotografiere einen Bienenstand – mit den Beuten und der Umgebung, am besten in Flugrichtung. Die KI schaut auf Ausrichtung, Wind, Bepflanzung, Feuchtigkeit und Nachbarn und sagt, was sich verbessern lässt.
          </p>
          <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => void choose()}>
            <ScanSearch className="h-4 w-4" />
            Standort prüfen lassen
          </Button>
        </div>
      )}
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((c) => (
            <CheckCard key={c.id} check={c} canWrite={canWrite} onDelete={() => window.confirm("Diesen Standort-Check löschen?") && remove.mutate({ farmId: farm.id, checkId: c.id })} />
          ))}
        </ul>
      )}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && !run.isPending && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Standort prüfen lassen</DialogTitle>
            <DialogDescription>Das Foto geht zur Auswertung an Google Gemini. Zählt als KI-Anfrage für die Farm.</DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                run.mutate({ farmId: farm.id, data: { imageData: draft.imageData, heading: draft.heading, apiary: apiary.trim() || null, question: question.trim() || null } });
              }}
            >
              <img src={draft.imageData} alt="Vorschau" className="max-h-56 w-full rounded-lg object-cover" />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Compass className="h-3.5 w-3.5" />
                {draft.heading !== null ? `Blick nach ${headingText(draft.heading)} (vom Kompass)` : "Ohne Himmelsrichtung – das Handy hat keinen Kompass gemeldet."}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="site-apiary">Bienenstand</Label>
                <Input id="site-apiary" list="site-apiaries" maxLength={60} value={apiary} onChange={(e) => setApiary(e.target.value)} placeholder="z. B. Obstwiese" />
                <datalist id="site-apiaries">
                  {apiaries.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="site-question">Worauf soll die KI achten? (optional)</Label>
                <Input id="site-question" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="z. B. Ist es hier zu feucht?" />
              </div>
              <Button type="submit" className="w-full gap-1.5" disabled={run.isPending}>
                {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {run.isPending ? "Die KI schaut sich den Standort an …" : "Prüfen lassen"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
