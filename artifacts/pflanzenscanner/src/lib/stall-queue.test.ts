import { describe, expect, it, vi } from "vitest";
import { addEggs, addTaskDone, flushQueue, pendingFor, readQueue, undoEgg } from "@/lib/stall-queue";

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const at = (iso: string) => new Date(iso);
const ok = () => new Response(null, { status: 204 });

describe("stall queue", () => {
  it("merges egg taps of a day and takes one back", () => {
    const s = memoryStore();
    const now = at("2026-10-24T08:00:00");
    addEggs(1, 1, now, s);
    addEggs(1, 1, now, s);
    addEggs(2, 1, now, s);
    addEggs(1, 1, at("2026-10-25T08:00:00"), s);
    expect(readQueue(s).map((t) => [t.farmId, t.date, t.amount])).toEqual([
      [1, "2026-10-24", 2],
      [2, "2026-10-24", 1],
      [1, "2026-10-25", 1],
    ]);
    expect(undoEgg(1, now, s)).toBe(true);
    expect(undoEgg(1, now, s)).toBe(true);
    expect(undoEgg(1, now, s)).toBe(false);
    expect(pendingFor(1, now, s).eggs).toBe(0);
  });

  it("sends eggs with their id and tasks with the time they were ticked off", async () => {
    const s = memoryStore();
    addEggs(1, 3, at("2026-10-24T08:00:00"), s);
    addTaskDone(1, 7, at("2026-10-24T08:05:00Z"), s);
    addTaskDone(1, 7, at("2026-10-24T08:06:00Z"), s); // twice is once
    expect(pendingFor(1, at("2026-10-24T09:00:00"), s)).toMatchObject({ eggs: 3, count: 2 });
    const fetchFn = vi.fn().mockImplementation(async () => ok());
    expect(await flushQueue(fetchFn, s)).toBe(2);
    const [[eggUrl, eggInit], [taskUrl, taskInit]] = fetchFn.mock.calls as [string, RequestInit][];
    expect(eggUrl).toMatch(/\/api\/farms\/1\/yields$/);
    const egg = JSON.parse(String(eggInit.body));
    expect(egg).toMatchObject({ product: "eggs", date: "2026-10-24", amount: 3 });
    expect(egg.clientId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(taskUrl).toMatch(/\/api\/farms\/1\/tasks\/7\/complete$/);
    expect(JSON.parse(String(taskInit.body))).toEqual({ doneAt: "2026-10-24T08:05:00.000Z" });
    expect(readQueue(s)).toEqual([]);
  });

  it("keeps taps without a connection and never changes one that was sent", async () => {
    const s = memoryStore();
    const now = at("2026-10-24T08:00:00");
    addEggs(1, 2, now, s);
    expect(await flushQueue(vi.fn().mockRejectedValue(new TypeError("offline")), s)).toBe(0);
    // The server may have it already: a new tap gets its own entry.
    addEggs(1, 1, now, s);
    expect(undoEgg(1, now, s)).toBe(true);
    expect(undoEgg(1, now, s)).toBe(false);
    addEggs(1, 1, now, s);
    expect(readQueue(s).map((t) => t.amount)).toEqual([2, 1]);
    // Server errors stay, refusals for good go.
    expect(await flushQueue(vi.fn().mockResolvedValue(new Response(null, { status: 503 })), s)).toBe(0);
    expect(readQueue(s)).toHaveLength(2);
    expect(await flushQueue(vi.fn().mockResolvedValue(new Response(null, { status: 403 })), s)).toBe(0);
    expect(readQueue(s)).toEqual([]);
  });

  it("sends eggs merged in while earlier taps were on their way", async () => {
    const s = memoryStore();
    const now = at("2026-10-24T08:00:00");
    addTaskDone(1, 7, now, s);
    addEggs(1, 1, now, s);
    const bodies: string[] = [];
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      if (bodies.length === 1) addEggs(1, 1, now, s);
      return ok();
    });
    await flushQueue(fetchFn, s);
    expect(JSON.parse(bodies[1]!).amount).toBe(2);
    expect(readQueue(s)).toEqual([]);
  });
});
