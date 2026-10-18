/**
 * Anbaudaten – the starting catalog of the Beet-Architekt (docs/beet-architekt.md).
 *
 * Fixed, reviewed data, not AI output: every rule of the planner (spacing,
 * neighbours, crop rotation, dates) is calculated from it. Dates are weeks
 * relative to a bed's last spring frost (negative = before), so the calendar
 * moves with the bed's location. Neighbour lists follow the usual German
 * Mischkultur tables; `gardenCatalog.test.ts` keeps them consistent.
 */

export type CropGroup = 'vegetable' | 'herb' | 'flower' | 'fruit';
export type Feeder = 'heavy' | 'medium' | 'light';
/** The least light a crop does well with. */
export type Light = 'full' | 'partial' | 'shade';

export interface WeekRange {
  from: number;
  to: number;
}

export interface Crop {
  key: string;
  name: string;
  botanicalName: string;
  group: CropGroup;
  /** Plant family – decides crop rotation. */
  family: string;
  feeder: Feeder;
  /** Distance between plants in a row, and between rows (cm). */
  spacingCm: number;
  rowSpacingCm: number;
  light: Light;
  frostHardy: boolean;
  sowIndoor: WeekRange | null;
  directSow: WeekRange | null;
  plantOut: WeekRange | null;
  /** Harvest months 1–12; from > to wraps over the new year. */
  harvest: { from: number; to: number };
  good: string[];
  bad: string[];
  /** Dot colour in the planner. */
  color: string;
}

const w = (from: number, to: number): WeekRange => ({ from, to });
const m = (from: number, to: number) => ({ from, to });

const NACHTSCHATTEN = 'Nachtschattengewächse';
const KUERBIS = 'Kürbisgewächse';
const HUELSEN = 'Hülsenfrüchtler';
const DOLDEN = 'Doldenblütler';
const KREUZ = 'Kreuzblütler';
const FUCHSSCHWANZ = 'Fuchsschwanzgewächse';
const KORB = 'Korbblütler';
const LAUCH = 'Lauchgewächse';
const LIPPEN = 'Lippenblütler';

const KOHL = ['kohlrabi', 'brokkoli', 'blumenkohl', 'weisskohl', 'gruenkohl'];

function kohl(key: string, name: string, botanicalName: string, extra: Partial<Crop>): Crop {
  return {
    key,
    name,
    botanicalName,
    group: 'vegetable',
    family: KREUZ,
    feeder: 'heavy',
    spacingCm: 50,
    rowSpacingCm: 60,
    light: 'partial',
    frostHardy: true,
    sowIndoor: w(-10, -6),
    directSow: null,
    plantOut: w(-2, 4),
    harvest: m(7, 10),
    good: ['sellerie', 'tomate', 'salat', 'spinat', 'rote_bete', 'buschbohne', 'erbse', 'kartoffel', 'dill', 'salbei', 'thymian', 'kapuzinerkresse', 'ringelblume', 'minze', 'borretsch'],
    bad: ['erdbeere', 'zwiebel', 'knoblauch'],
    color: '#6E8F4E',
    ...extra,
  };
}

