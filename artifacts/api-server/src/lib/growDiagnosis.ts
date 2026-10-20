/**
 * Grow: KI-Check of a plant photo (docs/grow.md).
 *
 * - health: deficiency or excess, pests, mould and disease, stress from the
 *   environment – with what to check and do. The latest Tagebuch values are
 *   compared with the plan's targets without AI and added as facts.
 * - trichomes: the share of clear, milky and amber trichomes; the stage
 *   (early, harvest window, late) is computed here from the shares, not taken
 *   from the model.
 *
 * Every model answer is untrusted and coerced into fixed shapes. The photo goes
 * to the model and is not stored; only the result is kept (grow_checks).
 */

import { db, growChecksTable, growLogsTable } from '@workspace/db';
import { desc, eq } from 'drizzle-orm';

import { checkImage } from './farmAi';
import { FarmDataError } from './farmAnimals';
import { addDays } from './feedSeason';
import { ownPlant } from './grow';
import { currentPhase, phases, targets, type GrowEnvironment, type GrowMedium, type PhaseKey, type PlantForPlan, type StrainType, type Flowering, type SeedSex } from './growPlan';
import { berlinDay } from './monitoring';
import { MODELS, parseDataUrl, runModelChain } from './plantIdentification';

export type GrowCheckKind = 'health' | 'trichomes';

export const FINDING_CATEGORIES = ['deficiency', 'excess', 'pest', 'disease', 'environment', 'other'] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export interface HealthFinding {
  name: string;
  category: FindingCategory;
  likely: boolean;
  signs: string | null;
  actions: string[];
}

export interface HealthResult {
  status: 'healthy' | 'watch' | 'problem';
  summary: string;
  findings: HealthFinding[];
  /** From the Tagebuch, without AI: pH or EC outside the plan's target. */
  facts: string[];
}

export type TrichomeStage = 'early' | 'window' | 'late';

export interface TrichomeResult {
  clear: number;
  milky: number;
  amber: number;
  stage: TrichomeStage;
  summary: string;
  advice: string;
}

export interface GrowCheck {
  id: number;
  kind: GrowCheckKind;
  date: string;
  health: HealthResult | null;
  trichomes: TrichomeResult | null;
}

const LARGE_CONFIG = { maxOutputTokens: 2048, responseMimeType: 'application/json' } as const;

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function strList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v, maxLen)).filter((v): v is string => !!v).slice(0, maxItems);
}

