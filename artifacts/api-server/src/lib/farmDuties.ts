/**
 * Pflichten ("Meine Farm"): what keeping a species means on paper in Germany –
 * registering with the veterinary office, the Tierseuchenkasse, the yearly
 * stock report as of 1 January, ear tags, the Newcastle vaccination, the
 * Geflügelpest housing order. Fixed rules, no AI; the details differ between
 * the Länder, so every text points to the office that knows (docs/pflichten.md).
 *
 * A farm ticks off one-off duties ("once") and the yearly reports per year;
 * the app counts the animals on the stock day from its own data and reminds
 * the admins in January until the report is ticked off. With the farm's
 * Bundesland the Tierseuchenkasse, its stock day and deadline come from
 * dutyStates.ts.
 */

import { beeColoniesTable, db, farmAnimalsTable, farmDutyChecksTable, farmMembershipsTable, farmPushLogTable, farmsTable, herdsTable, type FarmSpecies } from '@workspace/db';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';

import { DEFAULT_DUE_DAY, STATES, STATE_CODES, isStateCode, reportPushDays, type StateCode, type StateRules } from './dutyStates';
import { FarmDataError, notFound, text } from './farmAnimals';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { EQUIDS, POULTRY_SPECIES, WATERFOWL } from './species';
import { sendPushToUser } from './webPush';

export type DutyKind = 'once' | 'yearly' | 'rule' | 'tip';

export interface DutyDef {
  key: string;
  kind: DutyKind;
  species: FarmSpecies[];
  title: string;
  text: string;
  /** Where it comes from (law or office), shown small. */
  source: string;
  /** For beekeepers (Bienen module) instead of animal species. */
  bees?: true;
  /** About the Land's Tierseuchenkasse – named and linked once the Land is known. */
  tsk?: true;
}

/** Species the veterinary office registers (ViehVerkV § 26) and the Tierseuchenkassen insure. */
const LIVESTOCK: FarmSpecies[] = [...POULTRY_SPECIES, 'goat', 'sheep', 'pig', 'cattle', ...EQUIDS];
/** Species the veterinary office registers: the livestock plus the New World camelids (alpacas). */
const REGISTERED: FarmSpecies[] = [...LIVESTOCK, 'alpaca'];
/** Farm animals in the sense of the ban on catering waste. */
const FOOD_ANIMALS: FarmSpecies[] = [...POULTRY_SPECIES, 'goat', 'sheep', 'pig', 'cattle', ...EQUIDS, 'rabbit', 'alpaca'];

