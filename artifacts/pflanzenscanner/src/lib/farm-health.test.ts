import { describe, expect, it } from "vitest";
import type { FarmAnimal, MedicalRecord, WeightLog } from "@workspace/api-client-react";
import {
  activeWithdrawalEnd,
  exportCsv,
  exportFileName,
  exportForPeriod,
  weightWarning,
  withdrawalEnd,
} from "@/lib/farm-health";

let nextId = 1;
const w = (date: string, weightKg: number): WeightLog => ({
  id: nextId++,
  animalId: 1,
  date,
  weightKg,
  createdAt: `${date}T08:00:00Z`,
});

const animal = (over: Partial<FarmAnimal> = {}): FarmAnimal => ({
  id: 1,
  herdId: null,
  herdName: null,
  name: "Lotte",
  species: "goat",
  breed: null,
  birthDate: "2023-04-12",
  sex: "female",
  registrationNumber: "DE 1",
  imageUrl: null,
  notes: null,
  archivedAt: null,
  createdAt: "2025-01-01T10:00:00Z",
  ...over,
});

const rec = (over: Partial<MedicalRecord> = {}): MedicalRecord => ({
  id: nextId++,
  animalId: 1,
  date: "2026-05-02",
  diagnosis: "Moderhinke",
  treatment: null,
  medication: null,
  withdrawalPeriodDays: null,
  vet: null,
  notes: null,
  createdAt: "2026-05-02T10:00:00Z",
  ...over,
});

describe("weightWarning", () => {
  it("warns at more than 5 % loss against the heaviest weighing of the 14 days before", () => {
    const warning = weightWarning([w("2026-05-01", 40), w("2026-05-08", 42), w("2026-05-15", 39.5)]);
    expect(warning).toEqual({ lossPercent: 6, fromKg: 42, fromDate: "2026-05-08", toKg: 39.5, toDate: "2026-05-15" });
  });

  it("stays quiet at exactly 5 % and below", () => {
    expect(weightWarning([w("2026-05-01", 40), w("2026-05-10", 38)])).toBeNull();
    expect(weightWarning([w("2026-05-01", 40), w("2026-05-10", 39)])).toBeNull();
  });

  it("ignores weighings older than 14 days and needs two entries", () => {
    expect(weightWarning([w("2026-04-01", 50), w("2026-05-01", 40)])).toBeNull();
    expect(weightWarning([w("2026-04-17", 50), w("2026-05-01", 40)])?.lossPercent).toBe(20);
    expect(weightWarning([w("2026-05-01", 40)])).toBeNull();
  });

  it("does not depend on the order it gets", () => {
    expect(weightWarning([w("2026-05-15", 9), w("2026-05-08", 10)])?.lossPercent).toBe(10);
  });
});

describe("Wartezeit", () => {
  it("ends that many days after the treatment", () => {
    expect(withdrawalEnd(rec({ date: "2026-05-30", withdrawalPeriodDays: 7 }))).toBe("2026-06-06");
    expect(withdrawalEnd(rec({ withdrawalPeriodDays: 0 }))).toBeNull();
  });

  it("finds the latest one still running", () => {
    const records = [
      rec({ date: "2026-05-01", withdrawalPeriodDays: 3 }),
      rec({ date: "2026-05-02", withdrawalPeriodDays: 10 }),
    ];
    expect(activeWithdrawalEnd(records, "2026-05-05")).toBe("2026-05-12");
    expect(activeWithdrawalEnd(records, "2026-05-13")).toBeNull();
  });
});

