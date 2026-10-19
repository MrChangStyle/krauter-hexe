/**
 * Futtermittel-Liste of the Futterplaner (docs/futterplaner.md): average
 * values of common feeds, for everything without a label (hay, grass, grain,
 * garden plants) and as a start for compound feeds.
 *
 * All values per kg DRY MATTER (Trockenmasse), so feeds with very different
 * water content compare; `dryMatter` is the share of dry matter as fed.
 * Richtwerte after the usual tables (DLG-Futterwerttabellen and similar) –
 * to be checked by a specialist before the public start.
 */

import type { FarmSpecies } from '@workspace/db';

export type FeedCategory = 'roughage' | 'fresh' | 'grain' | 'compound' | 'vegetable' | 'mineral';

export interface FeedValues {
  /** % of the feed as fed. */
  dryMatter: number;
  /** % of dry matter. */
  crudeProtein: number;
  crudeFat: number;
  crudeFibre: number;
  /** g per kg dry matter. */
  calcium: number;
  phosphorus: number;
  /** mg per kg dry matter; null when not known. */
  copper: number | null;
}

export interface Feed extends FeedValues {
  key: string;
  name: string;
  category: FeedCategory;
  /** Mineral feeds are made for certain species – others must not get them. */
  forSpecies: FarmSpecies[] | null;
  /** Plants: matched against the plant archive for toxicity. */
  botanicalName: string | null;
  /** A sensible daily amount per animal to start with (g as fed), by species. */
  hint: string | null;
}

const f = (
  key: string,
  name: string,
  category: FeedCategory,
  v: [dm: number, cp: number, fat: number, fibre: number, ca: number, p: number, cu: number | null],
  extra: Partial<Pick<Feed, 'forSpecies' | 'botanicalName' | 'hint'>> = {},
): Feed => ({
  key,
  name,
  category,
  dryMatter: v[0],
  crudeProtein: v[1],
  crudeFat: v[2],
  crudeFibre: v[3],
  calcium: v[4],
  phosphorus: v[5],
  copper: v[6],
  forSpecies: extra.forSpecies ?? null,
  botanicalName: extra.botanicalName ?? null,
  hint: extra.hint ?? null,
});

