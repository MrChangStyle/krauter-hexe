import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Microscope, Sparkles, Trash2 } from "lucide-react";
import {
  getGetGrowPlantQueryKey,
  useCheckGrowPlant,
  useDeleteGrowCheck,
  type GrowCheck,
  type GrowCheckKind,
  type GrowPlantDetail,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { downscaleFile } from "@/lib/image";
import { FINDING_LABELS, HEALTH_STATUS_LABELS, TRICHOME_STAGE_LABELS } from "@/lib/grow-labels";
import { deDay } from "@/lib/medicine-labels";
import { cn } from "@/lib/utils";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const STATUS_CLASS = {
  healthy: "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
  watch: "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
  problem: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100",
} as const;

/** Clear, milky and amber as one bar, with the shares as text. */
function TrichomeBar({ clear, milky, amber }: { clear: number; milky: number; amber: number }) {
  const parts = [
    { label: "klar", value: clear, color: "#CFD8DC" },
    { label: "milchig", value: milky, color: "#F5F5F5" },
    { label: "bernstein", value: amber, color: "#D4A017" },
  ];
  return (
    <div className="space-y-1">
      <div className="flex h-3 overflow-hidden rounded-full border border-border">
        {parts.map((p) => p.value > 0 && <div key={p.label} style={{ flexGrow: p.value, background: p.color }} />)}
      </div>
      <p className="text-xs">{parts.map((p) => `${p.value} % ${p.label}`).join(" · ")}</p>
    </div>
  );
}

function CheckCard({ check, onDelete }: { check: GrowCheck; onDelete: () => void }) {
  const h = check.health;
  const t = check.trichomes;
  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm" data-testid={`grow-check-${check.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {deDay(check.date)} · {check.kind === "health" ? "Gesundheit" : "Trichome"}
        </p>
        <button type="button" aria-label="Check löschen" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {h && (
        <>
          <p className={cn("rounded-lg border px-2 py-1 font-semibold", STATUS_CLASS[h.status])}>{HEALTH_STATUS_LABELS[h.status]}</p>
          <p>{h.summary}</p>
          {h.facts.map((f) => (
            <p key={f} className="rounded-lg bg-muted/60 p-2 text-xs">
              <span className="font-medium">Aus deinem Tagebuch: </span>
              {f}
            </p>
          ))}
          {h.findings.length > 0 && (
            <ul className="space-y-2">
              {h.findings.map((f) => (
                <li key={f.name} className="space-y-0.5">
                  <p className="font-medium">
                    {f.name} <span className="font-normal text-muted-foreground">· {FINDING_LABELS[f.category]}{f.likely ? "" : " · möglich"}</span>
                  </p>
                  {f.signs && <p className="text-xs text-muted-foreground">{f.signs}</p>}
                  {f.actions.length > 0 && (
                    <ul className="list-disc pl-5 text-xs">
                      {f.actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {t && (
        <>
          <p className="font-semibold">{TRICHOME_STAGE_LABELS[t.stage]}</p>
          <TrichomeBar clear={t.clear} milky={t.milky} amber={t.amber} />
          {t.summary && <p className="text-xs text-muted-foreground">{t.summary}</p>}
          <p>{t.advice}</p>
        </>
      )}
    </li>
  );
}

/** KI-Check on the plant page: a photo for health or trichomes; only the result is kept. */
export function GrowCheckSection({ detail }: { detail: GrowPlantDetail }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<GrowCheckKind>("health");
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const p = detail.plant;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetGrowPlantQueryKey(p.id) });
  const check = useCheckGrowPlant({
    mutation: {
      onSuccess: refresh,
      onError: (err) => setError(errorText(err, "Die KI ist gerade nicht erreichbar.")),
    },
  });
  const remove = useDeleteGrowCheck({ mutation: { onSuccess: refresh } });
  const busy = preparing || check.isPending;
  const inBloom = p.plan.current === "flower" || p.plan.current === "flush";
  const pick = (k: GrowCheckKind) => {
    setKind(k);
    input.current?.click();
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        KI-Check
      </h2>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          setPreparing(true);
          try {
            // Trichomes are tiny: keep more pixels.
            const imageData = kind === "trichomes" ? await downscaleFile(file, 1600, 0.85) : await downscaleFile(file);
            check.mutate({ plantId: p.id, data: { kind, imageData } });
          } finally {
            setPreparing(false);
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => pick("health")}>
          {busy && kind === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Gesundheit prüfen
        </Button>
        {inBloom && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => pick("trichomes")}>
            {busy && kind === "trichomes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Microscope className="h-4 w-4" />}
            Trichome prüfen
          </Button>
        )}
      </div>
      {busy && <p className="text-sm text-muted-foreground">Die KI schaut sich das Foto an …</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {detail.checks.length === 0 && !busy && (
        <p className="text-sm text-muted-foreground">
          Fotografiere Blätter oder Blüten bei Tageslicht: Die KI erkennt Mangel, Schädlinge, Schimmel und Stress und gleicht mit deinem Tagebuch ab.
          {inBloom ? " Für den Trichom-Check ein scharfes Nahfoto einer Blüte (Lupe oder Makro)." : " Den Trichom-Check gibt es ab der Blüte."}
        </p>
      )}
      {detail.checks.length > 0 && (
        <ul className="space-y-2">
          {detail.checks.map((c) => (
            <CheckCard key={c.id} check={c} onDelete={() => remove.mutate({ checkId: c.id })} />
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        KI-Einschätzung ohne Gewähr. Das Foto wird zur Auswertung an Google Gemini geschickt und nicht gespeichert – nur das Ergebnis.
      </p>
    </section>
  );
}
