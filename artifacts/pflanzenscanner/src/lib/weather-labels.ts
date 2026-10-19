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
