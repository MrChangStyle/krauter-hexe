/**
 * Tipps und Rezepte (Futterplaner step 5, docs/futterplaner.md): built-in
 * recipes with their hygiene rules, and recipes sent in by users, shown to
 * everyone once the app owner approved them. Fixed rules flag ingredients the
 * owner should look at closely (kitchen scraps, foods poisonous to animals).
 * No AI.
 */

import { FARM_SPECIES, db, feedRecipesTable, type FarmSpecies, type RecipeIngredientJson } from '@workspace/db';
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import { FarmDataError, notFound } from './farmAnimals';

export const RECIPE_KINDS = ['fermented', 'sprouts', 'mix', 'treat'] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];
export type RecipeStatus = 'builtIn' | 'pending' | 'approved' | 'rejected';

export interface Recipe {
  id: string;
  title: string;
  species: FarmSpecies[];
  kind: RecipeKind;
  ingredients: RecipeIngredientJson[];
  steps: string[];
  hygiene: string[];
  status: RecipeStatus;
  /** Sent in by the viewer (they may withdraw it while it waits). */
  mine: boolean;
}

/** Owner view: who sent it, and what the fixed rules found. */
export interface RecipeDraft extends Recipe {
  flags: string[];
  createdAt: string;
}

const builtIn = (id: string, title: string, species: FarmSpecies[], kind: RecipeKind, ingredients: [string, string][], steps: string[], hygiene: string[]): Recipe => ({
  id: `b:${id}`,
  title,
  species,
  kind,
  ingredients: ingredients.map(([name, amount]) => ({ name, amount })),
  steps,
  hygiene,
  status: 'builtIn',
  mine: false,
});

/** Checked recipes that come with the app – to be confirmed by a specialist before the public start, like the Richtwerte. */
export const BUILT_IN_RECIPES: readonly Recipe[] = [
  builtIn(
    'fermentiertes-huehnerfutter',
    'Fermentiertes Hühnerfutter',
    ['poultry'],
    'fermented',
    [
      ['Körnermischung oder Legemehl', '1 Tagesportion (etwa 120 g je Huhn)'],
      ['Wasser (Leitungswasser abgestanden oder Regenwasser)', 'bis 2 cm über dem Futter'],
    ],
    [
      'Futter in ein sauberes Glas oder einen Eimer mit Deckel geben, mit Wasser bedecken.',
      'Locker abdecken (nicht luftdicht) und bei 18–25 °C stehen lassen.',
      'Einmal am Tag umrühren, Wasser nachgießen, damit alles bedeckt bleibt.',
      'Nach 2–3 Tagen riecht es säuerlich-frisch wie Sauerteig – dann ist es fertig.',
      'Abtropfen lassen und als Teil der Ration füttern; die Flüssigkeit kann den nächsten Ansatz starten.',
    ],
    [
      'Riecht es faulig, nach Alkohol oder Nagellack, zeigt sich Schimmel oder eine rosa Färbung: alles wegwerfen und das Gefäß heiß reinigen.',
      'Nur so viel ansetzen, wie an einem Tag gefressen wird; Reste nach 1–2 Stunden aus dem Napf nehmen.',
      'Höchstens die Hälfte der Ration fermentiert geben – das Alleinfutter liefert Calcium und Vitamine.',
      'Im Sommer kühler stellen oder kürzer fermentieren, im Winter nicht unter 15 °C.',
      'Keine Küchen- oder Speisereste hineingeben (VO (EG) 1069/2009).',
    ],
  ),
  builtIn(
    'keimfutter-gefluegel',
    'Keimfutter für Hühner',
    ['poultry'],
    'sprouts',
    [
      ['Weizen, Gerste oder Hafer (unbehandeltes Futtergetreide)', 'etwa 30 g je Huhn'],
      ['Wasser', 'zum Einweichen und Spülen'],
    ],
    [
      'Getreide 8–12 Stunden in kaltem Wasser einweichen.',
      'Abgießen, gründlich spülen und in einem Sieb oder Keimglas abtropfen lassen.',
      'Zweimal am Tag spülen und gut abtropfen lassen.',
      'Nach 2–4 Tagen, wenn die Keime 0,5–1 cm lang sind, verfüttern.',
    ],
    [
      'Nur unbehandeltes Futter- oder Speisegetreide – nie gebeiztes Saatgut (giftig).',
      'Riecht es muffig oder zeigt sich Schimmel (weißer Flaum an den Körnern, nicht die feinen Wurzelhaare): wegwerfen.',
      'Gefäße nach jedem Ansatz heiß spülen.',
      'Keimfutter ergänzt das Alleinfutter, es ersetzt es nicht.',
    ],
  ),
  builtIn(
    'keimfutter-kleintiere',
    'Keimhafer für Kaninchen und Meerschweinchen',
    ['rabbit', 'guineaPig'],
    'sprouts',
    [
      ['Hafer (unbehandelt)', '1 Teelöffel je Tier und Tag'],
      ['Wasser', 'zum Einweichen und Spülen'],
    ],
    [
      'Hafer 8 Stunden einweichen, dann spülen und abtropfen lassen.',
      'Zweimal am Tag spülen.',
      'Nach 2–3 Tagen mit kurzen Keimen verfüttern – als Leckerbissen, nicht als Hauptfutter.',
    ],
    [
      'Nie gebeiztes Saatgut verwenden.',
      'Bei muffigem Geruch oder Schimmel wegwerfen.',
      'Kleine Mengen: zu viel Getreide stört die Verdauung – Heu bleibt das Hauptfutter.',
    ],
  ),
  builtIn(
    'wiesenkraeuter',
    'Wiesenkräuter-Mischung',
    ['rabbit', 'guineaPig', 'goat', 'sheep'],
    'mix',
    [
      ['Löwenzahn', 'eine Handvoll'],
      ['Spitzwegerich', 'eine Handvoll'],
      ['Schafgarbe', 'einige Stängel'],
      ['Gras', 'nach Belieben'],
    ],
    [
      'Kräuter sammeln, kurz ausschütteln, nicht waschen und nicht in der Tüte schwitzen lassen.',
      'Frisch oder angewelkt verfüttern; neu eingeführte Kräuter langsam steigern.',
    ],
    [
      'Nur Pflanzen sammeln, die du sicher kennst – Verwechslung mit Jakobskreuzkraut, Hahnenfuß oder Herbstzeitlose ist gefährlich. Im Zweifel mit dem Pflanzenscanner prüfen.',
      'Nicht an Straßenrändern, Hundewiesen oder gespritzten Feldern sammeln.',
      'Gärendes oder welkes Grünzeug aus der Raufe nehmen.',
    ],
  ),
];

