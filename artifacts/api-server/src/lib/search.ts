/**
 * Suche (docs/suche.md): one box for everything – the shared plant and insect
 * archive, and on the active farm its animals, herds, beds, seeds, medicines,
 * bee colonies,
 * own feeds and contacts. Farm results only for members, and only from the
 * modules granted to them (Modul-Freigaben). The app adds its own pages.
 */

import {
  db,
  beeColoniesTable,
  farmAnimalsTable,
  farmContactsTable,
  farmFeedsTable,
  farmMembershipsTable,
  gardenBedsTable,
  herdsTable,
  insectsTable,
  medicinesTable,
  plantsTable,
  seedsTable,
  type FarmRole,
} from '@workspace/db';
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { canUseModule, type FarmModule } from './farmModuleAccess';
import { berlinDay } from './monitoring';

export const PER_GROUP = 6;

export interface SearchItem {
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchGroup {
  kind: 'plants' | 'insects' | 'animals' | 'herds' | 'beds' | 'seeds' | 'medicines' | 'feeds' | 'bees' | 'contacts';
  label: string;
  items: SearchItem[];
}

/** "%tom%" with LIKE wildcards in the query taken literally. */
function pattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function membership(userId: string, farmId: number): Promise<{ role: FarmRole; modules: string[] | null } | null> {
  const [m] = await db
    .select({ role: farmMembershipsTable.role, modules: farmMembershipsTable.modules, accessUntil: farmMembershipsTable.accessUntil })
    .from(farmMembershipsTable)
    .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, userId)));
  if (!m || (m.accessUntil !== null && m.accessUntil < berlinDay())) return null;
  return { role: m.role, modules: m.modules };
}

