import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { expiryMessage, medicineStatus, withdrawalFor } = await import("./medicines");

describe("Arzneimittel-Vorrat", () => {
  const m = { amount: 50, expiresOn: "2026-12-31", archivedAt: null };

  it("knows expired, soon expiring, empty and archived medicines", () => {
    expect(medicineStatus(m, "2026-10-19")).toBe("ok");
    expect(medicineStatus(m, "2026-12-01")).toBe("expiresSoon");
    expect(medicineStatus(m, "2027-01-01")).toBe("expired");
    expect(medicineStatus({ ...m, amount: 0 }, "2026-10-19")).toBe("empty");
    expect(medicineStatus({ ...m, archivedAt: new Date() }, "2027-01-01")).toBe("archived");
    expect(medicineStatus({ ...m, expiresOn: null }, "2030-01-01")).toBe("ok");
  });

  it("takes the longest withdrawal period of what the species gives", () => {
    const w = { withdrawalMeatDays: 28, withdrawalMilkDays: 5, withdrawalEggsDays: 7 };
    expect(withdrawalFor(w, "poultry")).toBe(28);
    expect(withdrawalFor({ ...w, withdrawalMeatDays: 3 }, "poultry")).toBe(7);
    expect(withdrawalFor({ ...w, withdrawalMeatDays: 3 }, "goat")).toBe(5);
    expect(withdrawalFor(w, "pig")).toBe(28);
    expect(withdrawalFor(w, "dog")).toBeNull();
    expect(withdrawalFor({ withdrawalMeatDays: null, withdrawalMilkDays: null, withdrawalEggsDays: null }, "cattle")).toBeNull();
  });

  it("reminds 30 days before and on the day of expiry", () => {
    const list = [
      { name: "Wurmkur", expiresOn: "2026-11-18", amount: 20 },
      { name: "Spray", expiresOn: "2026-10-19", amount: 0 },
      { name: "Leer", expiresOn: "2026-11-18", amount: 0 },
    ];
    expect(expiryMessage(list, "2026-10-19")).toEqual({
      title: "Arzneimittel-Vorrat",
      body: "Heute läuft ab: Spray – nicht mehr verwenden, über Apotheke oder Tierarzt entsorgen. In 30 Tagen läuft ab: Wurmkur.",
    });
    expect(expiryMessage(list, "2026-10-20")).toBeNull();
  });
});
