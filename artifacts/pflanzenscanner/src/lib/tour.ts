import type { ModuleId } from "@workspace/api-client-react";

/**
 * App-Tour (docs/onboarding.md): a few explanation cards that walk through the
 * main pages, one per page, each skippable. Where the tour stands is kept per
 * device; it is only a display aid.
 */

export interface TourStep {
  path: string;
  title: string;
  text: string;
  /** Left out while this area is hidden. */
  module?: ModuleId;
}

export const TOUR: readonly TourStep[] = [
  {
    path: "/",
    title: "Dein Hof",
    text: "Hier siehst du das Wetter und das Wichtigste aus allen Modulen auf einen Blick. Mit „Dashboard anpassen“ legst du fest, was hier steht. Der runde Knopf unten in der Mitte scannt Pflanzen und Insekten.",
  },
  {
    path: "/pflanzen",
    title: "Pflanzen",
    text: "Oben führt „Meine Pflanzen“ zu deiner Sammlung, darunter stehen Pflegeplan, Pflanzen-Doc, Beet-Architekt, Saatgut und mehr als Kacheln. Fällige Pflegeaufgaben zeigt auch der Hof.",
    module: "plants",
  },
  {
    path: "/farm",
    title: "Tiere",
    text: "Oben führt „Meine Tiere“ zu allen Tieren des Hofs, darunter stehen die Module als Kacheln – die Stall-Aufgaben für heute findest du auch auf dem Hof. Mit „Hof einrichten“ legst du in wenigen Schritten los.",
    module: "animals",
  },
  {
    path: "/mehr",
    title: "Mehr",
    text: "Unter „Konto“ steht deine Nutzer-ID – die gibst du weiter, wenn dich jemand ins Team holen oder eine Liste mit dir teilen will. Außerdem Benachrichtigungen und „Meine Module“: Dort blendest du Module ein und aus, lädst oder löschst die Demo-Daten und startest die Einrichtung oder diese Tour noch einmal.",
  },
];

/** The steps for this account: hidden areas drop out. */
export function tourSteps(visible: (id: ModuleId) => boolean): TourStep[] {
  return TOUR.filter((s) => !s.module || visible(s.module));
}

const KEY = "lf-tour-step";
const listeners = new Set<() => void>();
// Without storage (private mode) the tour still runs for this visit.
let memory: number | null = null;

/** Index of the current step, or null when no tour runs. */
export function readTourStep(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch {
    return memory;
  }
}

export function setTourStep(step: number | null): void {
  memory = step;
  try {
    if (step === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(step));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
