// "Am Stall" (docs/stall.md): taps are kept on the device first and sent
// when there is a connection – in the stall there often is none. Each tap has
// an id the server stores, so a tap sent twice (sent, but the answer got
// lost) is counted once. Egg taps of the same day that are still waiting are
// merged into one entry.

import { todayIso } from "@/lib/farm-labels";

export interface StallTap {
  id: string;
  farmId: number;
  kind: "eggs" | "task";
  /** Eggs only. */
  amount?: number;
  /** Task only. */
  taskId?: number;
  /** Day of the tap (YYYY-MM-DD, device time). */
  date: string;
  /** Time of the tap (ISO). */
  at: string;
  /**
   * Sent at least once. The server may have stored it even if the answer got
   * lost, so it is never changed again – a changed amount under the same id
   * would be dropped as a repeat.
   */
  tried?: boolean;
}

export const STALL_QUEUE_KEY = "lf-stall-queue";

/** Taps on their way to the server right now: never sent twice at once. */
const sending = new Set<string>();
const listeners = new Set<() => void>();

type Store = Pick<Storage, "getItem" | "setItem">;

function store(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Without storage (private mode) the queue lives in memory for this visit. */
let memory: StallTap[] = [];

export function readQueue(s: Store | null = store()): StallTap[] {
  if (!s) return memory;
  try {
    const raw = JSON.parse(s.getItem(STALL_QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as StallTap[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(taps: StallTap[], s: Store | null = store()): void {
  memory = taps;
  try {
    s?.setItem(STALL_QUEUE_KEY, JSON.stringify(taps));
  } catch {
    // Storage full or blocked: memory still has it.
  }
  for (const listener of listeners) listener();
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** +n eggs today; merged into a waiting egg tap of the same farm and day. */
export function addEggs(farmId: number, n: number, now = new Date(), s: Store | null = store()): void {
  const date = todayIso(now);
  const taps = readQueue(s);
  const open = taps.find((t) => t.kind === "eggs" && t.farmId === farmId && t.date === date && !t.tried && !sending.has(t.id));
  if (open) open.amount = (open.amount ?? 0) + n;
  else taps.push({ id: newId(), farmId, kind: "eggs", amount: n, date, at: now.toISOString() });
  writeQueue(taps, s);
}

/** Takes back one egg that has not been sent yet. False when there is none. */
export function undoEgg(farmId: number, now = new Date(), s: Store | null = store()): boolean {
  const date = todayIso(now);
  const taps = readQueue(s);
  const open = taps.find((t) => t.kind === "eggs" && t.farmId === farmId && t.date === date && !t.tried && !sending.has(t.id));
  if (!open) return false;
  open.amount = (open.amount ?? 0) - 1;
  writeQueue(
    taps.filter((t) => t !== open || (t.amount ?? 0) > 0),
    s,
  );
  return true;
}

export function addTaskDone(farmId: number, taskId: number, now = new Date(), s: Store | null = store()): void {
  const taps = readQueue(s);
  if (taps.some((t) => t.kind === "task" && t.farmId === farmId && t.taskId === taskId)) return;
  taps.push({ id: newId(), farmId, kind: "task", taskId, date: todayIso(now), at: now.toISOString() });
  writeQueue(taps, s);
}

/** What is still waiting for this farm: today's eggs and the tasks ticked off. */
export function pendingFor(farmId: number, now = new Date(), s: Store | null = store()): { eggs: number; tasks: Set<number>; count: number } {
  const date = todayIso(now);
  const mine = readQueue(s).filter((t) => t.farmId === farmId);
  return {
    eggs: mine.filter((t) => t.kind === "eggs" && t.date === date).reduce((sum, t) => sum + (t.amount ?? 0), 0),
    tasks: new Set(mine.filter((t) => t.kind === "task").map((t) => t.taskId!)),
    count: mine.length,
  };
}

const base = () => (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");

function request(tap: StallTap): [string, RequestInit] {
  const init = (body: unknown): RequestInit => ({
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (tap.kind === "eggs") {
    return [`${base()}/api/farms/${tap.farmId}/yields`, init({ product: "eggs", date: tap.date, amount: tap.amount, clientId: tap.id })];
  }
  return [`${base()}/api/farms/${tap.farmId}/tasks/${tap.taskId}/complete`, init({ doneAt: tap.at })];
}

/**
 * Sends what is waiting. A tap leaves the queue once the server answered:
 * stored, or refused for good (400, 403, 404 – the farm, task or right is
 * gone). Without a connection, on 401/429 and on server errors it stays and
 * is tried again later. Returns how many were sent.
 */
export async function flushQueue(fetchFn: typeof fetch = fetch, s: Store | null = store()): Promise<number> {
  let sent = 0;
  for (const { id } of readQueue(s)) {
    // Read again: more eggs may have been merged in while earlier taps were sent.
    const tap = readQueue(s).find((t) => t.id === id);
    if (!tap || sending.has(id)) continue;
    sending.add(id);
    writeQueue(
      readQueue(s).map((t) => (t.id === id ? { ...t, tried: true } : t)),
      s,
    );
    try {
      const res = await fetchFn(...request(tap));
      if (res.ok || [400, 403, 404].includes(res.status)) {
        writeQueue(
          readQueue(s).filter((t) => t.id !== tap.id),
          s,
        );
        if (res.ok) sent++;
      }
    } catch {
      // Offline: stays for the next try.
    } finally {
      sending.delete(tap.id);
    }
  }
  return sent;
}
