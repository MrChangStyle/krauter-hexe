import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { coerceSiteAnalysis, compass, sitePrompt } = await import("./beeSite");

const answer = {
  gesamt: "Guter Stand, aber zu feucht.",
  ausrichtung: "Fluglöcher nach Südosten – gut.",
  schutz: "Hecke im Westen hält den Wind ab.",
  bepflanzung: "Obstbäume und Wiese, im Sommer wenig Tracht.",
  feuchtigkeit: "Der Stand liegt in einer Senke, das Gras ist nass.",
  nachbarn: "Kein Weg in der Flugbahn.",
  tipps: ["Beuten 40 cm hoch stellen", "", "Phacelia säen", 7],
};

describe("Bienen – Standort-Check", () => {
  it("names the direction of the phone's compass", () => {
    expect([0, 44, 135, 180, 225, 350, -90, 720].map(compass)).toEqual(["Norden", "Nordosten", "Südosten", "Süden", "Südwesten", "Norden", "Westen", "Norden"]);
  });

  it("asks about orientation, shelter, plants, moisture and neighbours, with what the beekeeper said", () => {
    const prompt = sitePrompt({ heading: 135, apiary: "Obstwiese", question: "Ist es hier zu feucht?" });
    for (const part of ['"ausrichtung"', '"schutz"', '"bepflanzung"', '"feuchtigkeit"', "Feuchtgebiet", '"nachbarn"', '"tipps"']) expect(prompt).toContain(part);
    expect(prompt).toContain("nach Südosten (135°)");
    expect(prompt).toContain("Name des Bienenstands: Obstwiese.");
    expect(prompt).toContain("Frage des Imkers: Ist es hier zu feucht?");
    expect(sitePrompt({ heading: null, apiary: null, question: null })).not.toContain("Kompass");
  });

  it("keeps the AI's answer only when every part is there, with up to five tips", () => {
    expect(coerceSiteAnalysis(answer)).toEqual({
      overall: "Guter Stand, aber zu feucht.",
      orientation: "Fluglöcher nach Südosten – gut.",
      shelter: "Hecke im Westen hält den Wind ab.",
      forage: "Obstbäume und Wiese, im Sommer wenig Tracht.",
      moisture: "Der Stand liegt in einer Senke, das Gras ist nass.",
      neighbours: "Kein Weg in der Flugbahn.",
      tips: ["Beuten 40 cm hoch stellen", "Phacelia säen"],
    });
    expect(coerceSiteAnalysis({ ...answer, feuchtigkeit: " " })).toBeNull();
    expect(coerceSiteAnalysis({})).toBeNull();
  });
});
