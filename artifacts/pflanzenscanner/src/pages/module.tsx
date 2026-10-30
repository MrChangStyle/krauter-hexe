import { Link, useLocation } from "wouter";
import { ArrowLeft, Lightbulb, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey, useSetSettings } from "@workspace/api-client-react";
import { DemoCard } from "@/components/demo-card";
import { ModuleSwitches } from "@/components/module-switches";
import { startTour } from "@/components/tour-card";
import { Button } from "@/components/ui/button";

/** /module – "Meine Module": which areas and modules this account uses, demo data, setup again. */
export default function ModulePage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const restart = useSetSettings({
    mutation: { onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data) },
  });

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Meine Module</h1>
        <p className="mt-1 text-sm text-muted-foreground">Blende aus, was du nicht brauchst – es verschwindet aus Kacheln, Dashboard und Navigation. Deine Daten bleiben erhalten.</p>
      </div>
      <p className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Lite</span> heißt: kostenlos nutzbar, Premium bringt mehr (z. B. die KI). Module ohne Kennzeichnung gehören fest zur App.
      </p>
      <ModuleSwitches />
      <DemoCard />
      <section className="space-y-2 rounded-2xl border bg-card p-4" data-testid="setup-card">
        <h2 className="font-semibold">Einrichtung und Erklärungen</h2>
        <p className="text-sm text-muted-foreground">Den Einrichtungsassistenten vom ersten Start noch einmal durchgehen oder die kurze Tour durch die App ansehen.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" disabled={restart.isPending} onClick={() => restart.mutate({ data: { onboarded: false } })}>
            <RotateCcw className="h-4 w-4" />
            Einrichtung neu starten
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => startTour(navigate)}>
            <Lightbulb className="h-4 w-4" />
            App-Tour starten
          </Button>
        </div>
      </section>
    </div>
  );
}
