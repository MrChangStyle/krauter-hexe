/**
 * Beschwerden-Wortschatz against a REAL Postgres: stored symptom tags are
 * renamed to the fixed names, variants collapse, instructions move along,
 * a second run changes nothing.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { beforeEach, describe, expect, it } from "vitest";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("normalizeStoredSymptoms (Postgres)", () => {
  beforeEach(async () => {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE plants RESTART IDENTITY CASCADE`);
  });

  async function addPlant(symptoms: object, symptomApplications: object) {
    const { db, plantsTable } = await import("@workspace/db");
    const [row] = await db
      .insert(plantsTable)
      .values({
        germanName: "Kamille",
        botanicalName: "Matricaria chamomilla",
        category: "medicinal",
        humanStatus: "edible",
        poultryStatus: "safe",
        edibilityDetails: "",
        animalToxicityDetails: "",
        activeIngredients: "",
        humanBenefits: "Beruhigt den Magen.",
        poultryBenefits: "",
        symptoms,
        symptomApplications,
      } as never)
      .returning({ id: plantsTable.id });
    return row!.id;
  }

  it("renames once and leaves clean rows alone", async () => {
    const { db, plantsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { normalizeStoredSymptoms } = await import("./plantSymptoms");
    const dirty = await addPlant(
      { human: ["Magenkrämpfe", "Verdauungsbeschwerden", "Rachenentzündung"], rabbit: ["verdauungsprobleme"] },
      { human: { Magenkrämpfe: "Als Tee.", Verdauungsbeschwerden: "Kauen.", Rachenentzündung: "Gurgeln." } },
    );
    await addPlant({ human: ["Husten"] }, { human: { Husten: "Tee." } });

    expect(await normalizeStoredSymptoms()).toEqual({ processed: 2, updated: 1 });
    const [row] = await db.select().from(plantsTable).where(eq(plantsTable.id, dirty));
    expect(row!.symptoms).toEqual({ human: ["Magen-Darm-Beschwerden", "Mund- und Rachenentzündungen"], rabbit: ["Magen-Darm-Beschwerden"] });
    expect(row!.symptomApplications).toEqual({
      human: { "Magen-Darm-Beschwerden": "Als Tee. Kauen.", "Mund- und Rachenentzündungen": "Gurgeln." },
    });
    expect(await normalizeStoredSymptoms()).toEqual({ processed: 2, updated: 0 });
  });
});
