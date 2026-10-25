/**
 * Bienen – Standort (docs/bienen.md): a photo of where a colony stands, kept
 * on the colony; and, independent of it, the Standort-Check – a photo of a
 * Bienenstand looked at by the AI for the flight entrance and sun, wind and
 * weather, the plants around, damp ground or wetland and the neighbours, with
 * tips to improve it. The AI only advises; its answer is coerced into a fixed
 * shape and kept so the beekeeper can come back to it.
 */

import { beeColoniesTable, beeSiteChecksTable, db, type BeeSiteAnalysis } from '@workspace/db';
import { and, desc, eq } from 'drizzle-orm';

import { FarmDataError, MAX_PHOTO_LENGTH, PHOTO_RE, notFound, text } from './farmAnimals';
import { deleteImageByUrl, uploadImage } from './imageStorage';

function validPhoto(imageData: unknown): string {
  if (typeof imageData !== 'string' || imageData.length > MAX_PHOTO_LENGTH || !PHOTO_RE.test(imageData)) {
    throw new FarmDataError(400, 'Das ist kein gültiges Foto.');
  }
  return imageData;
}

async function store(imageData: string): Promise<string> {
  try {
    return await uploadImage(imageData);
  } catch {
    throw new FarmDataError(502, 'Das Foto konnte gerade nicht gespeichert werden. Bitte versuche es später erneut.');
  }
}

// ── Photo of a colony's stand ────────────────────────────────────────────────

async function colonyPhoto(farmId: number, colonyId: number): Promise<string | null> {
  const [colony] = await db
    .select({ photoUrl: beeColoniesTable.photoUrl })
    .from(beeColoniesTable)
    .where(and(eq(beeColoniesTable.id, colonyId), eq(beeColoniesTable.farmId, farmId)));
  if (!colony) throw notFound();
  return colony.photoUrl;
}

/** A new photo of where the colony stands; the old one goes. */
export async function setColonyPhoto(farmId: number, colonyId: number, imageData: unknown): Promise<void> {
  const photo = validPhoto(imageData);
  const old = await colonyPhoto(farmId, colonyId);
  const url = await store(photo);
  await db.update(beeColoniesTable).set({ photoUrl: url }).where(and(eq(beeColoniesTable.id, colonyId), eq(beeColoniesTable.farmId, farmId)));
  if (old && old !== url) void deleteImageByUrl(old).catch(() => false);
}

export async function removeColonyPhoto(farmId: number, colonyId: number): Promise<void> {
  const old = await colonyPhoto(farmId, colonyId);
  await db.update(beeColoniesTable).set({ photoUrl: null }).where(and(eq(beeColoniesTable.id, colonyId), eq(beeColoniesTable.farmId, farmId)));
  if (old) void deleteImageByUrl(old).catch(() => false);
}

// ── Standort-Check ───────────────────────────────────────────────────────────

const COMPASS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];

/** 0–360° → "Südosten". */
export function compass(heading: number): string {
  return COMPASS[Math.round((((heading % 360) + 360) % 360) / 45) % 8]!;
}

function line(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
}

/** The AI's JSON → the fixed shape, or null when a part is missing. */
export function coerceSiteAnalysis(parsed: Record<string, unknown>): BeeSiteAnalysis | null {
  const parts = {
    overall: line(parsed['gesamt'], 300),
    orientation: line(parsed['ausrichtung'], 600),
    shelter: line(parsed['schutz'], 600),
    forage: line(parsed['bepflanzung'], 600),
    moisture: line(parsed['feuchtigkeit'], 600),
    neighbours: line(parsed['nachbarn'], 600),
  };
  if (Object.values(parts).some((v) => v === null)) return null;
  const tips = Array.isArray(parsed['tipps']) ? parsed['tipps'].map((t) => line(t, 200)).filter((t): t is string => !!t).slice(0, 5) : [];
  return { ...(parts as Omit<BeeSiteAnalysis, 'tips'>), tips };
}

