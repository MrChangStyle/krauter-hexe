/**
 * Modul-Freigaben (docs/team.md): an admin decides which farm modules each
 * member may use – e.g. a helper only sees Stall-Aufgaben and Futter. The role
 * still decides whether they may only look or also write. Admins always have
 * every module. null = everything (the default, and what existed before).
 *
 * requireFarm checks it for every farm route by the route's first path segment;
 * the push reminders skip members without the module.
 */

import { farmMembershipsTable } from '@workspace/db';
import { eq, isNull, or, sql, type SQL } from 'drizzle-orm';


export { FARM_MODULES, canUseModule, moduleOfRequest, type FarmModule } from './farmModuleAccess';
import { FARM_MODULES, type FarmModule } from './farmModuleAccess';

/** For push recipients: the membership may use `module`. */
export function grantedSql(module: FarmModule): SQL {
  return or(
    eq(farmMembershipsTable.role, 'admin'),
    isNull(farmMembershipsTable.modules),
    sql`${farmMembershipsTable.modules} @> ${JSON.stringify([module])}::jsonb`,
  )!;
}

/** null stays null (all); otherwise known farm modules, each once, in list order. */
export function cleanFarmModules(raw: unknown): FarmModule[] | null {
  if (raw === null) return null;
  if (!Array.isArray(raw)) return [];
  return FARM_MODULES.filter((m) => raw.includes(m));
}