export async function search(userId: string, rawQuery: string, farmId: number | null): Promise<SearchGroup[]> {
  const q = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (q.length < 2) return [];
  const like = pattern(q);
  const groups: SearchGroup[] = [];
  const push = (kind: SearchGroup['kind'], label: string, items: SearchItem[]) => {
    if (items.length > 0) groups.push({ kind, label, items });
  };

  const plants = await db
    .select({ id: plantsTable.id, german: plantsTable.germanName, botanical: plantsTable.botanicalName })
    .from(plantsTable)
    .where(or(ilike(plantsTable.germanName, like), ilike(plantsTable.botanicalName, like)))
    // Names starting with the query first.
    .orderBy(sql`(${plantsTable.germanName} ILIKE ${`${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}) DESC`, asc(plantsTable.germanName))
    .limit(PER_GROUP);
  push('plants', 'Pflanzen & Pilze', plants.map((p) => ({ title: p.german, subtitle: p.botanical, href: `/pflanze/${p.id}` })));

  const insects = await db
    .select({ id: insectsTable.id, german: insectsTable.germanName, scientific: insectsTable.scientificName })
    .from(insectsTable)
    .where(or(ilike(insectsTable.germanName, like), ilike(insectsTable.scientificName, like)))
    .orderBy(asc(insectsTable.germanName))
    .limit(PER_GROUP);
  push('insects', 'Insekten', insects.map((i) => ({ title: i.german, subtitle: i.scientific, href: `/insekt/${i.id}` })));

  const member = farmId === null ? null : await membership(userId, farmId);
  if (member && farmId !== null) {
    const may = (m: FarmModule) => canUseModule(member.role, member.modules, m);

    const animals = await db
      .select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name, nr: farmAnimalsTable.registrationNumber })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.farmId, farmId), isNull(farmAnimalsTable.archivedAt), or(ilike(farmAnimalsTable.name, like), ilike(farmAnimalsTable.registrationNumber, like))))
      .orderBy(asc(farmAnimalsTable.name))
      .limit(PER_GROUP);
    push('animals', 'Tiere', animals.map((a) => ({ title: a.name, subtitle: a.nr, href: `/farm/${farmId}/tier/${a.id}` })));

    const herds = await db
      .select({ name: herdsTable.name })
      .from(herdsTable)
      .where(and(eq(herdsTable.farmId, farmId), ilike(herdsTable.name, like)))
      .orderBy(asc(herdsTable.name))
      .limit(PER_GROUP);
    push('herds', 'Gruppen', herds.map((h) => ({ title: h.name, subtitle: 'Gruppe', href: '/farm' })));

    if (may('garden')) {
      const beds = await db
        .select({ id: gardenBedsTable.id, name: gardenBedsTable.name })
        .from(gardenBedsTable)
        .where(and(eq(gardenBedsTable.farmId, farmId), ilike(gardenBedsTable.name, like)))
        .orderBy(asc(gardenBedsTable.name))
        .limit(PER_GROUP);
      push('beds', 'Beete', beds.map((b) => ({ title: b.name, subtitle: null, href: `/beete/${farmId}/${b.id}` })));
      const seeds = await db
        .select({ name: seedsTable.name, variety: seedsTable.variety })
        .from(seedsTable)
        .where(and(eq(seedsTable.farmId, farmId), isNull(seedsTable.archivedAt), or(ilike(seedsTable.name, like), ilike(seedsTable.variety, like))))
        .orderBy(asc(seedsTable.name))
        .limit(PER_GROUP);
      push('seeds', 'Saatgut', seeds.map((s) => ({ title: s.variety ? `${s.name} „${s.variety}“` : s.name, subtitle: 'Saatgut', href: '/beete/saatgut' })));
    }

    if (may('medicines')) {
      const meds = await db
        .select({ name: medicinesTable.name, ingredient: medicinesTable.activeIngredient })
        .from(medicinesTable)
        .where(and(eq(medicinesTable.farmId, farmId), isNull(medicinesTable.archivedAt), or(ilike(medicinesTable.name, like), ilike(medicinesTable.activeIngredient, like))))
        .orderBy(asc(medicinesTable.name))
        .limit(PER_GROUP);
      push('medicines', 'Arzneimittel', meds.map((m) => ({ title: m.name, subtitle: m.ingredient, href: '/farm/arzneimittel' })));
    }

    if (may('feed')) {
      const feeds = await db
        .select({ name: farmFeedsTable.name })
        .from(farmFeedsTable)
        .where(and(eq(farmFeedsTable.farmId, farmId), ilike(farmFeedsTable.name, like)))
        .orderBy(asc(farmFeedsTable.name))
        .limit(PER_GROUP);
      push('feeds', 'Eigene Futtermittel', feeds.map((f) => ({ title: f.name, subtitle: 'Futterplaner', href: '/farm/futter' })));
    }

    if (may('bees')) {
      const colonies = await db
        .select({ id: beeColoniesTable.id, name: beeColoniesTable.name, apiary: beeColoniesTable.apiary })
        .from(beeColoniesTable)
        .where(and(eq(beeColoniesTable.farmId, farmId), eq(beeColoniesTable.status, 'active'), or(ilike(beeColoniesTable.name, like), ilike(beeColoniesTable.apiary, like))))
        .orderBy(asc(beeColoniesTable.name))
        .limit(PER_GROUP);
      push('bees', 'Bienenvölker', colonies.map((c) => ({ title: c.name, subtitle: c.apiary ?? 'Bienenvolk', href: `/farm/bienen/${c.id}` })));
    }

    // Contacts are emergency numbers: open to every member.
    const contacts = await db
      .select({ name: farmContactsTable.name, role: farmContactsTable.role, phone: farmContactsTable.phone })
      .from(farmContactsTable)
      .where(and(eq(farmContactsTable.farmId, farmId), or(ilike(farmContactsTable.name, like), ilike(farmContactsTable.role, like))))
      .orderBy(asc(farmContactsTable.name))
      .limit(PER_GROUP);
    push('contacts', 'Kontakte', contacts.map((c) => ({ title: c.name, subtitle: [c.role, c.phone].filter(Boolean).join(' · ') || null, href: '/team' })));
  }
  return groups;
}
