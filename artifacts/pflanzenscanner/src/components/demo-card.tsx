import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { getGetDemoStatusQueryKey, useDeleteDemo, useGetDemoStatus, useLoadDemo } from "@workspace/api-client-react";
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
import { writeActiveFarmId } from "@/lib/active-farm";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** Demo-Daten laden / löschen (docs/demo.md). `onLoaded` replaces the jump to the Demo-Hof (the assistant). */
export function DemoCard({ onLoaded }: { onLoaded?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [confirm, setConfirm] = useState(false);
  const status = useGetDemoStatus();
  // Everything the demo touches – farms, grows, dashboard – should load fresh.
  const refresh = () => queryClient.invalidateQueries();
  const load = useLoadDemo({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetDemoStatusQueryKey(), data);
        if (data.farmId !== null) writeActiveFarmId(data.farmId);
        void refresh();
        toast({ title: "Demo-Daten geladen", description: "Schau dich auf dem Demo-Hof um." });
        if (onLoaded) onLoaded();
        else navigate("/farm");
      },
      onError: (err) => toast({ title: "Nicht geladen", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" }),
    },
  });
  const remove = useDeleteDemo({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetDemoStatusQueryKey(), data);
        setConfirm(false);
        void refresh();
        toast({ title: "Demo-Daten gelöscht", description: "Deine eigenen Daten sind unverändert." });
      },
      onError: () => toast({ title: "Nicht gelöscht", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const active = status.data?.active;

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4" data-testid="demo-card">
      <h2 className="flex items-center gap-2 font-semibold">
        <FlaskConical className="h-4 w-4 text-primary" />
        Demo-Daten
      </h2>
      <p className="text-sm text-muted-foreground">
        {active
          ? "Die Beispiele liegen auf dem „Demo-Hof“. Wenn du genug gesehen hast, lösche sie mit einem Klick – deine eigenen Daten bleiben."
          : "Zwei Beispiele je Modul zum Ausprobieren: Tiere, Aufgaben, Futter, Zucht, Arzneimittel, Ertrag, Kameras, Beete und Saatgut – auf einem eigenen „Demo-Hof“, getrennt von deinen Daten."}
      </p>
      {!status.data ? (
        status.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : active ? (
        <Button variant="outline" className="gap-1.5 text-destructive" disabled={remove.isPending} onClick={() => setConfirm(true)}>
          <Trash2 className="h-4 w-4" />
          Demo-Daten löschen
        </Button>
      ) : (
        <Button className="gap-1.5" disabled={load.isPending} onClick={() => load.mutate()}>
          {load.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          Demo-Daten laden
        </Button>
      )}
      <AlertDialog open={confirm} onOpenChange={(o) => !remove.isPending && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demo-Daten löschen?</AlertDialogTitle>
            <AlertDialogDescription>Der Demo-Hof mit allem darauf wird gelöscht, dazu das Demo-Zelt. Deine eigenen Farmen und Grows bleiben unberührt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
