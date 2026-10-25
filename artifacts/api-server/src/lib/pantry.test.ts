import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { pantryStatus, pushMessage, suggestBestBefore } = await import("./pantry");

describe("suggestBestBefore", () => {
  it("suggests a usual keeping time per kind", () => {
    expect(suggestBestBefore("canned", "2026-08-15")).toBe("2027-08-15");
    expect(suggestBestBefore("frozen", "2026-08-15")).toBe("2027-05-15");
    expect(suggestBestBefore("honey", "2026-07-01")).toBe("2028-07-01");
    expect(suggestBestBefore("eggs", "2026-10-01")).toBe("2026-10-29");
    expect(suggestBestBefore("other", "2026-10-01")).toBeNull();
    // Month end stays in its month.
    expect(suggestBestBefore("fermented", "2026-08-31")).toBe("2027-02-28");
  });
});

describe("pantryStatus", () => {
  it("knows empty, expired, soon and fine", () => {
    expect(pantryStatus({ amount: 0, bestBefore: "2020-01-01" }, "2026-10-24")).toBe("empty");
    expect(pantryStatus({ amount: 2, bestBefore: "2026-10-23" }, "2026-10-24")).toBe("expired");
    expect(pantryStatus({ amount: 2, bestBefore: "2026-11-23" }, "2026-10-24")).toBe("soon");
    expect(pantryStatus({ amount: 2, bestBefore: "2026-11-24" }, "2026-10-24")).toBe("ok");
    expect(pantryStatus({ amount: 2, bestBefore: null }, "2026-10-24")).toBe("ok");
  });
});

describe("pushMessage", () => {
  it("names what runs out within 14 days, soonest first", () => {
    const item = (name: string, bestBefore: string | null, amount = 1) => ({ name, amount, unit: "Glas", bestBefore });
    expect(pushMessage([item("Gurken", "2026-11-01"), item("Bohnen", "2026-10-28"), item("Kirschen", "2026-12-01"), item("Leer", "2026-10-27", 0), item("Alt", "2026-10-20")], "2026-10-26")).toEqual({
      title: "Vorrat: 2 Dinge bald aufbrauchen",
      body: "Bohnen (bis 28.10.) · Gurken (bis 01.11.)",
    });
    expect(pushMessage([item("Honig", null)], "2026-10-26")).toBeNull();
  });
});
