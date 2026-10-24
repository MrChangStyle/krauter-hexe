/**
 * Pflichten ("Meine Farm"): what keeping a species means on paper in Germany –
 * registering with the veterinary office, the Tierseuchenkasse, the yearly
 * stock report as of 1 January, ear tags, the Newcastle vaccination, the
 * Geflügelpest housing order. Fixed rules, no AI; the details differ between
 * the Länder, so every text points to the office that knows (docs/pflichten.md).
 *
 * A farm ticks off one-off duties ("once") and the yearly reports per year;
 * the app counts the animals on 1 January from its own data and reminds the
 * admins in January until the report is ticked off.
 */

import { db, farmAnimalsTable, farmDutyChecksTable, farmMembershipsTable, farmPushLogTable, farmsTable, herdsTable, type FarmSpecies } from '@workspace/db';
import { and, eq, isNull, lt } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
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
}

/** Species the veterinary office registers (ViehVerkV § 26) and the Tierseuchenkassen insure. */
const LIVESTOCK: FarmSpecies[] = ['poultry', 'goat', 'sheep', 'pig', 'cattle', 'horse'];
/** Farm animals in the sense of the ban on catering waste. */
const FOOD_ANIMALS: FarmSpecies[] = ['poultry', 'goat', 'sheep', 'pig', 'cattle', 'horse', 'rabbit'];

export const DUTIES: DutyDef[] = [
  {
    key: 'registration',
    kind: 'once',
    species: LIVESTOCK,
    title: 'Beim Veterinäramt anmelden',
    text: 'Wer Geflügel, Ziegen, Schafe, Schweine, Rinder oder Pferde hält – auch nur ein Tier und auch als Hobby –, zeigt das vor Beginn dem Veterinäramt des Kreises an. Ihr bekommt eine Registriernummer für den Betrieb; tragt sie oben unter „Betrieb“ ein.',
    source: 'Viehverkehrsverordnung § 26',
  },
  {
    key: 'tsk_member',
    kind: 'once',
    species: LIVESTOCK,
    title: 'Bei der Tierseuchenkasse anmelden',
    text: 'Die Tierseuchenkasse eures Bundeslandes zahlt im Seuchenfall eine Entschädigung – aber nur für gemeldete Tiere, für die der Beitrag bezahlt ist. Anmelden, sobald die ersten Tiere da sind.',
    source: 'Tiergesundheitsgesetz, Landesrecht',
  },
  {
    key: 'tsk_report',
    kind: 'yearly',
    species: LIVESTOCK,
    title: 'Bestand an die Tierseuchenkasse melden',
    text: 'Jedes Jahr die Zahl der Tiere zum Stichtag 1. Januar melden; daraus berechnet sich der Beitrag. Die Frist steht im Meldebogen, meist Mitte Januar. Unten steht, was die App am Stichtag gezählt hat.',
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
    species: ['poultry', 'goat', 'sheep', 'pig', 'cattle'],
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
    species: ['horse'],
    title: 'Equidenpass und Chip',
    text: 'Jedes Pferd, Pony und jeder Esel braucht einen Equidenpass und einen Transponder (Chip) – Fohlen bis spätestens zwölf Monate nach der Geburt. Der Pass begleitet das Tier immer, auch beim Transport.',
    source: 'Durchführungsverordnung (EU) 2021/963',
  },
  {
    key: 'nd_vaccination',
    kind: 'rule',
    species: ['poultry'],
    title: 'Hühner und Puten gegen Newcastle impfen',
    text: 'Hühner und Puten müssen regelmäßig gegen die Newcastle-Krankheit geimpft sein – auch im kleinsten Hobbybestand. Lasst euch die Impfung vom Tierarzt bescheinigen und tragt sie in die Gesundheitsakte ein.',
    source: 'Geflügelpest-Verordnung § 7',
  },
  {
    key: 'avian_flu',
    kind: 'rule',
    species: ['poultry'],
    title: 'Geflügelpest: Stallpflicht beachten',
    text: 'Ordnet der Kreis eine Aufstallung an, müssen Hühner, Enten und Gänse in den Stall oder unter ein Dach mit Seitenschutz gegen Wildvögel. Futter und Wasser auch sonst so stellen, dass Wildvögel nicht herankommen. Tragt eine Anordnung unten ein, dann sehen sie alle auf dem Hof.',
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
];

/** Stock reports are due by this day of January (day of month). */
export const REPORT_DUE_DAY = 15;
/** The yearly reports are pushed on these days of January while not ticked off. */
export const REPORT_PUSH_DAYS = [2, 12];
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
  /** Yearly reports: the animals the app counted on the stock day (1 January). */
  stock: { day: string; counts: { species: FarmSpecies; count: number }[]; current: boolean } | null;
}

