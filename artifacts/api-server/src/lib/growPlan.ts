/**
 * Grow-Plan: the phases of a cannabis plant from germination to the jar, with
 * the target climate, pH, EC and feeding for each phase and the steps on the
 * way (repotting, topping, switching the light, flushing, harvest, drying,
 * curing). Fixed rules from the usual grow guides – nothing is stored but the
 * plant's start, type and length of flowering (docs/grow.md).
 */

import { addDays, daysBetween } from './feedSeason';

export type GrowEnvironment = 'indoor' | 'outdoor' | 'greenhouse';
export type GrowMedium = 'soil' | 'coco' | 'hydro';
export type StrainType = 'indica' | 'sativa' | 'hybrid' | 'ruderalis';
export type Flowering = 'photo' | 'auto';
export type SeedSex = 'feminized' | 'regular' | 'unknown';
export type PhaseKey = 'germination' | 'seedling' | 'veg' | 'flower' | 'flush' | 'drying' | 'curing' | 'done';

export const GROW_ENVIRONMENTS: GrowEnvironment[] = ['indoor', 'outdoor', 'greenhouse'];
export const GROW_MEDIA: GrowMedium[] = ['soil', 'coco', 'hydro'];
export const STRAIN_TYPES: StrainType[] = ['indica', 'sativa', 'hybrid', 'ruderalis'];

/** Weeks of flowering when the pack says nothing. */
export function defaultFlowerWeeks(type: StrainType, flowering: Flowering): number {
  if (flowering === 'auto' || type === 'ruderalis') return 7;
  return { indica: 8, hybrid: 9, sativa: 11 }[type];
}

const SEEDLING_FROM = 5;
const VEG_FROM = 19;
/** Indoors a photoperiodic plant grows four weeks before 12/12; an autoflower three. */
const VEG_WEEKS_INDOOR = 4;
const VEG_WEEKS_AUTO = 3;
const FLUSH_DAYS: Record<GrowMedium, number> = { soil: 10, coco: 7, hydro: 7 };
const DRYING_DAYS = 10;
const CURING_DAYS = 28;
/** Last frosts are over (Eisheilige). */
const PLANT_OUT = '05-15';

export interface PlantForPlan {
  strainType: StrainType;
  flowering: Flowering;
  seedSex: SeedSex;
  flowerWeeks: number;
  startedOn: string;
  flipOn: string | null;
  harvestedOn: string | null;
}

export interface GrowForPlan {
  environment: GrowEnvironment;
  medium: GrowMedium;
}

/** The day flowering starts: set by hand, by the light indoors, by the season outdoors, by itself for autoflowers. */
export function flowerStart(plant: PlantForPlan, grow: GrowForPlan): string {
  if (plant.flipOn) return plant.flipOn;
  const vegEnd = addDays(plant.startedOn, VEG_FROM);
  if (plant.flowering === 'auto') return addDays(vegEnd, VEG_WEEKS_AUTO * 7);
  if (grow.environment === 'indoor') return addDays(vegEnd, VEG_WEEKS_INDOOR * 7);
  // Outdoors the nights get long enough from about the end of July (greenhouse a little earlier).
  const natural = `${plant.startedOn.slice(0, 4)}-${grow.environment === 'greenhouse' ? '07-25' : '08-01'}`;
  const earliest = addDays(vegEnd, 21);
  return natural > earliest ? natural : earliest;
}

export interface Phase {
  key: PhaseKey;
  from: string;
  to: string;
}

