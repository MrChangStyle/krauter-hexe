const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Heute", "Morgen", then the short weekday. */
export function dayLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
}

export function tempText(t: number): string {
  return `${t < 0 ? "−" : ""}${Math.round(Math.abs(t))}°`;
}

/** Berlin day of the device ("YYYY-MM-DD"). */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv", { timeZone: "Europe/Berlin" }).format(now);
}

const berlinParts = (iso: string) => {
  const d = new Date(iso);
  const day = berlinToday(d);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  return { day, time };
};

/** When an official warning holds: "Heute 14:00 – 20:00", "ab Morgen 06:00", "Mi 14:00 – Do 03:00". */
export function alertWindow(onset: string, expires: string | null, today: string): string {
  const from = berlinParts(onset);
  const fromText = `${dayLabel(from.day, today)} ${from.time}`;
  if (!expires) return `ab ${fromText}`;
  const to = berlinParts(expires);
  return `${fromText} – ${to.day === from.day ? "" : `${dayLabel(to.day, today)} `}${to.time}`;
}

/** DWD levels as the DWD names them. */
export const ALERT_LEVEL_LABELS = {
  minor: "Wetterwarnung",
  moderate: "Markantes Wetter",
  severe: "Unwetter",
  extreme: "Extremes Unwetter",
} as const;
