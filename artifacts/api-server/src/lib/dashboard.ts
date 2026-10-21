/**
 * Hof-Dashboard (docs/dashboard.md): which widgets an account shows, in its
 * order. The widgets themselves live in the web app; the server only keeps
 * the choice. No row means the default layout of the app.
 */

import { DashboardWidgetId, type DashboardWidgetId as WidgetId } from '@workspace/api-zod';
import { dashboardLayoutsTable, db } from '@workspace/db';
import { eq } from 'drizzle-orm';

const KNOWN = new Set<string>(Object.values(DashboardWidgetId));

/** Known ids only, each once – a widget that was removed from the app drops out. */
export function cleanLayout(widgets: readonly string[]): WidgetId[] {
  return [...new Set(widgets)].filter((w): w is WidgetId => KNOWN.has(w));
}

export async function getDashboard(userId: string): Promise<{ widgets: WidgetId[] | null }> {
  const [row] = await db.select({ widgets: dashboardLayoutsTable.widgets }).from(dashboardLayoutsTable).where(eq(dashboardLayoutsTable.userId, userId));
  return { widgets: row ? cleanLayout(row.widgets) : null };
}

/** Saves the choice; null goes back to the default. */
export async function setDashboard(userId: string, widgets: readonly string[] | null): Promise<{ widgets: WidgetId[] | null }> {
  if (widgets === null) {
    await db.delete(dashboardLayoutsTable).where(eq(dashboardLayoutsTable.userId, userId));
    return { widgets: null };
  }
  const clean = cleanLayout(widgets);
  await db
    .insert(dashboardLayoutsTable)
    .values({ userId, widgets: clean })
    .onConflictDoUpdate({ target: dashboardLayoutsTable.userId, set: { widgets: clean, updatedAt: new Date() } });
  return { widgets: clean };
}
