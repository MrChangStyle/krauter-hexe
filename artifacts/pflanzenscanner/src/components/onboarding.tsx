import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Leaf, Loader2 } from "lucide-react";
import { getGetSettingsQueryKey, useSetSettings } from "@workspace/api-client-react";
import { DemoCard } from "@/components/demo-card";
import { ModuleSwitches } from "@/components/module-switches";
import { startTour } from "@/components/tour-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModules } from "@/hooks/use-modules";
import { useAuthContext } from "@/lib/auth-context";

const STEPS = ["Willkommen", "Module", "Demo-Daten", "Fertig"] as const;

/**
 * Einrichtungsassistent (docs/onboarding.md): on the first start the account
 * picks its modules, may load demo data and may take the App-Tour. Skippable
 * at every step; "Meine Module" starts it again.
 */
export function Onboarding() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuthContext();
  const { settings } = useModules();
  const [step, setStep] = useState(0);
  const done = useSetSettings({
    mutation: { onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data) },
  });
  // Waits for the username dialog; offline it can't be saved anyway.
  const username = (user as { username?: string | null } | null)?.username;
  if (!settings.data || settings.data.onboarded || !username || !navigator.onLine) return null;

  const finish = (tour: boolean) => {
    done.mutate({ data: { onboarded: true } });
    setStep(0);
    if (tour) startTour(navigate);
  };
  const skip = (
    <button type="button" className="text-xs text-muted-foreground underline" disabled={done.isPending} onClick={() => finish(false)}>
      Einrichtung überspringen
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !done.isPending && finish(false)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="onboarding">
        <ol className="flex gap-1.5" aria-label="Schritte">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        {step === 0 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5 text-primary" />
                Willkommen bei Little Farming
              </DialogTitle>
              <DialogDescription>In drei kurzen Schritten stellst du dir die App zusammen. Alles lässt sich später unter Mehr → „Meine Module“ ändern.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-1.5 text-sm">
              <li>🌱 <span className="font-medium">Pflanzen</span>: scannen, pflegen, Beete planen, Saatgut.</li>
              <li>🐔 <span className="font-medium">Tiere</span>: Stall-Aufgaben, Futter, Zucht, Arzneimittel, Ertrag.</li>
              <li>🏡 <span className="font-medium">Hof</span>: das Wichtigste aus allem auf einen Blick.</li>
            </ul>
          </>
        )}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Welche Module willst du nutzen?</DialogTitle>
              <DialogDescription>
                Blende aus, was du nicht brauchst. <span className="font-medium text-foreground">Lite</span> heißt kostenlos nutzbar, Premium bringt mehr. Module ohne Kennzeichnung gehören fest zur App.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ModuleSwitches />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Erst einmal umschauen?</DialogTitle>
              <DialogDescription>Mit Demo-Daten siehst du gleich, wie alles aussieht. Du kannst sie jederzeit mit einem Klick wieder löschen.</DialogDescription>
            </DialogHeader>
            <DemoCard onLoaded={() => setStep(3)} />
          </>
        )}
        {step === 3 && (
          <DialogHeader>
            <DialogTitle>Fertig eingerichtet</DialogTitle>
            <DialogDescription>Magst du eine kurze Tour mit Erklärungen zu den wichtigsten Seiten? Du kannst sie jederzeit überspringen.</DialogDescription>
          </DialogHeader>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {step < 3 ? skip : (
            <Button variant="outline" disabled={done.isPending} onClick={() => finish(false)}>
              Ohne Tour loslegen
            </Button>
          )}
          {step < 3 ? (
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Zurück
                </Button>
              )}
              <Button onClick={() => setStep(step + 1)}>Weiter</Button>
            </div>
          ) : (
            <Button disabled={done.isPending} onClick={() => finish(true)}>
              {done.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tour starten
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
