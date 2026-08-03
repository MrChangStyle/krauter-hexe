import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCareGuides,
  useDeleteCareGuide,
  getListCareGuidesQueryKey,
} from "@workspace/api-client-react";
import type { CareGuide } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookHeart,
  Trash2,
  ChevronRight,
  Stethoscope,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";

function dayProgress(guide: CareGuide): { elapsed: number; total: number } {
  const start = new Date(guide.startDate);
  const elapsed = Math.min(30, Math.max(0, differenceInDays(new Date(), start) + 1));
  return { elapsed, total: 30 };
}

function GuideCard({
  guide,
  onDelete,
}: {
  guide: CareGuide;
  onDelete: (id: number) => void;
}) {
  const [, setLocation] = useLocation();
  const { elapsed, total } = dayProgress(guide);
  const isCompleted = guide.status === "Abgeschlossen";
  const pct = Math.round((elapsed / total) * 100);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <button
        className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
        onClick={() => setLocation(`/pflege-guide/${guide.id}`)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isCompleted
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
                {isCompleted ? "Abgeschlossen" : "Aktiv"}
              </span>
              {!isCompleted && elapsed >= 30 && !guide.hasImageDay30 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  Foto Tag 30 ausstehend
                </span>
              )}
            </div>

            <p className="font-serif font-semibold text-base leading-tight mb-1 truncate">
              {guide.plantName}
            </p>

            {/* Progress bar */}
            {!isCompleted && (
              <div className="mt-2 mb-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Tag {elapsed} von {total}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-1.5">
              {format(new Date(guide.startDate), "dd. MMM", { locale: de })} –{" "}
              {format(new Date(guide.endDate), "dd. MMM yyyy", { locale: de })}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
        </div>
      </button>

      <div className="border-t border-border px-4 py-2 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(guide.id);
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Löschen
        </button>
      </div>
    </div>
  );
}

export default function PflegeGuidesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: guides = [], isLoading } = useListCareGuides();
  const deleteGuide = useDeleteCareGuide();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCareGuidesQueryKey() });

  const handleDeleteConfirm = () => {
    if (deleteId === null) return;
    deleteGuide.mutate(
      { id: deleteId },
      { onSuccess: () => { void invalidate(); setDeleteId(null); } },
    );
  };

  const active = guides.filter((g) => g.status === "Aktiv");
  const completed = guides.filter((g) => g.status === "Abgeschlossen");

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-8">
      <header className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <BookHeart className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-semibold">Pflege-Guides</h1>
            <p className="text-xs text-muted-foreground">30-Tage-Pflegepläne für deine Pflanzen</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          Erstelle einen Pflege-Guide direkt nach einer{" "}
          <button
            className="underline hover:text-primary transition-colors"
            onClick={() => setLocation("/pflanzendoc")}
          >
            Pflanzendoc-Diagnose
          </button>
          .
        </p>
      </header>

      <div className="flex-1 px-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Wird geladen …
          </div>
        )}

        {!isLoading && guides.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="p-4 rounded-2xl bg-muted text-muted-foreground">
              <BookHeart className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-medium">Noch keine Pflege-Guides</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Scanne deine Pflanze im Pflanzendoc und erstelle danach einen individuellen 30-Tage-Pflegeplan.
              </p>
            </div>
            <Button onClick={() => setLocation("/pflanzendoc")} className="gap-2">
              <Stethoscope className="w-4 h-4" />
              Zum Pflanzendoc
            </Button>
          </div>
        )}

        {!isLoading && active.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aktiv ({active.length})
            </p>
            {active.map((g) => (
              <GuideCard key={g.id} guide={g} onDelete={setDeleteId} />
            ))}
          </div>
        )}

        {!isLoading && completed.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Abgeschlossen ({completed.length})
            </p>
            {completed.map((g) => (
              <GuideCard key={g.id} guide={g} onDelete={setDeleteId} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Pflege-Guide löschen?</DialogTitle>
            <DialogDescription>
              Dieser Guide wird dauerhaft entfernt, einschließlich aller Fotos und des Pflegeplans. Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteGuide.isPending}>
              {deleteGuide.isPending ? "Löschen …" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