describe("veterinary office export", () => {
  const data = {
    farmName: "Hof Sonnenblick",
    holdingNumber: null as string | null,
    animals: [
      animal(),
      animal({ id: 2, name: "Alt", registrationNumber: "DE 0", archivedAt: "2025-12-31T10:00:00Z" }),
      animal({ id: 3, name: "Neu", registrationNumber: "DE 3", createdAt: "2026-07-01T10:00:00Z" }),
    ],
    medicalRecords: [
      rec({ date: "2026-05-02", diagnosis: "Husten; leicht", withdrawalPeriodDays: 7, medication: '=HYPERLINK("x")' }),
      rec({ date: "2026-08-01", diagnosis: "Später" }),
    ],
    beeColonies: [],
    beeTreatments: [],
  };

  it("lists animals without a ring or ear tag after the others, with an empty cell", () => {
    const out = exportForPeriod(
      { ...data, animals: [animal({ id: 7, name: "Zora", registrationNumber: null }), animal({ id: 8, name: "Anni", registrationNumber: null }), animal()] },
      { from: "2026-01-01", to: "2026-06-30" },
    );
    expect(out.animals.map((a) => a.name)).toEqual(["Lotte", "Anni", "Zora"]);
    expect(exportCsv(out)).toContain("\r\n;Anni;Ziege;");
  });

  it("keeps animals on the farm in the period and records inside it", () => {
    const out = exportForPeriod(data, { from: "2026-01-01", to: "2026-06-30" });
    expect(out.animals.map((a) => a.name)).toEqual(["Lotte"]);
    expect(out.records.map((r) => r.record.diagnosis)).toEqual(["Husten; leicht"]);
  });

  it("writes a CSV Excel opens safely", () => {
    const csv = exportCsv(exportForPeriod(data, { from: "2026-01-01", to: "2026-06-30" }));
    expect(csv.startsWith("﻿Bestandsliste Hof Sonnenblick;1.1.2026 – 30.6.2026\r\n")).toBe(true);
    const withNumber = exportCsv(exportForPeriod({ ...data, holdingNumber: "276 09 123 456 7890" }, { from: "2026-01-01", to: "2026-06-30" }));
    expect(withNumber.startsWith("﻿Bestandsliste Hof Sonnenblick;1.1.2026 – 30.6.2026;Registriernummer 276 09 123 456 7890\r\n")).toBe(true);
    expect(csv).toContain("DE 1;Lotte;Ziege;;weiblich;12.4.2023;;\r\n");
    expect(csv).toContain(`2.5.2026;DE 1;Lotte;"Husten; leicht";;"'=HYPERLINK(""x"")";;7;9.5.2026;\r\n`);
  });

  it("adds the colonies and the Bestandsbuch of their treatments when the farm keeps bees", () => {
    const colony = { id: 1, name: "Volk 1", apiary: "Obstwiese", status: "active" as const, startedOn: "2025-05-01", endedOn: null, createdAt: "2025-05-01T10:00:00Z" };
    const treatment = (date: string) => ({
      id: 1,
      date,
      colonyName: "Volk 1",
      apiary: "Obstwiese",
      method: "oxalsaeure" as const,
      product: "Oxalsäure 3,5 %",
      dose: 30,
      unit: "ml",
      batch: "OX-11",
      source: "Dr. Imker",
      notes: null,
    });
    const bees = {
      ...data,
      beeColonies: [colony, { ...colony, id: 2, name: "Alt", status: "lost" as const, endedOn: "2025-10-01" }],
      beeTreatments: [treatment("2025-12-20"), treatment("2026-03-01")],
    };
    const out = exportForPeriod(bees, { from: "2026-01-01", to: "2026-06-30" });
    expect(out.beeColonies.map((c) => c.name)).toEqual(["Volk 1"]);
    expect(out.beeTreatments.map((t) => t.date)).toEqual(["2026-03-01"]);
    const csv = exportCsv(out);
    expect(csv).toContain("\r\nBienenvölker\r\nVolk;Bienenstand;Status;Seit;Bis\r\nVolk 1;Obstwiese;Aktiv;1.5.2025;\r\n");
    expect(csv).toContain("1.3.2026;Volk 1;Obstwiese;Oxalsäure;Oxalsäure 3,5 %;30 ml;OX-11;Dr. Imker;\r\n");
    // Without bees the CSV ends with the health history.
    expect(exportCsv(exportForPeriod(data, { from: "2026-01-01", to: "2026-06-30" }))).not.toContain("Bienen");
  });

  it("names the file after farm and period", () => {
    const out = exportForPeriod(data, { from: "2026-01-01", to: "2026-06-30" });
    expect(exportFileName(out, "pdf")).toBe("LittleFarming_Bestand_Hof-Sonnenblick_2026-01-01_2026-06-30.pdf");
  });
});
