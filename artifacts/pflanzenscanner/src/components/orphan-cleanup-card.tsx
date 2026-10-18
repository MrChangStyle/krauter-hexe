import { useState } from "react";
import { Eraser, Loader2, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOrphanedDataQueryKey,
  useCleanupOrphanedData,
  useGetOrphanedData,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/** German labels for the table names the server reports. */
export const ORPHAN_LABELS: Record<string, string> = {
  favorites: "Favoriten",
  tasks: "Aufgaben",
  care_guides: "Pflege-Guides",
  push_subscriptions: "Push-Abos",
  plant_scans: "Pflanzen-Scanverlauf",
  insect_scans: "Insekten-Scanverlauf",
  scan_attempts: "Scan-Zähler",
  reports: "Meldungen",
  farm_memberships: "Farm-Mitgliedschaften",
  farms: "Farmen ohne Mitglieder (mit ihren Tieren)",
  plants: "Pflanzen im Archiv (nur Bezug entfernt)",
  insects: "Insekten im Archiv (nur Bezug entfernt)",
};

/** Lines "Label: n" for every table with leftovers, in server order. */
export function describeOrphans(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([table, n]) => `${ORPHAN_LABELS[table] ?? table}: ${n}`);
}

/**
 * Owner tool: finds data that accounts deleted before the complete account
 * deletion left behind, and removes it on explicit confirmation. Checking
 * changes nothing; only "Bereinigen" + confirmation deletes.
 */
export function OrphanCleanupCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const report = useGetOrphanedData({
    query: { queryKey: getGetOrphanedDataQueryKey(), enabled: checked, staleTime: 0 },
  });
  const cleanup = useCleanupOrphanedData({
    mutation: {
      onSuccess(result) {
        toast({
          title: "Bereinigt",
          description:
            result.total > 0
              ? describeOrphans(result.counts).join(" · ")
              : "Es gab nichts zu bereinigen.",
        });
        void queryClient.invalidateQueries({ queryKey: getGetOrphanedDataQueryKey() });
      },
      onError() {
        toast({
          title: "Bereinigung fehlgeschlagen",
          description: "Es wurde nichts verändert. Bitte versuche es später erneut.",
          variant: "destructive",
        });
      },
    },
  });

  const lines = report.data ? describeOrphans(report.data.counts) : [];

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Eraser className="h-4 w-4 text-primary" />
        Datenreste früherer Konten
      </h2>
      <p className="text-sm text-muted-foreground">
        Früher wurde beim Entfernen eines Kontos nur das Konto selbst gelöscht –
        Favoriten, Aufgaben und Scan-Verlauf blieben zurück. „Prüfen“ zeigt nur
        an, was noch da ist, und verändert nichts.
      </p>

      {!checked ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setChecked(true)}>
          <Search className="h-4 w-4" />
          Prüfen
        </Button>
      ) : report.isLoading || report.isFetching ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wird geprüft …
        </p>
      ) : report.isError ? (
        <p className="text-sm text-destructive">Die Prüfung hat nicht geklappt.</p>
      ) : report.data && report.data.total === 0 ? (
        <p className="text-sm text-primary">Keine Datenreste gefunden – alles sauber.</p>
      ) : (
        <>
          <ul className="list-disc pl-5 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={cleanup.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {cleanup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eraser className="h-4 w-4" />
              )}
              Bereinigen
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Datenreste endgültig entfernen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Gelöscht werden nur Daten von Konten, die es nicht mehr gibt.
                  Pflanzen und Insekten im Archiv bleiben erhalten, sie verlieren
                  nur den Bezug zum gelöschten Konto. Das lässt sich nicht in der
                  App rückgängig machen; die letzte nächtliche
                  Datenbank-Sicherung enthält aber noch den alten Stand.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cleanup.mutate({ data: { confirm: true } })}
                >
                  Endgültig bereinigen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