export const DUTIES: DutyDef[] = [
  {
    key: 'registration',
    kind: 'once',
    species: REGISTERED,
    title: 'Beim Veterinäramt anmelden',
    text: 'Wer Geflügel, Ziegen, Schafe, Schweine, Rinder, Pferde oder Alpakas hält – auch nur ein Tier und auch als Hobby –, zeigt das vor Beginn dem Veterinäramt des Kreises an. Ihr bekommt eine Registriernummer für den Betrieb; tragt sie oben unter „Betrieb“ ein.',
    source: 'Viehverkehrsverordnung § 26',
  },
  {
    key: 'tsk_member',
    kind: 'once',
    species: LIVESTOCK,
    tsk: true,
    title: 'Bei der Tierseuchenkasse anmelden',
    text: 'Die Tierseuchenkasse eures Bundeslandes zahlt im Seuchenfall eine Entschädigung – aber nur für gemeldete Tiere, für die der Beitrag bezahlt ist. Anmelden, sobald die ersten Tiere da sind.',
    source: 'Tiergesundheitsgesetz, Landesrecht',
  },
  {
    key: 'tsk_report',
    kind: 'yearly',
    species: LIVESTOCK,
    tsk: true,
    title: 'Bestand an die Tierseuchenkasse melden',
    text: 'Jedes Jahr die Zahl der Tiere zum Stichtag Anfang Januar melden; daraus berechnet sich der Beitrag. Die Frist steht im Meldebogen. Unten steht, was die App am Stichtag gezählt hat.',
    source: 'Tierseuchenkasse des Bundeslandes',
  },
  {
    key: 'hit_report',
    kind: 'yearly',
    species: ['pig', 'sheep', 'goat'],
    title: 'Stichtagsmeldung an die HI-Tier-Datenbank',
    text: 'Schweine-, Schaf- und Ziegenhalter melden die Zahl der Tiere am 1. Januar bis zum 15. Januar an die HI-Tier-Datenbank – online mit der Registriernummer oder über das Veterinäramt.',
    source: 'Viehverkehrsverordnung',
  },
  {
    key: 'stock_register',
    kind: 'rule',
    species: [...POULTRY_SPECIES, 'goat', 'sheep', 'pig', 'cattle', 'alpaca'],
    title: 'Bestandsregister führen',
    text: 'Zu- und Abgänge mit Datum, Herkunft oder Verbleib aufschreiben, bei Geflügel auch die Zahl der Tiere. Die Tierliste der App mit dem Veterinäramt-Export hilft dabei; fragt beim Amt, ob sie so genügt.',
    source: 'Viehverkehrsverordnung, Geflügelpest-Verordnung',
  },
  {
    key: 'eartags_small',
    kind: 'rule',
    species: ['sheep', 'goat'],
    title: 'Ohrmarken für Schafe und Ziegen',
    text: 'Lämmer und Kitze bekommen spätestens mit neun Monaten – und immer bevor sie den Betrieb verlassen – zwei Ohrmarken, eine davon elektronisch. Ohrmarken bestellt ihr mit der Registriernummer.',
    source: 'Viehverkehrsverordnung',
  },
  {
    key: 'eartags_cattle',
    kind: 'rule',
    species: ['cattle'],
    title: 'Rinder kennzeichnen und melden',
    text: 'Kälber bekommen innerhalb von sieben Tagen nach der Geburt zwei Ohrmarken. Geburt, Zugang, Abgang und Tod meldet ihr innerhalb von sieben Tagen an die HI-Tier-Datenbank.',
    source: 'Viehverkehrsverordnung',
  },
  {
    key: 'eartags_pig',
    kind: 'rule',
    species: ['pig'],
    title: 'Schweine kennzeichnen',
    text: 'Schweine bekommen eine Ohrmarke mit der Registriernummer, bevor sie den Betrieb verlassen. Zugänge meldet ihr innerhalb von sieben Tagen an die HI-Tier-Datenbank.',
    source: 'Viehverkehrsverordnung',
  },
  {
    key: 'equine_pass',
    kind: 'rule',
    species: [...EQUIDS],
    title: 'Equidenpass und Chip',
    text: 'Jedes Pferd, Pony und jeder Esel braucht einen Equidenpass und einen Transponder (Chip) – Fohlen bis spätestens zwölf Monate nach der Geburt. Der Pass begleitet das Tier immer, auch beim Transport.',
    source: 'Durchführungsverordnung (EU) 2021/963',
  },
  {
    key: 'nd_vaccination',
    kind: 'rule',
    species: ['poultry', 'turkey'],
    title: 'Hühner und Puten gegen Newcastle impfen',
    text: 'Hühner und Puten müssen regelmäßig gegen die Newcastle-Krankheit geimpft sein – auch im kleinsten Hobbybestand. Lasst euch die Impfung vom Tierarzt bescheinigen und tragt sie in die Gesundheitsakte ein.',
    source: 'Geflügelpest-Verordnung § 7',
  },
  {
    key: 'avian_flu',
    kind: 'rule',
    species: [...POULTRY_SPECIES],
    title: 'Geflügelpest: Stallpflicht beachten',
    text: 'Ordnet der Kreis eine Aufstallung an, muss alles Geflügel – Hühner, Enten, Gänse, Puten, Wachteln – in den Stall oder unter ein Dach mit Seitenschutz gegen Wildvögel. Futter und Wasser auch sonst so stellen, dass Wildvögel nicht herankommen. Tragt eine Anordnung unten ein, dann sehen sie alle auf dem Hof.',
    source: 'Geflügelpest-Verordnung, Anordnung des Kreises',
  },
  {
    key: 'pig_hygiene',
    kind: 'rule',
    species: ['pig'],
    title: 'Schutz vor der Afrikanischen Schweinepest',
    text: 'Auslauf doppelt einzäunen, damit kein Wildschwein an die Tiere kommt; Stallkleidung nur im Stall tragen, Fremde nur nach Absprache in den Stall. Nie Wildschweinfleisch oder Wurstreste verfüttern.',
    source: 'Schweinehaltungshygieneverordnung',
  },
  {
    key: 'catering_waste',
    kind: 'rule',
    species: FOOD_ANIMALS,
    title: 'Keine Küchen- und Speisereste verfüttern',
    text: 'Speisereste aus der Küche – auch Brot mit Wurst oder Reste vom Teller – sind für Nutztiere verboten, weil sie Seuchen wie die Schweinepest übertragen. Obst, Gemüse und Grünes direkt aus dem Garten sind erlaubt.',
    source: 'Verordnung (EG) 1069/2009',
  },
  // Alpakas (docs/alpaka.md).
  {
    key: 'alpaca_tsk',
    kind: 'once',
    species: ['alpaca'],
    tsk: true,
    title: 'Alpakas: bei der Tierseuchenkasse nachfragen',
    text: 'Ob Alpakas der Tierseuchenkasse gemeldet werden und einen Beitrag kosten, regelt jedes Bundesland selbst – in manchen ja, in anderen nicht. Fragt bei der Kasse eures Bundeslandes nach und tragt die Antwort hier ein.',
    source: 'Landesrecht',
  },
  {
    key: 'alpaca_herd',
    kind: 'rule',
    species: ['alpaca'],
    title: 'Alpakas nie allein halten',
    text: 'Alpakas sind Herdentiere: mindestens zwei, besser drei Tiere zusammen halten. Dazu ein Unterstand mit etwa 2 m² je Tier und rund 1000–1500 m² Weide für zwei Tiere (Richtwerte).',
    source: 'Tierschutzgesetz § 2, Merkblätter der Veterinärämter',
  },
  // Gänse, Enten, Puten, Wachteln (docs/gefluegel.md).
  {
    key: 'waterfowl_water',
    kind: 'rule',
    species: [...WATERFOWL],
    title: 'Enten und Gänse brauchen Badewasser',
    text: 'Wassergeflügel muss den Kopf ins Wasser tauchen und das Gefieder pflegen können: mindestens eine Wanne oder ein Becken, in dem sie baden können, dazu eine Tränke, die tief genug für den ganzen Schnabel ist. Das Wasser oft wechseln.',
    source: 'Tierschutzgesetz § 2, Empfehlungen zur Haltung von Wassergeflügel',
  },
  {
    key: 'turkey_blackhead',
    kind: 'tip',
    species: ['turkey'],
    title: 'Puten nicht mit Hühnern halten',
    text: 'Hühner tragen oft den Erreger der Schwarzkopfkrankheit, ohne selbst krank zu werden – für Puten ist sie meist tödlich, und es gibt kein zugelassenes Mittel. Puten deshalb getrennt und nicht auf Flächen halten, auf denen vorher Hühner waren.',
    source: 'Empfehlung der Geflügelgesundheitsdienste',
  },
  {
    key: 'quail_keeping',
    kind: 'tip',
    species: ['quail'],
    title: 'Wachteln: Voliere statt Käfig',
    text: 'Japanwachteln brauchen Platz zum Laufen, Scharren und Sandbaden und einen Rückzugsort; die Decke weich oder hoch genug, weil sie bei Schreck senkrecht hochspringen. Richtwert: ein Hahn auf vier bis fünf Hennen.',
    source: 'Merkblätter der Veterinärämter',
  },
  // Nandus und Esel (docs/nandu-esel.md).
  {
    key: 'rhea_permit',
    kind: 'once',
    species: ['rhea'],
    title: 'Nandus: Gehege und Genehmigung klären',
    text: 'Nandus brauchen ein großes, ausbruchsicheres Gehege mit Laufstrecke und einen Unterstand. Fragt vor dem Kauf beim Veterinäramt und bei der unteren Naturschutzbehörde, ob ihr eine Genehmigung braucht (Gehege, Artenschutz-Nachweis) – das regelt das Bundesland.',
    source: 'Landesrecht, Bundesnaturschutzgesetz',
  },
  {
    key: 'rhea_group',
    kind: 'tip',
    species: ['rhea'],
    title: 'Nandus in der Gruppe halten',
    text: 'Nandus leben in Gruppen; Richtwert ein Hahn auf drei bis fünf Hennen. In der Brutzeit brütet der Hahn und verteidigt das Nest – dann vorsichtig ins Gehege gehen.',
    source: 'Merkblätter der Veterinärämter',
  },
  {
    key: 'donkey_company',
    kind: 'rule',
    species: ['donkey'],
    title: 'Esel nie allein halten',
    text: 'Esel sind Herdentiere und brauchen einen Artgenossen – ein Pferd ersetzt ihn nur schlecht. Dazu ein trockener Unterstand: Eselfell ist nicht wasserdicht.',
    source: 'Tierschutzgesetz § 2, Leitlinien Tierschutz im Pferdesport/Equidenhaltung',
  },
  {
    key: 'rabbit_vaccination',
    kind: 'tip',
    species: ['rabbit'],
    title: 'Kaninchen impfen lassen',
    text: 'Keine Pflicht, aber dringend empfohlen: die Impfung gegen RHD (Chinaseuche, auch RHDV-2) und Myxomatose. Beide Krankheiten verlaufen meist tödlich und werden auch von Mücken übertragen.',
    source: 'Ständige Impfkommission Veterinärmedizin',
  },
  {
    key: 'dog_registration',
    kind: 'once',
    species: ['dog'],
    title: 'Hund bei der Gemeinde anmelden',
    text: 'Für Hunde fällt Hundesteuer an; meldet den Hund bei der Gemeinde an. Je nach Bundesland gelten außerdem Chip- und Haftpflichtpflicht.',
    source: 'Gemeinde, Landesrecht',
  },
  {
    key: 'cat_neutering',
    kind: 'tip',
    species: ['cat'],
    title: 'Freigänger kastrieren und kennzeichnen',
    text: 'Viele Städte und Gemeinden schreiben für Katzen mit Freigang Kastration, Chip und Registrierung vor. Fragt bei eurer Gemeinde nach.',
    source: 'Katzenschutzverordnung der Gemeinde',
  },
  // Bienen (docs/bienen.md): for farms with active colonies.
  {
    key: 'bee_registration',
    kind: 'once',
    species: [],
    bees: true,
    title: 'Bienenhaltung beim Veterinäramt anzeigen',
    text: 'Wer Bienenvölker hält – auch nur eines –, zeigt das spätestens bei Beginn der Haltung dem Veterinäramt an, mit Zahl der Völker und Standort. Ein neuer Stand oder deutlich mehr Völker werden ebenfalls angezeigt.',
    source: 'Bienenseuchen-Verordnung § 1a',
  },
  {
    key: 'bee_tsk',
    kind: 'once',
    species: [],
    bees: true,
    tsk: true,
    title: 'Bienenvölker bei der Tierseuchenkasse melden',
    text: 'In den meisten Bundesländern werden Bienenvölker der Tierseuchenkasse gemeldet; meist ist das mit einem kleinen Beitrag verbunden und sichert eine Entschädigung im Seuchenfall. Fragt bei der Kasse eures Bundeslandes nach.',
    source: 'Tiergesundheitsgesetz, Landesrecht',
  },
  {
    key: 'bee_varroa',
    kind: 'rule',
    species: [],
    bees: true,
    title: 'Varroa jedes Jahr behandeln',
    text: 'Bienenvölker müssen jedes Jahr gegen die Varroamilbe behandelt werden – nur mit zugelassenen Mitteln. Jede Behandlung gehört ins Bestandsbuch (Mittel, Charge, Menge, Datum); die Stockkarte in der App hält das fest.',
    source: 'Bienenseuchen-Verordnung § 15, Tierarzneimittelgesetz',
  },
  {
    key: 'bee_moving',
    kind: 'rule',
    species: [],
    bees: true,
    title: 'Völker umsetzen nur mit Gesundheitszeugnis',
    text: 'Wer Völker an einen anderen Ort bringt (Wanderung, Verkauf, Umzug in einen anderen Kreis), braucht eine amtliche Bescheinigung, dass sie frei von Amerikanischer Faulbrut sind – nicht älter als neun Monate.',
    source: 'Bienenseuchen-Verordnung § 5',
  },
];