/** Ingredients the owner should look at closely before approving. */
const FLAG_RULES: [RegExp, string][] = [
  [/küchen|speise|essensrest|reste vom/i, 'Küchen- oder Speisereste dürfen nicht an Nutztiere (VO (EG) 1069/2009).'],
  [/fleisch|wurst|fisch|knochen/i, 'Tierische Produkte sind für Nutztiere verboten.'],
  [/eierschale|eier/i, 'Eier und Eierschalen aus dem eigenen Bestand dürfen nicht an Geflügel.'],
  [/avocado/i, 'Avocado ist für viele Tiere giftig.'],
  [/schokolade|kakao/i, 'Schokolade ist für Tiere giftig.'],
  [/zwiebel|lauch|knoblauch/i, 'Zwiebelgewächse schädigen die roten Blutkörperchen.'],
  [/kartoffel/i, 'Rohe oder grüne Kartoffeln enthalten Solanin.'],
  [/rhabarber/i, 'Rhabarberblätter enthalten Oxalsäure.'],
  [/eibe|thuja|oleander|kirschlorbeer|buchsbaum|goldregen/i, 'Giftige Zierpflanze.'],
  [/gebeizt/i, 'Gebeiztes Saatgut ist giftig.'],
  [/schimmel/i, 'Verschimmeltes Futter ist nie geeignet.'],
];

export function recipeFlags(recipe: Pick<Recipe, 'title' | 'ingredients' | 'steps'>): string[] {
  const text = [recipe.title, ...recipe.ingredients.map((i) => `${i.name} ${i.amount}`), ...recipe.steps].join('\n');
  return [...new Set(FLAG_RULES.filter(([re]) => re.test(text)).map(([, msg]) => msg))];
}

type Row = typeof feedRecipesTable.$inferSelect;

function fromRow(row: Row, viewerId: string | null): Recipe {
  return {
    id: `u:${row.id}`,
    title: row.title,
    species: row.species.filter((s): s is FarmSpecies => FARM_SPECIES.includes(s as FarmSpecies)),
    kind: RECIPE_KINDS.includes(row.kind as RecipeKind) ? (row.kind as RecipeKind) : 'mix',
    ingredients: row.ingredients,
    steps: row.steps,
    hygiene: row.hygiene,
    status: row.status as RecipeStatus,
    mine: viewerId !== null && row.authorId === viewerId,
  };
}