function share(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

// ── Health ───────────────────────────────────────────────────────────────────

/** Coerces the model answer; a "problem" needs a likely finding, else it is "watch". */
export function coerceHealth(parsed: Record<string, unknown>, facts: string[]): HealthResult {
  const raw = Array.isArray(parsed['befunde']) ? (parsed['befunde'] as Record<string, unknown>[]) : [];
  const findings: HealthFinding[] = raw.slice(0, 4).flatMap((f) => {
    const name = str(f?.['name'], 80);
    if (!name) return [];
    const cat = f['kategorie'];
    return [
      {
        name,
        category: (FINDING_CATEGORIES as readonly unknown[]).includes(cat) ? (cat as FindingCategory) : 'other',
        likely: f['wahrscheinlich'] === true,
        signs: str(f['anzeichen'], 300),
        actions: strList(f['massnahmen'], 4, 200),
      },
    ];
  });
  let status: HealthResult['status'] = parsed['status'] === 'healthy' || parsed['status'] === 'problem' ? parsed['status'] : 'watch';
  if (status === 'problem' && !findings.some((f) => f.likely)) status = 'watch';
  if (status === 'healthy' && (findings.some((f) => f.likely) || facts.length > 0)) status = 'watch';
  return {
    status,
    summary: str(parsed['zusammenfassung'], 500) ?? (status === 'healthy' ? 'Die Pflanze sieht gesund aus.' : 'Bitte genauer hinsehen.'),
    findings,
    facts,
  };
}

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** pH and EC of the latest Tagebuch entry (last 7 days) against the plan's targets. */
export function tagebuchFacts(
  log: { date: string; ph: number | null; ec: number | null } | null,
  target: { ph: [number, number] | null; ec: [number, number] | null },
  today: string,
): string[] {
  if (!log || log.date < addDays(today, -7)) return [];
  const out: string[] = [];
  if (log.ph != null && target.ph && (log.ph < target.ph[0] || log.ph > target.ph[1])) {
    out.push(`pH ${fmt(log.ph)} (Tagebuch ${log.date.slice(8)}.${log.date.slice(5, 7)}.) liegt außerhalb des Ziels ${fmt(target.ph[0])}–${fmt(target.ph[1])} – das blockiert die Nährstoffaufnahme und sieht oft wie ein Mangel aus.`);
  }
  if (log.ec != null && target.ec && (log.ec < target.ec[0] || log.ec > target.ec[1])) {
    out.push(`EC ${fmt(log.ec)} liegt ${log.ec > target.ec[1] ? 'über' : 'unter'} dem Ziel ${fmt(target.ec[0])}–${fmt(target.ec[1])}${log.ec > target.ec[1] ? ' – Gefahr von Überdüngung (verbrannte Spitzen)' : ''}.`);
  }
  return out;
}

// ── Trichomes ────────────────────────────────────────────────────────────────

/** The stage from the shares: amber ≥ 30 % late, mostly milky with few clear the window, else early. */
export function trichomeStage(clear: number, milky: number, amber: number): TrichomeStage {
  if (amber >= 30) return 'late';
  if (milky + amber >= 70 && clear <= 20) return 'window';
  return 'early';
}

const ADVICE: Record<TrichomeStage, string> = {
  early: 'Noch zu früh: viele Trichome sind klar. In 3–4 Tagen erneut prüfen – an Blüten, nicht an Blättern.',
  window: 'Erntefenster: die meisten Trichome sind milchig. Jetzt ernten, wenn du es eher aktivierend magst; mit mehr bernsteinfarbenen (10–20 %) wird die Wirkung körperlicher.',
  late: 'Spät: viele Trichome sind bernsteinfarben. Bald ernten, sonst baut THC weiter ab.',
};

export function coerceTrichomes(parsed: Record<string, unknown>): TrichomeResult | null {
  if (parsed['sichtbar'] === false) return null;
  let clear = share(parsed['klar']);
  let milky = share(parsed['milchig']);
  let amber = share(parsed['bernstein']);
  const sum = clear + milky + amber;
  if (sum <= 0) return null;
  // Shares as whole percent adding up to 100; the rounding rest goes to milky.
  clear = Math.round((clear / sum) * 100);
  amber = Math.round((amber / sum) * 100);
  milky = 100 - clear - amber;
  const stage = trichomeStage(clear, milky, amber);
  return { clear, milky, amber, stage, summary: str(parsed['zusammenfassung'], 400) ?? '', advice: ADVICE[stage] };
}

// ── The check ────────────────────────────────────────────────────────────────

const STRAIN_DE: Record<StrainType, string> = { indica: 'Indica', sativa: 'Sativa', hybrid: 'Hybrid', ruderalis: 'Ruderalis' };
const PHASE_DE: Record<PhaseKey, string> = {
  germination: 'Keimung',
  seedling: 'Sämling',
  veg: 'Wachstum',
  flower: 'Blüte',
  flush: 'Spülen vor der Ernte',
  drying: 'Trocknen',
  curing: 'Curing',
  done: 'abgeschlossen',
};
const ENV_DE: Record<GrowEnvironment, string> = { indoor: 'Indoor (Zelt)', outdoor: 'Outdoor', greenhouse: 'Gewächshaus' };
const MEDIUM_DE: Record<GrowMedium, string> = { soil: 'Erde', coco: 'Kokos', hydro: 'Hydro' };

function healthPrompt(context: string): string {
  return `Du bist erfahrener Pflanzenberater für den legalen Eigenanbau von Cannabis (Deutschland, KCanG). Das Foto zeigt eine Pflanze aus dem Grow-Tagebuch.
${context}

Bestimme sichtbare Probleme: Nährstoffmangel oder -überschuss, Schädlinge (z. B. Spinnmilben, Thripse, Trauermücken, Blattläuse), Schimmel und Krankheiten (z. B. Echter Mehltau, Botrytis/Knospenfäule), Stress durch Licht, Hitze, Gießen oder pH.
Antworte nur mit einem JSON-Objekt auf Deutsch:
{
  "istPflanze": boolean (ist eine Cannabispflanze bzw. ein Teil davon gut erkennbar?),
  "status": "healthy" | "watch" | "problem",
  "zusammenfassung": "1–3 Sätze",
  "befunde": [ { "name": "z. B. Stickstoffmangel", "kategorie": "deficiency" | "excess" | "pest" | "disease" | "environment" | "other", "wahrscheinlich": boolean (true nur bei klaren Anzeichen), "anzeichen": "was auf dem Foto darauf hindeutet", "massnahmen": [ "konkreter Schritt" ] } ]
}
Höchstens 4 Befunde, die wahrscheinlichsten zuerst. Normale Alterung (gelbe untere Blätter in der späten Blüte, beim Spülen) ist kein Problem. Bei Schimmel an Blüten: befallene Stellen großzügig entfernen und nicht konsumieren.`;
}

function trichomePrompt(context: string): string {
  return `Du schätzt die Reife von Cannabisblüten anhand der Trichome (Harzdrüsen) auf einem Nah- oder Makrofoto.
${context}

Zähle nur die Köpfchen der Trichome auf den Blüten (nicht auf Zuckerblättern). Antworte nur mit einem JSON-Objekt:
{
  "sichtbar": boolean (sind Trichom-Köpfchen scharf genug zu erkennen?),
  "klar": Zahl 0–100 (Anteil klarer, durchsichtiger Köpfchen in Prozent),
  "milchig": Zahl 0–100 (Anteil milchig-trüber),
  "bernstein": Zahl 0–100 (Anteil bernsteinfarbener),
  "zusammenfassung": "1–2 Sätze auf Deutsch, was zu sehen ist"
}`;
}

/** Runs a check on a photo of one of the account's plants and keeps the result. */
export async function checkPlant(userId: string, plantId: number, kind: GrowCheckKind, imageData: string, today = berlinDay()): Promise<GrowCheck> {
  if (kind !== 'health' && kind !== 'trichomes') throw new FarmDataError(400, 'Unbekannter Check.');
  checkImage(imageData);
  const { plant, grow } = await ownPlant(userId, plantId);
  const g = { environment: grow.environment as GrowEnvironment, medium: grow.medium as GrowMedium };
  const p: PlantForPlan = {
    strainType: plant.strainType as StrainType,
    flowering: plant.flowering as Flowering,
    seedSex: plant.seedSex as SeedSex,
    flowerWeeks: plant.flowerWeeks,
    startedOn: plant.startedOn,
    flipOn: plant.flipOn,
    harvestedOn: plant.harvestedOn,
  };
  const plan = phases(p, g);
  const phase = currentPhase(plan.phases, today);
  if (kind === 'trichomes' && phase !== 'flower' && phase !== 'flush') {
    throw new FarmDataError(409, 'Trichome prüft man in der Blüte, etwa in den letzten drei Wochen vor der Ernte.');
  }
  const [log] = await db
    .select({ date: growLogsTable.date, ph: growLogsTable.ph, ec: growLogsTable.ec, note: growLogsTable.note })
    .from(growLogsTable)
    .where(eq(growLogsTable.plantId, plantId))
    .orderBy(desc(growLogsTable.date), desc(growLogsTable.id))
    .limit(1);
  const t = targets(phase, p, g);
  const context = [
    `Pflanze: ${STRAIN_DE[p.strainType]}, ${p.flowering === 'auto' ? 'Autoflower' : 'photoperiodisch'}${plant.strain ? `, Sorte ${plant.strain}` : ''}.`,
    `Umgebung: ${ENV_DE[g.environment]}, Substrat ${MEDIUM_DE[g.medium]}.`,
    `Phase: ${PHASE_DE[phase]} (Tag ${Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${p.startedOn}T12:00:00Z`)) / 86_400_000))} seit dem Keimen, Ernte geplant um ${plan.harvestOn}).`,
    log ? `Letzter Tagebuch-Eintrag ${log.date}: ${[log.ph != null && `pH ${log.ph}`, log.ec != null && `EC ${log.ec}`, log.note && `Notiz „${log.note.slice(0, 200)}“`].filter(Boolean).join(', ') || '–'}.` : 'Noch keine Tagebuch-Einträge.',
  ].join('\n');

  const parsed = ((await runModelChain(
    [{ role: 'user', parts: [{ text: kind === 'health' ? healthPrompt(context) : trichomePrompt(context) }, { inlineData: parseDataUrl(imageData) }] }],
    MODELS,
    LARGE_CONFIG,
  )) ?? {}) as Record<string, unknown>;

  let health: HealthResult | null = null;
  let trichomes: TrichomeResult | null = null;
  if (kind === 'health') {
    if (parsed['istPflanze'] === false) throw new FarmDataError(422, 'Auf dem Foto ist keine Pflanze gut zu erkennen. Fotografiere Blätter oder Blüten bei Tageslicht.');
    health = coerceHealth(parsed, tagebuchFacts(log ?? null, t, today));
  } else {
    trichomes = coerceTrichomes(parsed);
    if (!trichomes) throw new FarmDataError(422, 'Die Trichome sind nicht scharf genug zu sehen. Nimm eine Lupe oder den Makro-Modus und geh nah an eine Blüte.');
  }
  const [row] = await db
    .insert(growChecksTable)
    .values({ plantId, kind, date: today, result: health ?? trichomes! })
    .returning({ id: growChecksTable.id });
  return { id: row!.id, kind, date: today, health, trichomes };
}
