import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { errorFromLog, fingerprint, normalizeMessage, normalizePath, topFrame } = await import("./monitoring");

const stack = (fn: string) => `Error: boom
    at Object.parse (/app/node_modules/zod/index.js:12:3)
    at ${fn} (/app/dist/index.mjs:4711:22)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`;

describe("error monitor", () => {
  it("blanks what varies from one occurrence to the next", () => {
    expect(normalizeMessage('Plant 1234 not found for "anna@example.org" (id 3f2b9c1e-1111-4222-8333-944455556666)')).toBe(
      'Plant # not found for "…" (id <id>)',
    );
    expect(normalizePath("/api/farms/12/beds/7/seasons/2026/plantings?x=1")).toBe("/api/farms/:id/beds/:id/seasons/:id/plantings");
  });

  it("takes the first frame of our own code", () => {
    expect(topFrame(stack("listBeds"))).toBe("at listBeds (/app/dist/index.mjs");
    expect(topFrame(null)).toBeNull();
  });

  it("groups the same error, and only that", () => {
    const a = fingerprint({ source: "server", message: "Plant 12 failed", stack: stack("listBeds") });
    expect(fingerprint({ source: "server", message: "Plant 99 failed", stack: stack("listBeds") })).toBe(a);
    expect(fingerprint({ source: "server", message: "Plant 99 failed", stack: stack("addPlanting") })).not.toBe(a);
    expect(fingerprint({ source: "client", message: "Plant 12 failed", stack: stack("listBeds") })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it("turns error logs into reports, without double counting", () => {
    const err = new Error("connection refused");
    expect(errorFromLog({ err }, "Frost forecast failed")).toMatchObject({
      source: "server",
      message: "Frost forecast failed: connection refused",
      location: "Frost forecast failed",
      stack: expect.stringContaining("connection refused"),
    });
    expect(errorFromLog(null, "Something broke")).toMatchObject({ message: "Something broke", stack: null });
    expect(errorFromLog({ err, captured: true }, "Unhandled route error")).toBeNull();
    expect(errorFromLog({ err }, "request errored")).toBeNull();
    expect(errorFromLog({}, undefined)).toBeNull();
  });
});
