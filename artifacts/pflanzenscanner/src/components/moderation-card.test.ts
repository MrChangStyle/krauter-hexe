import { describe, expect, it } from "vitest";
import type { ReportGroup } from "@workspace/api-client-react";
import { actionsFor } from "@/components/moderation-card";

function group(overrides: Partial<ReportGroup>): ReportGroup {
  return {
    contentType: "plant_image",
    contentId: "1",
    reportCount: 1,
    reasons: [{ reason: "person", count: 1 }],
    notes: [],
    firstReportedAt: "2026-10-18T10:00:00.000Z",
    exists: true,
    label: "Steinpilz",
    imageUrl: "https://example.org/a.jpg",
    ...overrides,
  };
}

describe("actionsFor", () => {
  it("offers removing the photo for a reported photo, with confirmation", () => {
    const actions = actionsFor(group({}));
    expect(actions.map((a) => a.action)).toEqual(["dismiss", "remove_image"]);
    expect(actions[0]!.confirm).toBeUndefined();
    expect(actions[1]!.confirm).toMatch(/Steinpilz/);
  });

  it("offers renaming and blocking for a reported username", () => {
    const actions = actionsFor(group({ contentType: "username", label: "TROLL" }));
    expect(actions.map((a) => a.action)).toEqual(["dismiss", "reset_username", "block_user"]);
    expect(actions.slice(1).every((a) => !!a.confirm)).toBe(true);
  });

  it("only offers closing the report when the content is already gone", () => {
    const actions = actionsFor(group({ exists: false }));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "dismiss", label: "Erledigt" });
  });
});