export const GARDEN_CATALOG: readonly Crop[] = [
  // ── Nachtschattengewächse ────────────────────────────────────────────────
  { key: 'tomate', name: 'Tomate', botanicalName: 'Solanum lycopersicum', group: 'vegetable', family: NACHTSCHATTEN, feeder: 'heavy', spacingCm: 60, rowSpacingCm: 80, light: 'full', frostHardy: false, sowIndoor: w(-10, -6), directSow: null, plantOut: w(0, 3), harvest: m(7, 10), good: ['basilikum', 'petersilie', 'moehre', 'salat', 'knoblauch', 'kapuzinerkresse', 'ringelblume', 'tagetes', 'spinat', 'sellerie', 'lauch', 'schnittlauch', 'radieschen', 'minze', 'paprika', ...KOHL], bad: ['kartoffel', 'fenchel', 'erbse', 'gurke'], color: '#E2683C' },
  { key: 'paprika', name: 'Paprika', botanicalName: 'Capsicum annuum', group: 'vegetable', family: NACHTSCHATTEN, feeder: 'heavy', spacingCm: 45, rowSpacingCm: 50, light: 'full', frostHardy: false, sowIndoor: w(-12, -8), directSow: null, plantOut: w(1, 3), harvest: m(8, 10), good: ['tomate', 'moehre', 'basilikum', 'zwiebel'], bad: ['fenchel', 'erbse', 'rote_bete'], color: '#D93B2B' },
  { key: 'chili', name: 'Chili', botanicalName: 'Capsicum annuum', group: 'vegetable', family: NACHTSCHATTEN, feeder: 'heavy', spacingCm: 40, rowSpacingCm: 50, light: 'full', frostHardy: false, sowIndoor: w(-12, -8), directSow: null, plantOut: w(1, 3), harvest: m(8, 10), good: ['basilikum', 'moehre', 'zwiebel'], bad: ['fenchel'], color: '#B3261E' },
  { key: 'aubergine', name: 'Aubergine', botanicalName: 'Solanum melongena', group: 'vegetable', family: NACHTSCHATTEN, feeder: 'heavy', spacingCm: 50, rowSpacingCm: 60, light: 'full', frostHardy: false, sowIndoor: w(-12, -8), directSow: null, plantOut: w(2, 4), harvest: m(8, 9), good: ['buschbohne', 'basilikum'], bad: ['fenchel'], color: '#5B3A6E' },
  { key: 'kartoffel', name: 'Kartoffel', botanicalName: 'Solanum tuberosum', group: 'vegetable', family: NACHTSCHATTEN, feeder: 'heavy', spacingCm: 35, rowSpacingCm: 65, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(-3, 2), plantOut: null, harvest: m(6, 9), good: ['buschbohne', 'kapuzinerkresse', 'ringelblume', 'spinat', 'mais', ...KOHL], bad: ['tomate', 'sellerie', 'kuerbis', 'gurke', 'erbse'], color: '#C9A66B' },

  // ── Kürbisgewächse ───────────────────────────────────────────────────────
  { key: 'gurke', name: 'Gurke', botanicalName: 'Cucumis sativus', group: 'vegetable', family: KUERBIS, feeder: 'heavy', spacingCm: 40, rowSpacingCm: 100, light: 'full', frostHardy: false, sowIndoor: w(-4, -2), directSow: w(1, 4), plantOut: w(1, 3), harvest: m(7, 9), good: ['dill', 'buschbohne', 'stangenbohne', 'erbse', 'salat', 'sellerie', 'mais', 'knoblauch', 'zwiebel', 'basilikum', 'borretsch', 'fenchel', ...KOHL], bad: ['tomate', 'kartoffel', 'radieschen', 'rettich'], color: '#4F8A3C' },
  { key: 'zucchini', name: 'Zucchini', botanicalName: 'Cucurbita pepo', group: 'vegetable', family: KUERBIS, feeder: 'heavy', spacingCm: 100, rowSpacingCm: 100, light: 'full', frostHardy: false, sowIndoor: w(-4, -2), directSow: w(1, 3), plantOut: w(0, 3), harvest: m(7, 9), good: ['mais', 'buschbohne', 'stangenbohne', 'zwiebel', 'kapuzinerkresse', 'ringelblume', 'salat', 'basilikum', 'borretsch', 'erbse'], bad: ['kartoffel'], color: '#3E7A34' },
  { key: 'kuerbis', name: 'Kürbis', botanicalName: 'Cucurbita maxima', group: 'vegetable', family: KUERBIS, feeder: 'heavy', spacingCm: 150, rowSpacingCm: 150, light: 'full', frostHardy: false, sowIndoor: w(-4, -2), directSow: w(1, 3), plantOut: w(0, 3), harvest: m(9, 10), good: ['mais', 'buschbohne', 'stangenbohne', 'kapuzinerkresse', 'ringelblume'], bad: ['kartoffel'], color: '#E8913A' },

  // ── Hülsenfrüchtler ──────────────────────────────────────────────────────
  { key: 'buschbohne', name: 'Buschbohne', botanicalName: 'Phaseolus vulgaris var. nanus', group: 'vegetable', family: HUELSEN, feeder: 'light', spacingCm: 10, rowSpacingCm: 40, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(1, 8), plantOut: null, harvest: m(7, 9), good: ['bohnenkraut', 'kartoffel', 'gurke', 'salat', 'rote_bete', 'radieschen', 'sellerie', 'mais', 'zucchini', 'kuerbis', 'aubergine', 'erdbeere', 'mangold', 'spinat', ...KOHL], bad: ['zwiebel', 'lauch', 'knoblauch', 'schnittlauch', 'erbse', 'fenchel'], color: '#7FA650' },
  { key: 'stangenbohne', name: 'Stangenbohne', botanicalName: 'Phaseolus vulgaris', group: 'vegetable', family: HUELSEN, feeder: 'light', spacingCm: 15, rowSpacingCm: 60, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(1, 5), plantOut: null, harvest: m(7, 10), good: ['bohnenkraut', 'mais', 'gurke', 'salat', 'zucchini', 'kuerbis', 'radieschen', 'sellerie'], bad: ['zwiebel', 'lauch', 'knoblauch', 'schnittlauch', 'erbse', 'fenchel', 'rote_bete'], color: '#5E8F3A' },
  { key: 'erbse', name: 'Erbse', botanicalName: 'Pisum sativum', group: 'vegetable', family: HUELSEN, feeder: 'light', spacingCm: 5, rowSpacingCm: 40, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-8, -2), plantOut: null, harvest: m(6, 7), good: ['moehre', 'gurke', 'salat', 'radieschen', 'zucchini', 'dill', 'rettich', 'fenchel', ...KOHL], bad: ['buschbohne', 'stangenbohne', 'tomate', 'kartoffel', 'zwiebel', 'lauch', 'knoblauch', 'paprika', 'schnittlauch'], color: '#9BC46B' },

  // ── Doldenblütler ────────────────────────────────────────────────────────
  { key: 'moehre', name: 'Möhre', botanicalName: 'Daucus carota subsp. sativus', group: 'vegetable', family: DOLDEN, feeder: 'medium', spacingCm: 5, rowSpacingCm: 25, light: 'full', frostHardy: true, sowIndoor: null, directSow: w(-6, 8), plantOut: null, harvest: m(6, 11), good: ['zwiebel', 'lauch', 'erbse', 'tomate', 'salat', 'radieschen', 'rettich', 'schnittlauch', 'dill', 'mangold', 'paprika', 'chili', 'salbei', 'knoblauch', 'rosmarin'], bad: [], color: '#F2A93B' },
  { key: 'pastinake', name: 'Pastinake', botanicalName: 'Pastinaca sativa', group: 'vegetable', family: DOLDEN, feeder: 'medium', spacingCm: 10, rowSpacingCm: 35, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-6, -2), plantOut: null, harvest: m(10, 3), good: ['zwiebel', 'radieschen', 'salat'], bad: [], color: '#E9D8A6' },
  { key: 'petersilie', name: 'Petersilie', botanicalName: 'Petroselinum crispum', group: 'herb', family: DOLDEN, feeder: 'medium', spacingCm: 15, rowSpacingCm: 25, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-6, 6), plantOut: null, harvest: m(5, 11), good: ['tomate', 'radieschen', 'zwiebel'], bad: ['salat'], color: '#3F8F4A' },
  { key: 'sellerie', name: 'Sellerie', botanicalName: 'Apium graveolens', group: 'vegetable', family: DOLDEN, feeder: 'heavy', spacingCm: 40, rowSpacingCm: 40, light: 'partial', frostHardy: false, sowIndoor: w(-12, -8), directSow: null, plantOut: w(1, 3), harvest: m(9, 11), good: ['lauch', 'tomate', 'buschbohne', 'stangenbohne', 'gurke', ...KOHL], bad: ['kartoffel', 'salat', 'mais'], color: '#A3C77A' },
  { key: 'fenchel', name: 'Fenchel', botanicalName: 'Foeniculum vulgare var. azoricum', group: 'vegetable', family: DOLDEN, feeder: 'medium', spacingCm: 30, rowSpacingCm: 40, light: 'full', frostHardy: false, sowIndoor: w(-6, -4), directSow: w(4, 10), plantOut: w(1, 4), harvest: m(7, 10), good: ['salat', 'gurke', 'erbse', 'feldsalat'], bad: ['tomate', 'buschbohne', 'stangenbohne', 'kohlrabi', 'paprika', 'chili', 'aubergine', 'dill', 'koriander'], color: '#CFE3A8' },
  { key: 'dill', name: 'Dill', botanicalName: 'Anethum graveolens', group: 'herb', family: DOLDEN, feeder: 'light', spacingCm: 20, rowSpacingCm: 25, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(-2, 12), plantOut: null, harvest: m(6, 9), good: ['gurke', 'moehre', 'salat', 'zwiebel', 'rote_bete', 'erbse', ...KOHL], bad: ['fenchel'], color: '#8DB85A' },
  { key: 'koriander', name: 'Koriander', botanicalName: 'Coriandrum sativum', group: 'herb', family: DOLDEN, feeder: 'light', spacingCm: 10, rowSpacingCm: 25, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(-1, 10), plantOut: null, harvest: m(6, 9), good: ['spinat'], bad: ['fenchel'], color: '#6FAE58' },

  // ── Kreuzblütler ─────────────────────────────────────────────────────────
  kohl('kohlrabi', 'Kohlrabi', 'Brassica oleracea var. gongylodes', { feeder: 'medium', spacingCm: 30, rowSpacingCm: 30, plantOut: w(-4, 8), harvest: m(5, 10), color: '#B9D88F', bad: ['erdbeere', 'zwiebel', 'knoblauch', 'fenchel'] }),
  kohl('brokkoli', 'Brokkoli', 'Brassica oleracea var. italica', { sowIndoor: w(-8, -4), harvest: m(7, 10), color: '#4B7A3A' }),
  kohl('blumenkohl', 'Blumenkohl', 'Brassica oleracea var. botrytis', { plantOut: w(-2, 3), harvest: m(6, 10), color: '#EFE8D2' }),
  kohl('weisskohl', 'Weißkohl', 'Brassica oleracea var. capitata', { harvest: m(8, 11), color: '#C9DDA6' }),
  kohl('gruenkohl', 'Grünkohl', 'Brassica oleracea var. sabellica', { sowIndoor: w(2, 6), plantOut: w(6, 10), spacingCm: 45, rowSpacingCm: 50, harvest: m(11, 2), color: '#355E2B' }),
  { key: 'radieschen', name: 'Radieschen', botanicalName: 'Raphanus sativus var. sativus', group: 'vegetable', family: KREUZ, feeder: 'light', spacingCm: 5, rowSpacingCm: 15, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-6, 16), plantOut: null, harvest: m(4, 10), good: ['moehre', 'salat', 'spinat', 'erbse', 'buschbohne', 'stangenbohne', 'tomate', 'kapuzinerkresse', 'petersilie', 'pastinake', 'mangold', 'erdbeere'], bad: ['gurke'], color: '#D9467A' },
  { key: 'rettich', name: 'Rettich', botanicalName: 'Raphanus sativus var. niger', group: 'vegetable', family: KREUZ, feeder: 'medium', spacingCm: 15, rowSpacingCm: 25, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-4, 12), plantOut: null, harvest: m(5, 10), good: ['moehre', 'salat', 'erbse', 'spinat'], bad: ['gurke'], color: '#E8E1E9' },
  { key: 'rucola', name: 'Rucola', botanicalName: 'Eruca sativa', group: 'vegetable', family: KREUZ, feeder: 'light', spacingCm: 10, rowSpacingCm: 20, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-4, 16), plantOut: null, harvest: m(5, 10), good: ['salat', 'buschbohne'], bad: [], color: '#5C8C3E' },

  // ── Fuchsschwanzgewächse ─────────────────────────────────────────────────
  { key: 'spinat', name: 'Spinat', botanicalName: 'Spinacia oleracea', group: 'vegetable', family: FUCHSSCHWANZ, feeder: 'medium', spacingCm: 8, rowSpacingCm: 20, light: 'shade', frostHardy: true, sowIndoor: null, directSow: w(-8, -2), plantOut: null, harvest: m(4, 11), good: ['kartoffel', 'radieschen', 'rettich', 'erdbeere', 'tomate', 'buschbohne', 'koriander', ...KOHL], bad: ['mangold', 'rote_bete'], color: '#2F6B3A' },
  { key: 'mangold', name: 'Mangold', botanicalName: 'Beta vulgaris subsp. vulgaris', group: 'vegetable', family: FUCHSSCHWANZ, feeder: 'medium', spacingCm: 30, rowSpacingCm: 40, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-2, 6), plantOut: null, harvest: m(6, 11), good: ['moehre', 'radieschen', 'salat', 'buschbohne'], bad: ['spinat', 'rote_bete'], color: '#C23B5A' },
  { key: 'rote_bete', name: 'Rote Bete', botanicalName: 'Beta vulgaris subsp. vulgaris var. conditiva', group: 'vegetable', family: FUCHSSCHWANZ, feeder: 'medium', spacingCm: 10, rowSpacingCm: 30, light: 'partial', frostHardy: false, sowIndoor: null, directSow: w(-1, 8), plantOut: null, harvest: m(7, 10), good: ['zwiebel', 'knoblauch', 'salat', 'buschbohne', 'dill', ...KOHL], bad: ['spinat', 'mangold', 'lauch', 'mais', 'paprika', 'stangenbohne'], color: '#8E2048' },

  // ── Korbblütler ──────────────────────────────────────────────────────────
  { key: 'salat', name: 'Kopfsalat', botanicalName: 'Lactuca sativa var. capitata', group: 'vegetable', family: KORB, feeder: 'medium', spacingCm: 30, rowSpacingCm: 30, light: 'partial', frostHardy: false, sowIndoor: w(-8, -4), directSow: w(-4, 12), plantOut: w(-4, 12), harvest: m(5, 10), good: ['moehre', 'radieschen', 'rettich', 'zwiebel', 'erdbeere', 'gurke', 'tomate', 'buschbohne', 'stangenbohne', 'erbse', 'dill', 'fenchel', 'lauch', 'rucola', 'zucchini', 'mangold', 'rote_bete', 'pastinake', ...KOHL], bad: ['sellerie', 'petersilie'], color: '#C8E68A' },
  { key: 'ringelblume', name: 'Ringelblume', botanicalName: 'Calendula officinalis', group: 'flower', family: KORB, feeder: 'light', spacingCm: 25, rowSpacingCm: 30, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(-4, 4), plantOut: null, harvest: m(6, 10), good: ['tomate', 'kartoffel', 'zucchini', 'kuerbis', 'erdbeere', ...KOHL], bad: [], color: '#F6A81E' },
  { key: 'tagetes', name: 'Tagetes', botanicalName: 'Tagetes patula', group: 'flower', family: KORB, feeder: 'light', spacingCm: 25, rowSpacingCm: 25, light: 'full', frostHardy: false, sowIndoor: w(-8, -4), directSow: null, plantOut: w(1, 3), harvest: m(6, 10), good: ['tomate', 'kartoffel', 'erdbeere'], bad: [], color: '#E57A1A' },

  // ── weitere Gemüse ───────────────────────────────────────────────────────
  { key: 'feldsalat', name: 'Feldsalat', botanicalName: 'Valerianella locusta', group: 'vegetable', family: 'Baldriangewächse', feeder: 'light', spacingCm: 5, rowSpacingCm: 15, light: 'shade', frostHardy: true, sowIndoor: null, directSow: w(12, 18), plantOut: null, harvest: m(10, 3), good: ['zwiebel', 'erdbeere', 'fenchel'], bad: [], color: '#4E8B47' },
  { key: 'mais', name: 'Zuckermais', botanicalName: 'Zea mays convar. saccharata', group: 'vegetable', family: 'Süßgräser', feeder: 'heavy', spacingCm: 30, rowSpacingCm: 70, light: 'full', frostHardy: false, sowIndoor: w(-3, -1), directSow: w(1, 3), plantOut: w(1, 3), harvest: m(8, 10), good: ['buschbohne', 'stangenbohne', 'kuerbis', 'zucchini', 'gurke', 'kartoffel'], bad: ['sellerie', 'rote_bete'], color: '#EBC74A' },

  // ── Lauchgewächse ────────────────────────────────────────────────────────
  { key: 'zwiebel', name: 'Zwiebel', botanicalName: 'Allium cepa', group: 'vegetable', family: LAUCH, feeder: 'medium', spacingCm: 10, rowSpacingCm: 25, light: 'full', frostHardy: true, sowIndoor: null, directSow: w(-6, -2), plantOut: null, harvest: m(7, 8), good: ['moehre', 'erdbeere', 'salat', 'rote_bete', 'dill', 'gurke', 'zucchini', 'paprika', 'chili', 'petersilie', 'pastinake', 'feldsalat'], bad: ['buschbohne', 'stangenbohne', 'erbse', ...KOHL], color: '#C9A15A' },
  { key: 'lauch', name: 'Lauch', botanicalName: 'Allium porrum', group: 'vegetable', family: LAUCH, feeder: 'heavy', spacingCm: 15, rowSpacingCm: 35, light: 'full', frostHardy: true, sowIndoor: w(-12, -8), directSow: null, plantOut: w(0, 8), harvest: m(9, 3), good: ['moehre', 'sellerie', 'tomate', 'salat', 'erdbeere'], bad: ['buschbohne', 'stangenbohne', 'erbse', 'rote_bete'], color: '#9CB86E' },
  { key: 'knoblauch', name: 'Knoblauch', botanicalName: 'Allium sativum', group: 'vegetable', family: LAUCH, feeder: 'medium', spacingCm: 12, rowSpacingCm: 25, light: 'full', frostHardy: true, sowIndoor: null, directSow: w(18, 24), plantOut: null, harvest: m(7, 7), good: ['erdbeere', 'tomate', 'moehre', 'rote_bete', 'gurke'], bad: ['buschbohne', 'stangenbohne', 'erbse', ...KOHL], color: '#E6DCC8' },
  { key: 'schnittlauch', name: 'Schnittlauch', botanicalName: 'Allium schoenoprasum', group: 'herb', family: LAUCH, feeder: 'medium', spacingCm: 20, rowSpacingCm: 25, light: 'partial', frostHardy: true, sowIndoor: null, directSow: w(-4, 4), plantOut: null, harvest: m(4, 10), good: ['moehre', 'tomate', 'erdbeere'], bad: ['buschbohne', 'stangenbohne', 'erbse'], color: '#5FA05A' },

  // ── Lippenblütler (Kräuter) ──────────────────────────────────────────────
  { key: 'basilikum', name: 'Basilikum', botanicalName: 'Ocimum basilicum', group: 'herb', family: LIPPEN, feeder: 'medium', spacingCm: 25, rowSpacingCm: 30, light: 'full', frostHardy: false, sowIndoor: w(-8, -4), directSow: null, plantOut: w(2, 4), harvest: m(6, 9), good: ['tomate', 'gurke', 'paprika', 'chili', 'zucchini', 'aubergine'], bad: [], color: '#7DBB6A' },
  { key: 'thymian', name: 'Thymian', botanicalName: 'Thymus vulgaris', group: 'herb', family: LIPPEN, feeder: 'light', spacingCm: 25, rowSpacingCm: 30, light: 'full', frostHardy: true, sowIndoor: w(-10, -6), directSow: null, plantOut: w(0, 4), harvest: m(5, 10), good: ['erdbeere', ...KOHL], bad: [], color: '#8A9A6B' },
  { key: 'salbei', name: 'Salbei', botanicalName: 'Salvia officinalis', group: 'herb', family: LIPPEN, feeder: 'light', spacingCm: 40, rowSpacingCm: 40, light: 'full', frostHardy: true, sowIndoor: w(-10, -6), directSow: null, plantOut: w(0, 4), harvest: m(5, 10), good: ['moehre', ...KOHL], bad: [], color: '#9AAE92' },
  { key: 'rosmarin', name: 'Rosmarin', botanicalName: 'Salvia rosmarinus', group: 'herb', family: LIPPEN, feeder: 'light', spacingCm: 50, rowSpacingCm: 50, light: 'full', frostHardy: false, sowIndoor: w(-10, -6), directSow: null, plantOut: w(1, 4), harvest: m(4, 10), good: ['moehre'], bad: [], color: '#6C8C77' },
  { key: 'oregano', name: 'Oregano', botanicalName: 'Origanum vulgare', group: 'herb', family: LIPPEN, feeder: 'light', spacingCm: 25, rowSpacingCm: 30, light: 'full', frostHardy: true, sowIndoor: w(-10, -6), directSow: null, plantOut: w(0, 4), harvest: m(6, 9), good: [], bad: [], color: '#A0B07A' },
  { key: 'minze', name: 'Minze', botanicalName: 'Mentha × piperita', group: 'herb', family: LIPPEN, feeder: 'medium', spacingCm: 40, rowSpacingCm: 40, light: 'shade', frostHardy: true, sowIndoor: null, directSow: null, plantOut: w(-2, 8), harvest: m(5, 9), good: ['tomate', ...KOHL], bad: [], color: '#3FAE7C' },
  { key: 'bohnenkraut', name: 'Bohnenkraut', botanicalName: 'Satureja hortensis', group: 'herb', family: LIPPEN, feeder: 'light', spacingCm: 20, rowSpacingCm: 30, light: 'full', frostHardy: false, sowIndoor: null, directSow: w(1, 4), plantOut: null, harvest: m(7, 9), good: ['buschbohne', 'stangenbohne'], bad: [], color: '#7E9C5C' },

  // ── Blumen & Begleiter ───────────────────────────────────────────────────
  { key: 'kapuzinerkresse', name: 'Kapuzinerkresse', botanicalName: 'Tropaeolum majus', group: 'flower', family: 'Kapuzinerkressengewächse', feeder: 'light', spacingCm: 30, rowSpacingCm: 40, light: 'partial', frostHardy: false, sowIndoor: null, directSow: w(1, 4), plantOut: null, harvest: m(7, 10), good: ['tomate', 'kartoffel', 'zucchini', 'kuerbis', 'radieschen', ...KOHL], bad: [], color: '#F07A2A' },
  { key: 'borretsch', name: 'Borretsch', botanicalName: 'Borago officinalis', group: 'flower', family: 'Raublattgewächse', feeder: 'light', spacingCm: 40, rowSpacingCm: 40, light: 'partial', frostHardy: false, sowIndoor: null, directSow: w(-2, 6), plantOut: null, harvest: m(6, 9), good: ['gurke', 'zucchini', 'erdbeere', ...KOHL], bad: [], color: '#5A7BD8' },

  // ── Obst ─────────────────────────────────────────────────────────────────
  { key: 'erdbeere', name: 'Erdbeere', botanicalName: 'Fragaria × ananassa', group: 'fruit', family: 'Rosengewächse', feeder: 'medium', spacingCm: 30, rowSpacingCm: 40, light: 'full', frostHardy: true, sowIndoor: null, directSow: null, plantOut: w(7, 14), harvest: m(5, 7), good: ['knoblauch', 'zwiebel', 'lauch', 'salat', 'spinat', 'borretsch', 'radieschen', 'schnittlauch', 'thymian', 'ringelblume', 'tagetes', 'buschbohne', 'feldsalat'], bad: [...KOHL], color: '#E03E52' },
  { key: 'rhabarber', name: 'Rhabarber', botanicalName: 'Rheum rhabarbarum', group: 'fruit', family: 'Knöterichgewächse', feeder: 'heavy', spacingCm: 100, rowSpacingCm: 100, light: 'partial', frostHardy: true, sowIndoor: null, directSow: null, plantOut: w(-6, -2), harvest: m(4, 6), good: [], bad: [], color: '#B8475C' },
];

const BY_KEY = new Map(GARDEN_CATALOG.map((c) => [c.key, c]));

export function cropByKey(key: string): Crop | undefined {
  return BY_KEY.get(key);
}