/** HI-Tier: stock on 1 January, due by the 15th everywhere (ViehVerkV). */
export const REPORT_DUE_DAY = DEFAULT_DUE_DAY;
const PUSH_TIME = '07:30';

export type DutyStatus = 'open' | 'done' | 'due' | 'overdue' | 'upcoming' | 'info';

export interface DutyItem {
  key: string;
  kind: DutyKind;
  title: string;
  text: string;
  source: string;
  species: FarmSpecies[];
  status: DutyStatus;
  /** "once" or the year of the stock report this item is about. */
  period: string | null;
  doneOn: string | null;
  dueOn: string | null;
  /** Yearly reports: the animals the app counted on the stock day (1 or 3 January). */
  stock: { day: string; counts: { species: FarmSpecies; count: number }[]; current: boolean } | null;
  /** The Land's Tierseuchenkasse, when the farm has a Bundesland. */
  link: { label: string; url: string | null } | null;
  /** What differs in this Land. */
  note: string | null;
}

export interface StateOption {
  code: StateCode;
  name: string;
}

export const STATE_OPTIONS: StateOption[] = STATE_CODES.map((code) => ({ code, name: STATES[code].name })).sort((a, b) => a.name.localeCompare(b.name, 'de'));

export interface FarmDuties {
  holdingNumber: string | null;
  housingOrderUntil: string | null;
  /** The farm's Bundesland (code), and all to choose from. */
  state: StateCode | null;
  states: StateOption[];
  /** Species on the farm (animals and groups). */
  species: FarmSpecies[];
  /** Active bee colonies on the farm. */
  bees: boolean;
  duties: DutyItem[];
}

