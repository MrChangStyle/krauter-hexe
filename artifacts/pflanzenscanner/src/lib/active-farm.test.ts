import { describe, expect, it } from "vitest";
import { pickActiveFarm } from "@/lib/active-farm";

const farms = [
  { id: 3, name: "Hof Anna", role: "admin" as const },
  { id: 7, name: "Hof Bert", role: "guest" as const },
];

describe("pickActiveFarm", () => {
  it("keeps the remembered farm while the account still belongs to it", () => {
    expect(pickActiveFarm(farms, 7)?.id).toBe(7);
  });

  it("falls back to the first farm after leaving the remembered one", () => {
    expect(pickActiveFarm(farms, 99)?.id).toBe(3);
    expect(pickActiveFarm(farms, null)?.id).toBe(3);
  });

  it("has nothing to show without farms", () => {
    expect(pickActiveFarm([], 3)).toBeNull();
  });
});
