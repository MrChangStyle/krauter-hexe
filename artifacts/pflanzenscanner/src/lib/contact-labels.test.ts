import { describe, expect, it } from "vitest";
import { FarmContactKind } from "@workspace/api-client-react";
import { CONTACT_KINDS, groupContacts, telHref } from "@/lib/contact-labels";

describe("Wichtige Kontakte", () => {
  it("has a label for every kind the server knows", () => {
    expect(CONTACT_KINDS.map((k) => k.kind).sort()).toEqual(Object.values(FarmContactKind).sort());
  });

  it("groups by kind in the list order and skips empty kinds", () => {
    const c = (id: number, kind: FarmContactKind) => ({ id, kind, name: `K${id}`, role: null, phone: null, email: null, note: null });
    expect(groupContacts([c(1, "vet"), c(2, "self"), c(3, "vet")]).map((g) => [g.kind, g.contacts.map((x) => x.id)])).toEqual([
      ["self", [2]],
      ["vet", [1, 3]],
    ]);
  });

  it("dials numbers as typed", () => {
    expect(telHref("+49 (8031) 12-345")).toBe("tel:+49803112345");
    expect(telHref("0171 / 234 56")).toBe("tel:017123456");
  });
});