interface AnimalSpan {
  species: FarmSpecies;
  /** Berlin day the animal was entered. */
  from: string;
  /** Berlin day it was archived; null while on the farm. */
  until: string | null;
}

/** Animals of the given species on the farm on `day` (entered by then, not yet archived). */
export function countOn(animals: AnimalSpan[], species: FarmSpecies[], day: string): { species: FarmSpecies; count: number }[] {
  const counts = new Map<FarmSpecies, number>();
  for (const a of animals) {
    if (!species.includes(a.species) || a.from > day || (a.until !== null && a.until <= day)) continue;
    counts.set(a.species, (counts.get(a.species) ?? 0) + 1);
  }
  return species.filter((s) => counts.has(s)).map((s) => ({ species: s, count: counts.get(s)! }));
}

const jan = (year: string | number, day: number) => `${year}-01-${String(day).padStart(2, '0')}`;

/** Stock day and deadline of a yearly report: the Land's for the Tierseuchenkasse, else 1 and 15 January. */
export function reportDays(def: DutyDef, rules: StateRules | null): { stockDay: number; dueDay: number } {
  if (!def.tsk || !rules) return { stockDay: 1, dueDay: REPORT_DUE_DAY };
  return { stockDay: rules.stockDay, dueDay: rules.dueDay ?? DEFAULT_DUE_DAY };
}