export function phases(plant: PlantForPlan, grow: GrowForPlan): { phases: Phase[]; harvestOn: string } {
  const s = plant.startedOn;
  const flip = flowerStart(plant, grow);
  const expectedHarvest = addDays(flip, plant.flowerWeeks * 7);
  const harvestOn = plant.harvestedOn ?? expectedHarvest;
  const flushFrom = addDays(expectedHarvest, -FLUSH_DAYS[grow.medium]);
  const list: Phase[] = [
    { key: 'germination', from: s, to: addDays(s, SEEDLING_FROM - 1) },
    { key: 'seedling', from: addDays(s, SEEDLING_FROM), to: addDays(s, VEG_FROM - 1) },
    { key: 'veg', from: addDays(s, VEG_FROM), to: addDays(flip, -1) },
    { key: 'flower', from: flip, to: addDays(flushFrom < harvestOn ? flushFrom : harvestOn, -1) },
    { key: 'flush', from: flushFrom < harvestOn ? flushFrom : harvestOn, to: addDays(harvestOn, -1) },
    { key: 'drying', from: harvestOn, to: addDays(harvestOn, DRYING_DAYS - 1) },
    { key: 'curing', from: addDays(harvestOn, DRYING_DAYS), to: addDays(harvestOn, DRYING_DAYS + CURING_DAYS - 1) },
  ];
  // A phase can drop out (harvested early, a flip set before the seedling was big).
  return { phases: list.filter((p) => p.from <= p.to), harvestOn };
}

export function currentPhase(list: Phase[], today: string): PhaseKey {
  if (today < list[0]!.from) return 'germination';
  return list.find((p) => p.from <= today && today <= p.to)?.key ?? 'done';
}

export interface Targets {
  light: string;
  tempC: [number, number] | null;
  humidity: [number, number] | null;
  vpd: [number, number] | null;
  ph: [number, number] | null;
  ec: [number, number] | null;
  feeding: string;
  watering: string;
}

const PH: Record<GrowMedium, [number, number]> = { soil: [6.2, 6.8], coco: [5.8, 6.2], hydro: [5.6, 6.0] };

/** What the plant wants in a phase. */
export function targets(phase: PhaseKey, plant: Pick<PlantForPlan, 'flowering'>, grow: GrowForPlan): Targets {
  const indoor = grow.environment === 'indoor';
  const growLight = indoor ? (plant.flowering === 'auto' ? '20/4 (20 Stunden Licht)' : '18/6 (18 Stunden Licht)') : 'Natürliches Licht – sonnigster Platz';
  const flowerLight = indoor
    ? plant.flowering === 'auto'
      ? '20/4 bleibt – Autoflower blühen von selbst'
      : '12/12 – absolute Dunkelheit in der Nacht'
    : grow.environment === 'greenhouse'
      ? 'Natürliches Licht – nachts kein Kunstlicht in der Nähe'
      : 'Natürliches Licht';
  const ph = PH[grow.medium];
  switch (phase) {
    case 'germination':
      return { light: 'Dunkel und warm, bis der Keimling da ist', tempC: [22, 26], humidity: [70, 90], vpd: null, ph: null, ec: null, feeding: 'Kein Dünger.', watering: 'Nur feucht halten, nicht nass.' };
    case 'seedling':
      return {
        light: indoor ? `${growLight}, Lampe weiter weg oder gedimmt` : 'Hell, aber vor praller Mittagssonne schützen',
        tempC: [22, 26],
        humidity: [65, 70],
        vpd: [0.4, 0.8],
        ph,
        ec: [0.4, 0.8],
        feeding: grow.medium === 'soil' ? 'Kein Dünger – vorgedüngte Erde reicht zwei bis drei Wochen.' : 'Sehr schwach düngen, Calcium und Magnesium dazu.',
        watering: 'Wenig und rund um den Stamm; Topf zwischendurch antrocknen lassen.',
      };
    case 'veg':
      return {
        light: growLight,
        tempC: [22, 28],
        humidity: [50, 70],
        vpd: [0.8, 1.2],
        ph,
        ec: grow.medium === 'soil' ? [0.8, 1.4] : [1.0, 1.6],
        feeding: 'Stickstoffbetonter Wachstumsdünger (etwa NPK 3-1-2), mit halber Dosis anfangen.',
        watering: 'Gießen, wenn der Topf leicht ist; bei Kokos täglich mit etwas Ablauf.',
      };
    case 'flower':
      return {
        light: flowerLight,
        tempC: [20, 26],
        humidity: [40, 50],
        vpd: [1.2, 1.5],
        ph,
        ec: grow.medium === 'soil' ? [1.2, 1.8] : [1.4, 2.0],
        feeding: 'Blütedünger mit Phosphor und Kalium (etwa NPK 1-3-2), Stickstoff zurückfahren.',
        watering: 'Gleichmäßig gießen; Staunässe vermeiden, sie fördert Schimmel.',
      };
    case 'flush':
      return {
        light: flowerLight,
        tempC: [20, 24],
        humidity: [40, 45],
        vpd: [1.2, 1.6],
        ph,
        ec: [0, 0.4],
        feeding: 'Kein Dünger mehr – nur Wasser, damit die Pflanze ihre Reserven aufbraucht.',
        watering: 'Normale Mengen mit klarem Wasser.',
      };
    case 'drying':
      return { light: 'Dunkel', tempC: [15, 20], humidity: [55, 62], vpd: null, ph: null, ec: null, feeding: '—', watering: '—' };
    case 'curing':
      return { light: 'Dunkel', tempC: [15, 21], humidity: [58, 62], vpd: null, ph: null, ec: null, feeding: '—', watering: '—' };
    default:
      return { light: '—', tempC: null, humidity: null, vpd: null, ph: null, ec: null, feeding: '—', watering: '—' };
  }
}

