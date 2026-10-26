import { eq } from "drizzle-orm";
import { db, plantsTable, type SymptomsMap, type SymptomApplicationsMap } from "@workspace/db";
import { logger } from "./logger";
import { normalizePlantSymptoms } from "./plantSymptomNames";

/**
 * Renames the stored symptom tags of all plants to the fixed names. Runs in
 * the background after start; only plants whose tags change are written, so
 * once the data is clean it only reads.
 */
export async function normalizeStoredSymptoms(): Promise<{ processed: number; updated: number }> {
  const rows = await db
    .select({ id: plantsTable.id, symptoms: plantsTable.symptoms, symptomApplications: plantsTable.symptomApplications })
    .from(plantsTable);
  let updated = 0;
  for (const row of rows) {
    const next = normalizePlantSymptoms((row.symptoms as SymptomsMap) ?? {}, (row.symptomApplications as SymptomApplicationsMap) ?? {});
    if (!next.changed) continue;
    await db
      .update(plantsTable)
      .set({ symptoms: next.symptoms, symptomApplications: next.applications })
      .where(eq(plantsTable.id, row.id));
    updated++;
  }
  if (updated > 0) logger.info({ processed: rows.length, updated }, "Symptom tags renamed to the fixed names");
  return { processed: rows.length, updated };
}
