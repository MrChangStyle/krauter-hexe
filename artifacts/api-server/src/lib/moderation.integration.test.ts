/**
 * Integration test for moderation against a REAL Postgres with the real
 * schema: reporting, grouping, and the owner's actions change real rows.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL and points at a
 * throwaway database with the schema pushed (see orphanCleanup.integration
 * .test.ts). The test empties the tables it uses – never point it at real data.
 */

import { beforeEach, describe, expect, it } from "vitest";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("moderation (real database)", () => {
  async function load() {
    const { pool } = await import("@workspace/db");
    const moderation = await import("./moderation");
    const { deleteAccount } = await import("./accountDeletion");
    return { pool, ...moderation, deleteAccount };
  }

  async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await load();
    return (await pool.query(text, params)).rows as T[];
  }

  let plantId = 0;

  beforeEach(async () => {
    await query(
      "TRUNCATE reports, plants, insects, users, favorites, tasks, care_guides, push_subscriptions, plant_scans, insect_scans, scan_attempts RESTART IDENTITY CASCADE",
    );
    await query(
      `INSERT INTO users (id, email, username, approved, is_owner) VALUES
         ('owner', 'owner@example.org', 'CHEF', true, true),
         ('anna', 'anna@example.org', 'ANNA', true, false),
         ('bert', 'bert@example.org', 'BERT', true, false),
         ('troll', 'troll@example.org', 'TROLL', true, false)`,
    );
    const [plant] = await query<{ id: number }>(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status,
         edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits,
         image_url, image_url_side, has_side_image, image_quality)
       VALUES ('Steinpilz', 'Boletus edulis', 'mushroom', 'edible', 'safe', '', '', '', '', '',
         'https://example.org/oben.jpg', 'https://example.org/seite.jpg', true, 8) RETURNING id`,
    );
    plantId = plant!.id;
  });

  it("files one open report per account and content", async () => {
    const { createReport } = await load();
    const input = { contentType: "plant_image" as const, contentId: String(plantId), reason: "person" as const };
    expect(await createReport("anna", input)).toBe(true);
    expect(await createReport("anna", { ...input, reason: "falsch" })).toBe(false);
    expect(await createReport("bert", input)).toBe(true);
    expect(await query("SELECT * FROM reports")).toHaveLength(2);
  });

  it("refuses reports on missing content and on your own name", async () => {
    const { createReport, ModerationError } = await load();
    await expect(
      createReport("anna", { contentType: "plant_image", contentId: "99999", reason: "spam" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createReport("anna", { contentType: "username", contentId: "anna", reason: "spam" }),
    ).rejects.toBeInstanceOf(ModerationError);
    await expect(
      createReport("anna", { contentType: "plant_image", contentId: "1 OR 1=1", reason: "spam" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("limits reports per account and day", async () => {
    const { createReport, DAILY_REPORT_LIMIT } = await load();
    for (let i = 0; i < DAILY_REPORT_LIMIT; i += 1) {
      await query(
        `INSERT INTO reports (user_id, content_type, content_id, reason, status)
         VALUES ('anna', 'username', $1, 'spam', 'dismissed')`,
        [`x${i}`],
      );
    }
    await expect(
      createReport("anna", { contentType: "username", contentId: "troll", reason: "spam" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("groups open reports per content with reasons and notes", async () => {
    const { createReport, listOpenReports } = await load();
    await createReport("anna", { contentType: "username", contentId: "troll", reason: "unangemessen", note: "  beleidigend " });
    await createReport("bert", { contentType: "username", contentId: "troll", reason: "unangemessen" });
    await createReport("anna", { contentType: "plant_image", contentId: String(plantId), reason: "person" });

    const groups = await listOpenReports();
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      contentType: "username",
      contentId: "troll",
      reportCount: 2,
      reasons: [{ reason: "unangemessen", count: 2 }],
      notes: ["beleidigend"],
      exists: true,
      label: "TROLL",
    });
    expect(groups[1]).toMatchObject({
      contentType: "plant_image",
      label: "Steinpilz",
      imageUrl: "https://example.org/oben.jpg",
      exists: true,
    });
  });

  it("removing a photo clears both photos, keeps the mushroom verification and closes the reports", async () => {
    const { createReport, resolveReports, listOpenReports } = await load();
    await createReport("anna", { contentType: "plant_image", contentId: String(plantId), reason: "person" });
    await createReport("bert", { contentType: "plant_image", contentId: String(plantId), reason: "person" });

    expect(
      await resolveReports({ contentType: "plant_image", contentId: String(plantId), action: "remove_image" }),
    ).toBe(2);

    const [plant] = await query(
      "SELECT image_url, image_url_side, has_side_image, image_quality FROM plants WHERE id = $1",
      [plantId],
    );
    expect(plant).toEqual({ image_url: null, image_url_side: null, has_side_image: true, image_quality: null });
    expect(await listOpenReports()).toHaveLength(0);
    const reports = await query("SELECT status, resolution FROM reports");
    expect(reports.every((r) => r["status"] === "resolved" && r["resolution"] === "remove_image")).toBe(true);
  });

  it("blocking an account locks it out and removes its name", async () => {
    const { createReport, resolveReports } = await load();
    await createReport("anna", { contentType: "username", contentId: "troll", reason: "unangemessen" });
    await resolveReports({ contentType: "username", contentId: "troll", action: "block_user" });

    const [troll] = await query("SELECT approved, username, blocked_at FROM users WHERE id = 'troll'");
    expect(troll!["approved"]).toBe(false);
    expect(troll!["username"]).toBeNull();
    expect(troll!["blocked_at"]).toBeInstanceOf(Date);
  });

  it("never blocks the owner and rolls everything back", async () => {
    const { resolveReports } = await load();
    await query(
      "INSERT INTO reports (user_id, content_type, content_id, reason) VALUES ('anna', 'username', 'owner', 'spam')",
    );
    await expect(
      resolveReports({ contentType: "username", contentId: "owner", action: "block_user" }),
    ).rejects.toMatchObject({ status: 400 });
    const [owner] = await query("SELECT approved, username FROM users WHERE id = 'owner'");
    expect(owner).toEqual({ approved: true, username: "CHEF" });
    const [report] = await query("SELECT status FROM reports");
    expect(report!["status"]).toBe("open");
  });

  it("rejects an action that does not fit the content", async () => {
    const { resolveReports } = await load();
    await expect(
      resolveReports({ contentType: "plant_image", contentId: String(plantId), action: "block_user" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("deleting an account removes its own reports and the reports about its name", async () => {
    const { createReport, deleteAccount } = await load();
    await createReport("troll", { contentType: "username", contentId: "anna", reason: "spam" });
    await createReport("anna", { contentType: "username", contentId: "troll", reason: "unangemessen" });
    await createReport("bert", { contentType: "plant_image", contentId: String(plantId), reason: "falsch" });

    await deleteAccount("troll");

    const rest = await query<{ user_id: string }>("SELECT user_id FROM reports");
    expect(rest.map((r) => r.user_id)).toEqual(["bert"]);
  });
});