export interface GrowStep {
  on: string;
  text: string;
  past: boolean;
}

/** The steps on the way, dated. */
export function steps(plant: PlantForPlan, grow: GrowForPlan, today: string): GrowStep[] {
  const s = plant.startedOn;
  const auto = plant.flowering === 'auto';
  const indoor = grow.environment === 'indoor';
  const flip = flowerStart(plant, grow);
  const { phases: list, harvestOn } = phases(plant, grow);
  const flushFrom = list.find((p) => p.key === 'flush')?.from;
  const out: [string, string][] = [
    [s, 'Samen keimen lassen: auf feuchtem Küchenpapier oder 0,5–1 cm tief in Anzuchterde.'],
    [
      addDays(s, SEEDLING_FROM),
      auto
        ? 'Keimling direkt in den Endtopf setzen – Autoflower mögen kein Umtopfen.'
        : 'Keimling in einen kleinen Topf (0,5–1 l) mit leichter Erde setzen.',
    ],
  ];
  if (!auto) {
    out.push([addDays(s, VEG_FROM), `In den Endtopf umtopfen (${indoor ? '11–20 l' : '30–60 l'}, Stofftöpfe belüften die Wurzeln).`]);
    out.push([addDays(s, VEG_FROM + 7), 'Toppen oder FIM über dem 5. Knoten – nur bei kräftigen Pflanzen. Danach Triebe mit LST herunterbinden.']);
  } else {
    out.push([addDays(s, VEG_FROM + 3), 'Sanftes LST: Haupttrieb vorsichtig herunterbinden. Nicht toppen – Autoflower haben keine Zeit, sich zu erholen.']);
  }
  if (grow.environment !== 'indoor') {
    const plantOut = `${s.slice(0, 4)}-${PLANT_OUT}`;
    out.push([plantOut > addDays(s, VEG_FROM) ? plantOut : addDays(s, VEG_FROM), 'Nach den Eisheiligen nach draußen bzw. ins Gewächshaus: erst ein paar Tage abhärten.']);
  }
  if (!auto && indoor) {
    out.push([addDays(flip, -3), 'Lollipopping: untere Triebe ohne Licht entfernen, damit die Kraft in die oberen Blüten geht.']);
    out.push([flip, 'Licht auf 12/12 umstellen – ab jetzt keine Lichtlecks im Zelt.']);
  } else {
    out.push([flip, auto ? 'Die Blüte beginnt von selbst.' : 'Die Nächte werden länger – die Blüte beginnt von selbst.']);
  }
  if (plant.seedSex !== 'feminized') {
    out.push([addDays(flip, 7), 'Geschlecht prüfen: männliche Pflanzen (Pollensäcke) sofort entfernen, sonst bilden sich Samen.']);
  }
  out.push([addDays(flip, 21), auto ? 'Nur einzelne große Blätter entfernen, die Blüten verschatten.' : 'Entlauben: große Blätter entfernen, die Blüten verschatten, und das Innere luftiger machen.']);
  if (grow.environment !== 'indoor') {
    out.push([addDays(flip, 14), 'Blüten regelmäßig auf Schimmel (Botrytis) prüfen – besonders nach Regen und kalten Nächten.']);
  }
  out.push([addDays(harvestOn, -14), 'Trichome mit der Lupe prüfen: milchig = reif, mehr Bernstein = wirkt schwerer.']);
  if (flushFrom && flushFrom < harvestOn) out.push([flushFrom, 'Spülen: ab jetzt nur noch klares Wasser geben.']);
  out.push([harvestOn, 'Ernten: Pflanze abschneiden, große Blätter entfernen, Nassgewicht notieren.']);
  out.push([addDays(harvestOn, 1), 'Kopfüber trocknen: dunkel, 15–20 °C, 55–62 % Luftfeuchte, leichte Luftbewegung.']);
  out.push([addDays(harvestOn, DRYING_DAYS), 'Trocken, wenn dünne Stiele knacken: Blüten in Gläser füllen, Trockengewicht notieren.']);
  out.push([addDays(harvestOn, DRYING_DAYS + 1), 'Curing: Gläser in der ersten Woche täglich kurz öffnen (Burping).']);
  out.push([addDays(harvestOn, DRYING_DAYS + 8), 'Ab jetzt einmal pro Woche lüften; nach vier Wochen ist das Curing gut.']);
  return out
    .filter(([on]) => on >= s)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([on, text]) => ({ on, text, past: on < today }));
}

