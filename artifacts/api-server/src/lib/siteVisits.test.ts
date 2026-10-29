import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { analyticsEnabled, visitSource } = await import("./siteVisits");

describe("Besucher der Homepage", () => {
  it("names the origin from the campaign, else the referring domain", () => {
    expect(visitSource({ campaign: " Facebook-Gruppe " }, null)).toBe("facebook-gruppe");
    expect(visitSource({ campaign: "<script>", referrer: "https://www.youtube.com/watch?v=1" }, null)).toBe("youtube.com");
    expect(visitSource({ referrer: "https://littlefarming.de/preise" }, "www.littlefarming.de")).toBe("intern");
    expect(visitSource({ referrer: "kaputt" }, null)).toBe("direkt");
    expect(visitSource({}, null)).toBe("direkt");
  });

  it("can be switched off", () => {
    expect(analyticsEnabled({})).toBe(true);
    expect(analyticsEnabled({ ANALYTICS: "OFF" })).toBe(false);
  });
});