export interface FarmDuties {
  holdingNumber: string | null;
  housingOrderUntil: string | null;
  /** Species on the farm (animals and groups). */
  species: FarmSpecies[];
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

/**
 * The report a yearly duty is about today: this year's when the farm had
 * such animals on 1 January, else next year's.
 */
export function yearlyItem(
  def: DutyDef,
  animals: AnimalSpan[],
  checks: Map<string, string>,
  today: string,
): Pick<DutyItem, 'status' | 'period' | 'doneOn' | 'dueOn' | 'stock'> {
  const year = Number(today.slice(0, 4));
  const stockDay = `${year}-01-01`;
  const counts = countOn(animals, def.species, stockDay);
  if (counts.length > 0) {
    const period = String(year);
    const dueOn = `${period}-01-${String(REPORT_DUE_DAY).padStart(2, '0')}`;
    const doneOn = checks.get(`${def.key}:${period}`) ?? null;
    const status: DutyStatus = doneOn ? 'done' : today <= dueOn ? 'due' : 'overdue';
    return { status, period, doneOn, dueOn, stock: { day: stockDay, counts, current: false } };
  }
  const period = String(year + 1);
  return {
    status: 'upcoming',
    period,
    doneOn: checks.get(`${def.key}:${period}`) ?? null,
    dueOn: `${period}-01-${String(REPORT_DUE_DAY).padStart(2, '0')}`,
    stock: { day: `${period}-01-01`, counts: countOn(animals, def.species, today), current: true },
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

export function dutiesFor(species: FarmSpecies[], animals: AnimalSpan[], checks: Map<string, string>, today: string): DutyItem[] {
  return DUTIES.filter((d) => d.species.some((s) => species.includes(s))).map((def) => {
    const base = { key: def.key, kind: def.kind, title: def.title, text: def.text, source: def.source, species: def.species.filter((s) => species.includes(s)) };
    if (def.kind === 'yearly') return { ...base, ...yearlyItem(def, animals, checks, today) };
    if (def.kind === 'once') {
      const doneOn = checks.get(`${def.key}:once`) ?? null;
      return { ...base, status: doneOn ? 'done' : 'open', period: 'once', doneOn, dueOn: null, stock: null };
    }
    return { ...base, status: 'info', period: null, doneOn: null, dueOn: null, stock: null };
  });
}

export async function farmDuties(farmId: number, today = berlinDay()): Promise<FarmDuties> {
  const [farm] = await db
    .select({ holdingNumber: farmsTable.holdingNumber, housingOrderUntil: farmsTable.housingOrderUntil })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [animals, herds, checks] = await Promise.all([
    animalSpans(farmId),
    db.select({ species: herdsTable.species }).from(herdsTable).where(eq(herdsTable.farmId, farmId)),
    checksOf(farmId),
  ]);
  const present = new Set<FarmSpecies>([...animals.filter((a) => a.until === null).map((a) => a.species), ...herds.map((h) => h.species)]);
  const species = [...present];
  return {
    holdingNumber: farm.holdingNumber,
    // A housing order that has ended is no longer shown.
    housingOrderUntil: farm.housingOrderUntil && farm.housingOrderUntil >= today ? farm.housingOrderUntil : null,
    species,
    duties: dutiesFor(species, animals, checks, today),
  };
}

/** Tick a duty off (for its current period) or take the tick back. */
export async function checkDuty(farmId: number, key: string, done: boolean, today = berlinDay()): Promise<FarmDuties> {
  const current = (await farmDuties(farmId, today)).duties.find((d) => d.key === key);
  if (!current || current.period === null) throw new FarmDataError(404, 'Diese Pflicht gibt es auf eurem Hof nicht.');
  if (done && current.status === 'upcoming') {
    throw new FarmDataError(400, `Die Meldung zum 1. Januar ${current.period} lässt sich erst ab dem Stichtag abhaken.`);
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
}

export async function setDutySettings(farmId: number, input: DutySettingsInput, today = berlinDay()): Promise<FarmDuties> {
  const set: Partial<typeof farmsTable.$inferInsert> = {};
  if (input.holdingNumber !== undefined) set.holdingNumber = text(input.holdingNumber, 30, 'Die Registriernummer');
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
  poultry: 'Geflügel',
  rabbit: 'Kaninchen',
  guineaPig: 'Meerschweinchen',
  goat: 'Ziegen',
  sheep: 'Schafe',
  horse: 'Pferde',
  cattle: 'Rinder',
  pig: 'Schweine',
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
  const to = open.map((d) => (d.key === 'hit_report' ? 'HI-Tier' : 'Tierseuchenkasse')).join(' und ');
  const due = open[0]!.dueOn!;
  return {
    title: 'Bestandsmeldung fällig',
    body: `Stand 1. Januar laut App: ${stock}. Bitte bis ${Number(due.slice(8))}.01. an ${to} melden und in der App abhaken.`,
  };
}

/** January: remind the admins of every farm with an open stock report (once per farm and day). */
export async function sendDutyDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < PUSH_TIME || day.slice(5, 7) !== '01' || !REPORT_PUSH_DAYS.includes(Number(day.slice(8)))) return 0;
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
        const open = (await farmDuties(farmId, day)).duties.filter((d) => d.kind === 'yearly' && (d.status === 'due' || d.status === 'overdue'));
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