export interface PlantPlan {
  phases: Phase[];
  current: PhaseKey;
  /** Days since germination (from 1). */
  day: number;
  harvestOn: string;
  flipOn: string;
  targets: Targets;
  steps: GrowStep[];
  /** Advice about the timing (late outdoor start …). */
  hints: string[];
}

export function plantPlan(plant: PlantForPlan, grow: GrowForPlan, today: string): PlantPlan {
  const { phases: list, harvestOn } = phases(plant, grow);
  const current = currentPhase(list, today);
  const hints: string[] = [];
  const month = Number(plant.startedOn.slice(5, 7));
  if (grow.environment !== 'indoor' && plant.flowering === 'photo' && month >= 7) {
    hints.push('Spät gestartet: draußen blüht die Pflanze ab August – sie bleibt klein. Für späte Starts eignen sich Autoflower.');
  }
  if (grow.environment !== 'indoor' && harvestOn.slice(5) > '10-20') {
    hints.push('Die Ernte fällt in die kalte, nasse Zeit – Schimmelgefahr. Sorten mit kurzer Blüte sind draußen sicherer.');
  }
  return {
    phases: list,
    current,
    day: Math.max(1, daysBetween(plant.startedOn, today) + 1),
    harvestOn,
    flipOn: flowerStart(plant, grow),
    targets: targets(current, plant, grow),
    steps: steps(plant, grow, today),
    hints,
  };
}

// ── KCanG ─────────────────────────────────────────────────────────────────────

/** § 9 KCanG: up to 3 plants at the same time per adult at home; § 3: up to 50 g dried at home. */
export const PLANTS_PER_ADULT = 3;
export const HOME_GRAMS_PER_ADULT = 50;

export function kcangCheck(activePlants: number, adults: number, dryGramsLastYear: number) {
  const maxPlants = PLANTS_PER_ADULT * adults;
  const maxGrams = HOME_GRAMS_PER_ADULT * adults;
  return {
    activePlants,
    maxPlants,
    plantsOver: activePlants > maxPlants,
    dryGramsLastYear,
    maxGrams,
    gramsOver: dryGramsLastYear > maxGrams,
  };
}