/**
 * The report a yearly duty is about today: this year's when the farm had
 * such animals on the stock day, else next year's.
 */
export function yearlyItem(
  def: DutyDef,
  animals: AnimalSpan[],
  checks: Map<string, string>,
  today: string,
  rules: StateRules | null = null,
): Pick<DutyItem, 'status' | 'period' | 'doneOn' | 'dueOn' | 'stock'> {
  const year = Number(today.slice(0, 4));
  const days = reportDays(def, rules);
  // Before the stock day the animals on the farm now are what will count.
  const stockDay = jan(year, days.stockDay);
  const counts = countOn(animals, def.species, stockDay < today ? stockDay : today);
  if (counts.length > 0) {
    const period = String(year);
    const dueOn = jan(period, days.dueDay);
    const doneOn = checks.get(`${def.key}:${period}`) ?? null;
    const status: DutyStatus = doneOn ? 'done' : today <= dueOn ? 'due' : 'overdue';
    return { status, period, doneOn, dueOn, stock: { day: stockDay, counts, current: today < stockDay } };
  }
  const period = String(year + 1);
  return {
    status: 'upcoming',
    period,
    doneOn: checks.get(`${def.key}:${period}`) ?? null,
    dueOn: jan(period, days.dueDay),
    stock: { day: jan(period, days.stockDay), counts: countOn(animals, def.species, today), current: true },
  };
}

