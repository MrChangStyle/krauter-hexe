import { describe, expect, it } from "vitest";
import { SYMPTOM_GROUPS, SYMPTOM_NAMES, SYMPTOM_RULES, canonicalSymptom } from "@/lib/symptom-vocabulary";

const same = (name: string, variants: string[]) => {
  for (const v of variants) expect(canonicalSymptom(v), v).toBe(name);
};

describe("Beschwerden-Wortschatz", () => {
  it("merges what means the same", () => {
    same("Magen-Darm-Beschwerden", ["Magen-Darm-Beschwerden", "Magen-Darm-Krampf", "Magenkrämpfe", "Verdauungsbeschwerden", "Verdauungsprobleme", "Bauchschmerzen", "Sodbrennen", "Kolik", "Magenbeschwerden"]);
    same("Mund- und Rachenentzündungen", ["Rachenraumentzündung", "Rachenentzündung", "Mandelentzündung", "Zahnfleischentzündung", "Schleimhautentzündung", "Entzündungen der Mundschleimhaut", "Angina"]);
    same("Entzündungen (allgemein)", ["Entzündung", "Entzündungen", "entzündungshemmend", "Entzündliche Prozesse"]);
    same("Hautentzündungen", ["Hautentzündung", "Hautentzündungen", "Entzündete Haut", "Dermatitis"]);
    same("Magen-Darm-Entzündungen", ["Magenschleimhautentzündung", "Gastritis", "Darmentzündung"]);
    same("Kopfschmerzen", ["Kopfschmerz", "Kopfschmerzen", "Migräne", "Spannungskopfschmerz"]);
    same("Husten", ["Husten", "Reizhusten", "Bronchitis", "Bronchialkatarrh"]);
    same("Halsschmerzen", ["Halsschmerzen", "Halsbeschwerden", "Heiserkeit"]);
    same("Wunden", ["Wunde", "Wunden", "Wundheilung", "Schürfwunden", "Kleine Verletzungen"]);
    same("Verbrennungen", ["Verbrennung", "Sonnenbrand", "Brandwunden"]);
    same("Krämpfe", ["Krampf", "Krämpfe", "Muskelkrampf", "krampflösend"]);
    same("Frauenbeschwerden", ["Menstruationsbeschwerden", "Regelschmerzen", "Wechseljahresbeschwerden", "Menstruationskrämpfe"]);
    same("Blasen- und Harnwegsinfekte", ["Harnwegsinfektion", "Blasenentzündung", "Nierenbeschwerden"]);
    same("Parasiten & Würmer", ["Würmer", "Wurmbefall", "Milben", "Parasiten", "Kokzidiose"]);
    same("Nervosität & Stress", ["Nervosität", "Unruhe", "Stress", "Angstzustände"]);
    same("Abwehrschwäche", ["Immunschwäche", "Abwehrschwäche", "Stärkung des Immunsystems"]);
    same("Erschöpfung", ["Müdigkeit", "Erschöpfung", "Schwäche"]);
    same("Insektenstiche", ["Insektenstiche", "Mückenstich", "Bienenstich", "Stiche"]);
    same("Hautprobleme", ["Hautprobleme", "Ekzeme", "Juckreiz", "Akne", "Hautausschlag"]);
    same("Erkältung & Schnupfen", ["Erkältung", "Grippaler Infekt", "Schnupfen", "Nasennebenhöhlenentzündung"]);
    same("Gelenk- und Muskelschmerzen", ["Rheuma", "Gelenkschmerzen", "Muskelschmerzen", "Gicht"]);
    same("Gelenkentzündungen", ["Arthritis", "Gelenkentzündung"]);
  });

  it("keeps unknown complaints in sentence case", () => {
    expect(canonicalSymptom("legenot")).toBe("Legenot");
    expect(canonicalSymptom("  HUFREHE ")).toBe("Hufrehe");
  });

  it("is stable: a fixed name maps to itself", () => {
    for (const n of SYMPTOM_NAMES) expect(canonicalSymptom(n), n).toBe(n);
  });

  it("has no double names – also not as singular and plural", () => {
    const stem = (n: string) => n.toLocaleLowerCase("de-DE").replace(/(en|n|e|s)$/u, "");
    expect(new Set(SYMPTOM_NAMES).size).toBe(SYMPTOM_NAMES.length);
    expect(new Set(SYMPTOM_NAMES.map(stem)).size).toBe(SYMPTOM_NAMES.length);
  });

  it("puts every name in a group, and only known names", () => {
    const grouped = new Set(SYMPTOM_GROUPS.flatMap((g) => g.names));
    expect([...grouped].sort()).toEqual([...SYMPTOM_NAMES].sort());
    for (const g of SYMPTOM_GROUPS) expect(new Set(g.names).size, g.label).toBe(g.names.length);
    expect(SYMPTOM_RULES.length).toBe(SYMPTOM_NAMES.length);
  });
});
