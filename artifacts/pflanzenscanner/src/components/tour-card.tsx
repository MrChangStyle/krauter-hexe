import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModules } from "@/hooks/use-modules";
import { readTourStep, setTourStep, subscribeTour, tourSteps } from "@/lib/tour";

/** Starts the App-Tour on the Hof. */
export function startTour(navigate: (path: string) => void): void {
  setTourStep(0);
  navigate("/");
}

/** The explanation card of the App-Tour, above the bottom bar; "Weiter" goes to the next page. */
export function TourCard() {
  const [location, navigate] = useLocation();
  const { visible } = useModules();
  const index = useSyncExternalStore(subscribeTour, readTourStep, () => null);
  const steps = tourSteps(visible);
  const step = index === null ? null : steps[index];

  // A step past the end (an area hidden meanwhile) ends the tour.
  useEffect(() => {
    if (index !== null && !step) setTourStep(null);
  }, [index, step]);
  if (index === null || !step || location !== step.path) return null;

  const last = index === steps.length - 1;
  const next = () => {
    if (last) return setTourStep(null);
    setTourStep(index + 1);
    navigate(steps[index + 1]!.path);
  };

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 px-4" role="dialog" aria-label={`Erklärung: ${step.title}`} data-testid="tour-card">
      <div className="mx-auto max-w-2xl rounded-2xl border border-primary/30 bg-card p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              Erklärung {index + 1} von {steps.length}
            </p>
            <p className="font-semibold">{step.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
          </div>
          <button type="button" aria-label="Tour beenden" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setTourStep(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setTourStep(null)}>
            Erklärungen überspringen
          </button>
          <Button size="sm" onClick={next}>
            {last ? "Fertig" : "Weiter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