export const FEED_CATALOG: readonly Feed[] = [
  // ── Raufutter ──
  f('heu', 'Wiesenheu', 'roughage', [86, 11, 2.5, 30, 5, 2.7, 7], { hint: 'Grundfutter, möglichst zur freien Aufnahme' }),
  f('luzerneheu', 'Luzerneheu', 'roughage', [86, 18, 2.5, 28, 15, 2.8, 9], { botanicalName: 'Medicago sativa', hint: 'eiweiß- und calciumreich, nur als Teil der Ration' }),
  f('stroh', 'Stroh (Weizen)', 'roughage', [86, 4, 1.5, 42, 3, 1, 4], { hint: 'Beschäftigung und Rohfaser, kaum Nährstoffe' }),
  f('grassilage', 'Grassilage', 'roughage', [35, 15, 3.5, 25, 6, 3.5, 8]),
  // ── Grünfutter ──
  f('gras', 'Gras (frisch, Weide)', 'fresh', [18, 18, 4, 22, 6, 4, 9], { hint: 'langsam anfüttern' }),
  f('loewenzahn', 'Löwenzahn', 'fresh', [15, 18, 4, 13, 9, 4.5, 10], { botanicalName: 'Taraxacum officinale' }),
  f('salat', 'Blattsalat', 'vegetable', [5, 25, 4, 15, 8, 6, 8], { botanicalName: 'Lactuca sativa' }),
  f('mangold', 'Mangold', 'vegetable', [8, 25, 3, 10, 8, 4.5, 8], { botanicalName: 'Beta vulgaris' }),
  f('petersilie', 'Petersilie', 'vegetable', [15, 20, 4, 12, 15, 5, 10], { botanicalName: 'Petroselinum crispum' }),
  // ── Saftfutter ──
  f('moehre', 'Möhren', 'vegetable', [12, 9, 1.5, 9, 3.5, 3, 4], { botanicalName: 'Daucus carota' }),
  f('futterruebe', 'Futterrüben', 'vegetable', [14, 8, 1, 7, 2, 2, 5], { botanicalName: 'Beta vulgaris' }),
  f('kuerbis', 'Kürbis', 'vegetable', [9, 12, 3, 12, 2.5, 4, 6], { botanicalName: 'Cucurbita maxima' }),
  f('apfel', 'Äpfel', 'vegetable', [15, 2.5, 2, 6, 0.5, 0.8, 3], { botanicalName: 'Malus domestica' }),
  // ── Getreide ──
  f('hafer', 'Hafer', 'grain', [88, 12, 5.5, 11, 1, 3.5, 4], { botanicalName: 'Avena sativa' }),
  f('weizen', 'Weizen', 'grain', [88, 13.5, 2, 2.9, 0.6, 3.8, 5], { botanicalName: 'Triticum aestivum' }),
  f('gerste', 'Gerste', 'grain', [88, 12, 2.5, 5.5, 0.7, 3.9, 5], { botanicalName: 'Hordeum vulgare' }),
  f('mais', 'Körnermais', 'grain', [88, 10, 4.5, 2.6, 0.4, 3.2, 3], { botanicalName: 'Zea mays' }),
  // ── Fertigfutter ──
  f('legehennen', 'Legehennen-Alleinfutter', 'compound', [88, 19, 5, 4.5, 41, 5.5, 15], { hint: 'Hauptfutter der Legehennen, etwa 110–130 g je Tier und Tag' }),
  f('kueken', 'Küken-/Junghennenfutter', 'compound', [88, 21, 4.5, 4, 11, 7.5, 15]),
  f('koernermix', 'Körnermischung Geflügel', 'compound', [88, 11.5, 4, 4, 0.8, 3.5, 5], { hint: 'Ergänzung, höchstens ein Drittel der Ration' }),
  f('kaninchenpellets', 'Kaninchen-Alleinfutter (Pellets)', 'compound', [89, 17, 3.5, 17, 10, 6, 15]),
  f('meerschweinchenpellets', 'Meerschweinchen-Pellets', 'compound', [89, 18, 3.5, 15, 9, 6, 15]),
  f('pferdemuesli', 'Pferdemüsli', 'compound', [88, 11, 5, 9, 7, 4.5, 20]),
  f('milchleistungsfutter', 'Milchleistungsfutter (Ziege/Schaf/Rind)', 'compound', [88, 20, 4, 9, 9, 5.5, 20]),
  f('schweinefutter', 'Schweine-Alleinfutter', 'compound', [88, 18, 3.5, 4.5, 7.5, 5.5, 20]),
  // ── Mineralfutter ──
  f('muschelkalk', 'Muschelkalk / Austernschalen', 'mineral', [99, 0, 0, 0, 380, 0.5, 0], { forSpecies: ['poultry'], hint: 'zur freien Aufnahme in einer eigenen Schale' }),
  f('mineral_rind', 'Mineralfutter Rind', 'mineral', [95, 0, 0, 0, 140, 60, 1000], { forSpecies: ['cattle'] }),
  f('mineral_schaf', 'Mineralfutter Schaf (kupferarm)', 'mineral', [95, 0, 0, 0, 150, 40, 10], { forSpecies: ['sheep'] }),
  f('mineral_ziege', 'Mineralfutter Ziege', 'mineral', [95, 0, 0, 0, 140, 50, 600], { forSpecies: ['goat'] }),
  f('mineral_pferd', 'Mineralfutter Pferd', 'mineral', [95, 0, 0, 0, 150, 50, 1000], { forSpecies: ['horse'] }),
];

const BY_KEY = new Map(FEED_CATALOG.map((feed) => [feed.key, feed]));

export function feedByKey(key: string): Feed | undefined {
  return BY_KEY.get(key);
}