export function sitePrompt(input: { heading: number | null; apiary: string | null; question: string | null }): string {
  const facts = [
    input.apiary && `Name des Bienenstands: ${input.apiary}.`,
    input.heading !== null && `Die Kamera schaut laut Kompass des Handys nach ${compass(input.heading)} (${input.heading}°).`,
    input.question && `Frage des Imkers: ${input.question}`,
  ].filter(Boolean);
  return `Du bist erfahrene Imkerin und berätst bei der Wahl und Verbesserung von Bienenständen in Mitteleuropa.
Schau dir das Foto eines Bienenstands an (Beuten und Umgebung).${facts.length ? `\n${facts.join('\n')}` : ''}
Beurteile nur, was auf dem Foto zu sehen ist oder sich daraus sicher ableiten lässt; sag offen, was du nicht erkennen kannst. Auf Deutsch, je 1–3 Sätze, ohne Markdown. Antworte nur mit einem JSON-Objekt:
{
  "gesamt": "Ein Satz: Wie gut ist der Stand insgesamt, und was ist das Wichtigste?",
  "ausrichtung": "Ausrichtung: Wohin zeigen die Fluglöcher? Bekommen sie Morgensonne und mittags etwas Schatten (günstig: Südost bis Süd)?",
  "schutz": "Wind und Wetter: Gibt es Windschutz (Hecke, Mauer, Gebäude) gegen West- und Nordwind? Ist der Stand frei und zugig?",
  "bepflanzung": "Bepflanzung und Tracht: Welche Pflanzen, Bäume, Hecken sind zu sehen? Gibt es Tracht über das Jahr und Wasser in der Nähe? Was ließe sich pflanzen?",
  "feuchtigkeit": "Feuchtigkeit: Steht der Stand in einer Senke, auf nassem Boden oder in einem Feuchtgebiet? Wie hoch stehen die Beuten über dem Boden? Was hilft gegen Nässe (Unterbau, Drainage, anderer Platz)?",
  "nachbarn": "Wege und Nachbarn: Kreuzt die Flugbahn Wege, Sitzplätze oder Grundstücksgrenzen? Hilft eine Hecke oder ein Zaun, die Bienen nach oben zu lenken?",
  "tipps": ["bis zu 5 kurze, konkrete Schritte, den Standort zu verbessern – das Wichtigste zuerst"]
}
Wenn auf dem Foto kein Bienenstand und kein möglicher Platz dafür zu erkennen ist, sag das in allen Feldern.`;
}

export interface SiteCheckInput {
  imageData: unknown;
  heading?: number | null;
  apiary?: unknown;
  question?: unknown;
}

export async function listSiteChecks(farmId: number) {
  return db
    .select({
      id: beeSiteChecksTable.id,
      apiary: beeSiteChecksTable.apiary,
      photoUrl: beeSiteChecksTable.photoUrl,
      heading: beeSiteChecksTable.heading,
      question: beeSiteChecksTable.question,
      analysis: beeSiteChecksTable.analysis,
      createdAt: beeSiteChecksTable.createdAt,
    })
    .from(beeSiteChecksTable)
    .where(eq(beeSiteChecksTable.farmId, farmId))
    .orderBy(desc(beeSiteChecksTable.createdAt), desc(beeSiteChecksTable.id))
    .then((rows) => rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}

/** Checks the input before the AI is asked (and counted). */
export function siteCheckValues(input: SiteCheckInput) {
  const photo = validPhoto(input.imageData);
  const raw = input.heading ?? null;
  if (raw !== null && !Number.isFinite(raw)) throw new FarmDataError(400, 'Die Himmelsrichtung ist ungültig.');
  return {
    photo,
    heading: raw === null ? null : Math.round(((raw % 360) + 360) % 360),
    apiary: text(input.apiary, 60, 'Der Bienenstand'),
    question: text(input.question, 300, 'Die Frage'),
  };
}

/** Asks the AI about the photo, then keeps the photo and the answer. */
export async function runSiteCheck(farmId: number, values: ReturnType<typeof siteCheckValues>) {
  const { MODELS, parseDataUrl, runModelChain } = await import('./plantIdentification');
  const parsed = (await runModelChain(
    [{ role: 'user', parts: [{ text: sitePrompt(values) }, { inlineData: parseDataUrl(values.photo) }] }],
    MODELS,
    { maxOutputTokens: 1536, responseMimeType: 'application/json' },
  )) as Record<string, unknown> | null;
  const analysis = coerceSiteAnalysis(parsed ?? {});
  if (!analysis) throw new Error('Incomplete site analysis from AI');
  // The answer counts even when the photo cannot be kept.
  const photoUrl = await uploadImage(values.photo).catch(() => null);
  await db.insert(beeSiteChecksTable).values({ farmId, apiary: values.apiary, photoUrl, heading: values.heading, question: values.question, analysis });
  return listSiteChecks(farmId);
}

export async function deleteSiteCheck(farmId: number, checkId: number) {
  const [gone] = await db
    .delete(beeSiteChecksTable)
    .where(and(eq(beeSiteChecksTable.id, checkId), eq(beeSiteChecksTable.farmId, farmId)))
    .returning({ photoUrl: beeSiteChecksTable.photoUrl });
  if (!gone) throw notFound();
  if (gone.photoUrl) void deleteImageByUrl(gone.photoUrl).catch(() => false);
  return listSiteChecks(farmId);
}
