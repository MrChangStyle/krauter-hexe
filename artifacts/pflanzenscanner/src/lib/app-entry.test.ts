import { describe, expect, it } from "vitest";
import { entryFor } from "@/lib/app-entry";

const at = (path: string, o: Partial<Parameters<typeof entryFor>[0]> = {}) => entryFor({ path, search: "", standalone: false, inApp: false, ...o });

describe("Homepage oder App", () => {
  it("shows the homepage for littlefarming.de in a browser tab", () => {
    expect(at("/")).toEqual({ show: "site" });
    expect(at("")).toEqual({ show: "site" });
  });

  it("opens the app at /app and puts the address back to /", () => {
    expect(at("/app")).toEqual({ show: "app", replacePath: "/" });
    expect(at("/app/")).toEqual({ show: "app", replacePath: "/" });
  });

  it("keeps the installed app and a tab that is in the app in the app", () => {
    expect(at("/", { standalone: true })).toEqual({ show: "app" });
    expect(at("/", { inApp: true })).toEqual({ show: "app" });
  });

  it("treats links with parameters and every app page as the app", () => {
    expect(at("/", { search: "?start=login" })).toEqual({ show: "app" });
    expect(at("/", { search: "?google=abgebrochen" })).toEqual({ show: "app" });
    expect(at("/", { search: "?" })).toEqual({ show: "site" });
    expect(at("/farm/stall")).toEqual({ show: "app" });
    expect(at("/aufgaben")).toEqual({ show: "app" });
  });
});
