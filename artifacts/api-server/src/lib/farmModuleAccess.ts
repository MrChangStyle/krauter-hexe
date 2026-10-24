/**
 * Modul-Freigaben – the pure part (docs/team.md): which module a farm route
 * belongs to and whether a membership may use it. No database imports, so
 * requireFarm stays light; lib/farmModules.ts adds the SQL side.
 */

import type { FarmRole } from '@workspace/db';

/** The farm modules that can be granted (ids as in ModuleId / lib/modules.ts). */
export const FARM_MODULES = ['farm-tasks', 'feed', 'breeding', 'medicines', 'duties', 'yields', 'wildlife', 'handover', 'export', 'members', 'garden', 'bees', 'pantry'] as const;
export type FarmModule = (typeof FARM_MODULES)[number];

/**
 * Which module a farm route belongs to, by the segment after /farms/:farmId/.
 * Not listed (animals, herds, health, setup, location, weather, the farm
 * itself): the farm's basics, open to every member – the modules build on them.
 */
const SEGMENT_MODULE: Record<string, FarmModule> = {
  tasks: 'farm-tasks',
  feed: 'feed',
  'feed-calendar': 'feed',
  'feed-stock': 'feed',
  feeds: 'feed',
  rations: 'feed',
  breeding: 'breeding',
  medicines: 'medicines',
  duties: 'duties',
  yields: 'yields',
  'yield-overview': 'yields',
  laying: 'yields',
  expenses: 'yields',
  sales: 'yields',
  prices: 'yields',
  cameras: 'wildlife',
  'camera-events': 'wildlife',
  handover: 'handover',
  'handover-note': 'handover',
  export: 'export',
  members: 'members',
  beds: 'garden',
  plantings: 'garden',
  garden: 'garden',
  seeds: 'garden',
  harvests: 'garden',
  'helpful-plants': 'garden',
  bees: 'bees',
  pantry: 'pantry',
};

/**
 * The module a request needs, or null. Leaving the farm (DELETE on members)
 * and reading the contacts (emergency numbers) stay open to everyone.
 */
export function moduleOfRequest(method: string, path: string): FarmModule | null {
  const segment = /^\/farms\/\d+\/([^/]+)/.exec(path)?.[1];
  if (!segment) return null;
  if (segment === 'members' && method === 'DELETE') return null;
  return SEGMENT_MODULE[segment] ?? null;
}

export function canUseModule(role: FarmRole, modules: readonly string[] | null, module: FarmModule): boolean {
  return role === 'admin' || modules === null || modules.includes(module);
}
