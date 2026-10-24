import type { ModuleId, PushTopic } from "@workspace/api-client-react";

/** Mehr → Benachrichtigungen: the push topics an account can switch off (docs/benachrichtigungen.md). */
export const PUSH_TOPICS: { topic: PushTopic; label: string; hint: string; module?: ModuleId; ownerOnly?: boolean }[] = [
  { topic: "plant-care", label: "Pflanzenpflege", hint: "Pflegeplan und Pflege-Guides", module: "care-plan" },
  { topic: "garden", label: "Gartenkalender", hint: "Säen, pflanzen, ernten", module: "garden" },
  { topic: "farm-tasks", label: "Stall-Aufgaben", hint: "Füttern, Ausmisten …", module: "farm-tasks" },
  { topic: "feed", label: "Futtervorrat", hint: "Rechtzeitig nachkaufen", module: "feed" },
  { topic: "medicines", label: "Arzneimittel", hint: "Ablaufdaten", module: "medicines" },
  { topic: "breeding", label: "Zucht", hint: "Geburt, Schlupf, Schritte", module: "breeding" },
  { topic: "duties", label: "Pflichten", hint: "Meldungen und Fristen", module: "duties" },
  { topic: "bees", label: "Bienen", hint: "Schwarmkontrolle, Varroa, Einfüttern", module: "bees" },
  { topic: "wildlife", label: "Raubtier-Alarm", hint: "Kommt auch in der Ruhezeit", module: "wildlife" },
  { topic: "weather", label: "Wetterwarnungen", hint: "Frost, Hitze, Sturm, Starkregen" },
  { topic: "grow", label: "Grow", hint: "Schritte und Wetter fürs Zelt", module: "grow" },
  { topic: "admin", label: "Betreiber", hint: "Neues Feedback und Fehler", ownerOnly: true },
];

export const DEFAULT_QUIET = { from: "22:00", to: "07:00" } as const;