const BERLIN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

async function animalSpans(farmId: number): Promise<AnimalSpan[]> {
  const rows = await db
    .select({ species: farmAnimalsTable.species, createdAt: farmAnimalsTable.createdAt, archivedAt: farmAnimalsTable.archivedAt })
    .from(farmAnimalsTable)
    .where(eq(farmAnimalsTable.farmId, farmId));
  return rows.map((r) => ({ species: r.species, from: BERLIN_DAY.format(r.createdAt), until: r.archivedAt ? BERLIN_DAY.format(r.archivedAt) : null }));
}

async function checksOf(farmId: number): Promise<Map<string, string>> {
  const rows = await db
    .select({ key: farmDutyChecksTable.dutyKey, period: farmDutyChecksTable.period, doneOn: farmDutyChecksTable.doneOn })
    .from(farmDutyChecksTable)
    .where(eq(farmDutyChecksTable.farmId, farmId));
  return new Map(rows.map((r) => [`${r.key}:${r.period}`, r.doneOn]));
}

/** The Land's Kasse and what differs there; a report without a checked deadline says so. */
function stateExtras(def: DutyDef, rules: StateRules | null): Pick<DutyItem, 'link' | 'note' | 'source'> {
  if (!def.tsk || !rules) return { link: null, note: null, source: def.source };
  const notes = [rules.note, def.kind === 'yearly' && rules.dueDay === null ? `Die genaue Frist steht im Meldebogen der Kasse; die App rechnet mit dem ${DEFAULT_DUE_DAY}. Januar.` : null];
  return {
    link: { label: rules.tsk, url: rules.url },
    note: notes.filter(Boolean).join(' ') || null,
    source: def.source.replace('des Bundeslandes', rules.name).replace('Landesrecht', `Landesrecht ${rules.name}`),
  };
}

export function dutiesFor(species: FarmSpecies[], animals: AnimalSpan[], checks: Map<string, string>, today: string, bees = false, state: StateCode | null = null): DutyItem[] {
  const rules = state ? STATES[state] : null;
  return DUTIES.filter((d) => (d.bees ? bees : d.species.some((s) => species.includes(s)))).map((def): DutyItem => {
    const base = { key: def.key, kind: def.kind, title: def.title, text: def.text, species: def.species.filter((s) => species.includes(s)), ...stateExtras(def, rules) };
    if (def.kind === 'yearly') return { ...base, ...yearlyItem(def, animals, checks, today, rules) };
    if (def.kind === 'once') {
      const doneOn = checks.get(`${def.key}:once`) ?? null;
      return { ...base, status: doneOn ? 'done' : 'open', period: 'once', doneOn, dueOn: null, stock: null };
    }
    return { ...base, status: 'info', period: null, doneOn: null, dueOn: null, stock: null };
  });
}

