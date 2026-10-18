// Matching plant names across the archive and the garden catalog.

/** "Taxus baccata L." → "taxus baccata" (genus + species, for matching). */
export function speciesKey(botanicalName: string): string | null {
  const words = botanicalName.toLowerCase().replace(/[^a-zäöüß\s-]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length >= 2 ? `${words[0]} ${words[1]}` : null;
}
