/**
 * What an account set up for itself (docs/module.md): the modules it hides and
 * whether it went through the first-start assistant. The modules themselves
 * live in the web app; the server only keeps the choice.
 */

import { ModuleId, type ModuleId as Module } from '@workspace/api-zod';
import { db, userSettingsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const KNOWN = new Set<string>(Object.values(ModuleId));

export interface UserSettings {
  hiddenModules: Module[];
  onboarded: boolean;
}

/** Known ids only, each once – a module the app no longer has drops out. */
export function cleanModules(ids: readonly string[]): Module[] {
  return [...new Set(ids)].filter((m): m is Module => KNOWN.has(m));
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const [row] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId));
  return { hiddenModules: cleanModules(row?.hiddenModules ?? []), onboarded: !!row?.onboardedAt };
}

export async function setSettings(userId: string, input: { hiddenModules?: readonly string[]; onboarded?: boolean }): Promise<UserSettings> {
  const set: Partial<typeof userSettingsTable.$inferInsert> = { updatedAt: new Date() };
  if (input.hiddenModules !== undefined) set.hiddenModules = cleanModules(input.hiddenModules);
  if (input.onboarded !== undefined) set.onboardedAt = input.onboarded ? new Date() : null;
  await db
    .insert(userSettingsTable)
    .values({ userId, hiddenModules: set.hiddenModules ?? [], onboardedAt: set.onboardedAt ?? null })
    .onConflictDoUpdate({ target: userSettingsTable.userId, set });
  return getSettings(userId);
}