export async function farmDuties(farmId: number, today = berlinDay()): Promise<FarmDuties> {
  const [farm] = await db
    .select({ holdingNumber: farmsTable.holdingNumber, housingOrderUntil: farmsTable.housingOrderUntil, state: farmsTable.state })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [animals, herds, checks, [colonies]] = await Promise.all([
    animalSpans(farmId),
    db.select({ species: herdsTable.species }).from(herdsTable).where(eq(herdsTable.farmId, farmId)),
    checksOf(farmId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(beeColoniesTable)
      .where(and(eq(beeColoniesTable.farmId, farmId), eq(beeColoniesTable.status, 'active'))),
  ]);
  const bees = (colonies?.n ?? 0) > 0;
  const present = new Set<FarmSpecies>([...animals.filter((a) => a.until === null).map((a) => a.species), ...herds.map((h) => h.species)]);
  const species = [...present];
  const state = isStateCode(farm.state) ? farm.state : null;
  return {
    holdingNumber: farm.holdingNumber,
    state,
    states: STATE_OPTIONS,
    // A housing order that has ended is no longer shown.
    housingOrderUntil: farm.housingOrderUntil && farm.housingOrderUntil >= today ? farm.housingOrderUntil : null,
    species,
    bees,
    duties: dutiesFor(species, animals, checks, today, bees, state),
  };
}

/** Tick a duty off (for its current period) or take the tick back. */
export async function checkDuty(farmId: number, key: string, done: boolean, today = berlinDay()): Promise<FarmDuties> {
  const current = (await farmDuties(farmId, today)).duties.find((d) => d.key === key);
  if (!current || current.period === null) throw new FarmDataError(404, 'Diese Pflicht gibt es auf eurem Hof nicht.');
  if (done && current.status === 'upcoming') {
    throw new FarmDataError(400, `Die Meldung zum ${Number(current.stock!.day.slice(8))}. Januar ${current.period} lässt sich erst ab dem Stichtag abhaken.`);
  }
  if (done) {
    await db
      .insert(farmDutyChecksTable)
      .values({ farmId, dutyKey: key, period: current.period, doneOn: today })
      .onConflictDoNothing();
  } else {
    await db
      .delete(farmDutyChecksTable)
      .where(and(eq(farmDutyChecksTable.farmId, farmId), eq(farmDutyChecksTable.dutyKey, key), eq(farmDutyChecksTable.period, current.period)));
  }
  return farmDuties(farmId, today);
}

export interface DutySettingsInput {
  holdingNumber?: unknown;
  housingOrderUntil?: unknown;
  /** Bundesland code; null removes it. */
  state?: unknown;
}

export async function setDutySettings(farmId: number, input: DutySettingsInput, today = berlinDay()): Promise<FarmDuties> {
  const set: Partial<typeof farmsTable.$inferInsert> = {};
  if (input.holdingNumber !== undefined) set.holdingNumber = text(input.holdingNumber, 30, 'Die Registriernummer');
  if (input.state !== undefined) {
    if (input.state !== null && !isStateCode(input.state)) throw new FarmDataError(400, 'Dieses Bundesland gibt es nicht.');
    set.state = input.state;
  }
  if (input.housingOrderUntil !== undefined) {
    if (input.housingOrderUntil === null || input.housingOrderUntil === '') set.housingOrderUntil = null;
    else {
      const until = input.housingOrderUntil;
      if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until) || addDays(until, 0) !== until || until < today || until > addDays(today, 365)) {
        throw new FarmDataError(400, 'Die Stallpflicht endet frühestens heute und höchstens in einem Jahr.');
      }
      set.housingOrderUntil = until;
    }
  }
  if (Object.keys(set).length > 0) await db.update(farmsTable).set(set).where(eq(farmsTable.id, farmId));
  return farmDuties(farmId, today);
}