/** Built-in and approved recipes, plus the viewer's own that still wait (or were turned down). */
export async function listRecipes(viewerId: string): Promise<Recipe[]> {
  const rows = await db
    .select()
    .from(feedRecipesTable)
    .where(or(eq(feedRecipesTable.status, 'approved'), eq(feedRecipesTable.authorId, viewerId)))
    .orderBy(desc(feedRecipesTable.createdAt));
  return [...BUILT_IN_RECIPES, ...rows.map((r) => fromRow(r, viewerId))];
}

export interface RecipeInput {
  title: unknown;
  species: string[];
  kind: string;
  ingredients: { name: unknown; amount: unknown }[];
  steps: unknown[];
  hygiene?: unknown[] | null;
}

const MAX_PENDING = 5;

function line(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export async function submitRecipe(authorId: string, input: RecipeInput): Promise<Recipe> {
  const title = line(input.title, 80);
  const species = [...new Set(input.species)].filter((s): s is FarmSpecies => FARM_SPECIES.includes(s as FarmSpecies));
  const ingredients = input.ingredients.map((i) => ({ name: line(i.name, 80), amount: line(i.amount, 80) })).filter((i) => i.name);
  const steps = input.steps.map((s) => line(s, 300)).filter(Boolean);
  const hygiene = (input.hygiene ?? []).map((s) => line(s, 300)).filter(Boolean);
  if (!title) throw new FarmDataError(400, 'Bitte gib dem Rezept einen Namen.');
  if (species.length === 0) throw new FarmDataError(400, 'Für welche Tiere ist das Rezept?');
  if (!RECIPE_KINDS.includes(input.kind as RecipeKind)) throw new FarmDataError(400, 'Bitte wähle eine Rezeptart.');
  if (ingredients.length === 0 || ingredients.length > 20) throw new FarmDataError(400, 'Ein Rezept hat 1 bis 20 Zutaten.');
  if (steps.length === 0 || steps.length > 15) throw new FarmDataError(400, 'Ein Rezept hat 1 bis 15 Schritte.');
  if (hygiene.length > 10) throw new FarmDataError(400, 'Höchstens 10 Hygieneregeln.');
  const pending = await db
    .select({ id: feedRecipesTable.id })
    .from(feedRecipesTable)
    .where(and(eq(feedRecipesTable.authorId, authorId), eq(feedRecipesTable.status, 'pending')));
  if (pending.length >= MAX_PENDING) throw new FarmDataError(429, `Es warten schon ${MAX_PENDING} Rezepte von dir auf die Freigabe.`);
  const [row] = await db
    .insert(feedRecipesTable)
    .values({ title, species, kind: input.kind, ingredients, steps, hygiene, authorId })
    .returning();
  return fromRow(row!, authorId);
}

function rowId(id: string): number | null {
  const m = /^u:([1-9]\d{0,8})$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** The author withdraws a waiting recipe; the owner may remove any. */
export async function deleteRecipe(id: string, viewer: { id: string; isOwner: boolean }): Promise<void> {
  const n = rowId(id);
  if (n === null) throw notFound();
  const where = viewer.isOwner
    ? eq(feedRecipesTable.id, n)
    : and(eq(feedRecipesTable.id, n), eq(feedRecipesTable.authorId, viewer.id), inArray(feedRecipesTable.status, ['pending', 'rejected']));
  const deleted = await db.delete(feedRecipesTable).where(where).returning({ id: feedRecipesTable.id });
  if (deleted.length === 0) throw notFound();
}

export async function listRecipeDrafts(): Promise<RecipeDraft[]> {
  const rows = await db.select().from(feedRecipesTable).where(eq(feedRecipesTable.status, 'pending')).orderBy(feedRecipesTable.createdAt);
  return rows.map((r) => {
    const recipe = fromRow(r, null);
    return { ...recipe, flags: recipeFlags(recipe), createdAt: r.createdAt.toISOString() };
  });
}

export async function reviewRecipe(id: string, approve: boolean): Promise<Recipe> {
  const n = rowId(id);
  if (n === null) throw notFound();
  const [row] = await db
    .update(feedRecipesTable)
    .set({ status: approve ? 'approved' : 'rejected', reviewedAt: new Date() })
    .where(and(eq(feedRecipesTable.id, n), eq(feedRecipesTable.status, 'pending')))
    .returning();
  if (!row) throw notFound();
  return fromRow(row, null);
}
