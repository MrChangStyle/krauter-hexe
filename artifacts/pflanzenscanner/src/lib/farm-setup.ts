import type { FarmSetup, FarmSpecies } from "@workspace/api-client-react";

type StepKey = FarmSetup["steps"][number]["key"];

/** The setup checklist: label, why, and where to do it (a route, or an anchor on the farm page). */
export const SETUP_STEPS: { key: StepKey; label: string; hint: string; action: string; href: string }[] = [
  { key: "name", label: "Hof benennen", hint: "So erkennt ihr ihn auch in Einladungen.", action: "Umbenennen", href: "" },
  { key: "location", label: "Standort fürs Wetter", hint: "Für Frost-, Hitze- und Sturmwarnungen.", action: "Auf der Hof-Seite", href: "/" },
  { key: "animals", label: "Tiere anlegen", hint: "Einzeln unten oder als Gruppe in einem Schritt.", action: "Schnell anlegen", href: "" },
  { key: "rations", label: "Futter planen", hint: "Rationen mit Ampel und Warnungen.", action: "Zum Futterplaner", href: "/farm/futter" },
  { key: "tasks", label: "Stall-Aufgaben", hint: "Füttern, Ausmisten, Eier sammeln – mit Erinnerung.", action: "Zu den Aufgaben", href: "/farm/aufgaben" },
  { key: "beds", label: "Garten anlegen", hint: "Beete planen, Futter für die Tiere ernten.", action: "Zu den Beeten", href: "/beete" },
  { key: "members", label: "Familie oder Helfer einladen", hint: "Gemeinsam versorgen, auch als Vertretung.", action: "Zu Farm & Team", href: "/team" },
];

const GROUP_NAMES: Record<FarmSpecies, string> = {
  poultry: "Hühner",
  rabbit: "Kaninchen",
  guineaPig: "Meerschweinchen",
  goat: "Ziegen",
  sheep: "Schafe",
  horse: "Pferde",
  cattle: "Rinder",
  pig: "Schweine",
  alpaca: "Alpakas",
  goose: "Gänse",
  duck: "Enten",
  turkey: "Puten",
  quail: "Wachteln",
  rhea: "Nandus",
  donkey: "Esel",
  cat: "Katzen",
  dog: "Hunde",
  other: "Tiere",
};

export function defaultGroupName(species: FarmSpecies): string {
  return GROUP_NAMES[species];
}