// ── Push: the stock report in January ─────────────────────────────────────────

const SPECIES_PLURAL: Record<FarmSpecies, string> = {
  poultry: 'Hühner',
  rabbit: 'Kaninchen',
  guineaPig: 'Meerschweinchen',
  goat: 'Ziegen',
  sheep: 'Schafe',
  horse: 'Pferde',
  cattle: 'Rinder',
  pig: 'Schweine',
  alpaca: 'Alpakas',
  goose: 'Gänse',
  duck: 'Enten',
  turkey: 'Puten',
  quail: 'Wachteln',
  rhea: 'Nandus',
  donkey: 'Esel',
  cat: 'Katzen',
  dog: 'Hunde',
  other: 'Tiere',
};

/** The push text for the reports still open; null when none is. */
export function reportMessage(open: DutyItem[]): { title: string; body: string } | null {
  if (open.length === 0) return null;
  const counts = new Map<FarmSpecies, number>();
  for (const d of open) for (const c of d.stock?.counts ?? []) counts.set(c.species, Math.max(counts.get(c.species) ?? 0, c.count));
  const stock = [...counts].map(([s, n]) => `${SPECIES_PLURAL[s]} ${n}`).join(', ');
  const day = Number(open[0]!.stock!.day.slice(8));
  // One deadline for all: "bis 15.01. an Tierseuchenkasse und HI-Tier"; else each with its own.
  const name = (d: DutyItem) => (d.key === 'hit_report' ? 'HI-Tier' : (d.link?.label ?? 'Tierseuchenkasse'));
  const by = (d: DutyItem) => `${Number(d.dueOn!.slice(8))}.01.`;
  const to = open.every((d) => d.dueOn === open[0]!.dueOn) ? `bis ${by(open[0]!)} an ${open.map(name).join(' und ')}` : open.map((d) => `bis ${by(d)} an ${name(d)}`).join(' und ');
  return {
    title: 'Bestandsmeldung fällig',
    body: `Stand ${day}. Januar laut App: ${stock}. Bitte ${to} melden und in der App abhaken.`,
  };
}

/**
 * January: remind the admins of every farm with an open stock report, about
 * two weeks and three days before its deadline (once per farm and day).
 */
export async function sendDutyDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < PUSH_TIME || day.slice(5, 7) !== '01') return 0;
  const dayOfMonth = Number(day.slice(8));
  let sent = 0;
  try {
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'duties'), lt(farmPushLogTable.day, addDays(day, -60))));
    // Farms that had livestock on 1 January: the report is about this year then.
    const farms = await db
      .selectDistinct({ farmId: farmAnimalsTable.farmId })
      .from(farmAnimalsTable)
      .where(lt(farmAnimalsTable.createdAt, new Date(`${day.slice(0, 4)}-01-02T00:00:00+01:00`)));
    for (const { farmId } of farms) {
      try {
        // Each report on its own push days, counted back from its deadline.
        const open = (await farmDuties(farmId, day)).duties.filter(
          (d) => d.kind === 'yearly' && (d.status === 'due' || d.status === 'overdue') && reportPushDays(Number(d.dueOn!.slice(8))).includes(dayOfMonth),
        );
        const message = reportMessage(open);
        if (!message) continue;
        const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'duties', day }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const admins = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.role, 'admin'), isNull(farmMembershipsTable.accessUntil)));
        for (const { userId } of admins) {
          await sendPushToUser(userId, { topic: 'duties', ...message, tag: `duties-${farmId}-${day}`, url: '/farm/pflichten' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Duty push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Duty pushes failed');
  }
  return sent;
}
