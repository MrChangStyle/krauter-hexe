/**
 * Window-to-window transfer for the move helper.
 *
 * The old address opens the new one in a new window. The new window says
 * "ready" to its opener; the old one then sends batches one at a time and
 * waits for each acknowledgement before sending the next, so nothing is lost
 * if the new window is closed half-way. Messages go only to the exact expected
 * origin and are accepted only from it.
 */

import {
  MOVE_PROTOCOL,
  NO_COUNTS,
  addCounts,
  applyMoveBatch,
  batchEntries,
  countDeviceData,
  packDeviceData,
  type MoveProgress,
  type DeviceStore,
  type MoveBatch,
  type MoveCounts,
  browserDeviceStore,
} from "@/lib/move";

type MoveMessage =
  | { proto: typeof MOVE_PROTOCOL; type: "ready" }
  // progress: added later; older senders leave it out.
  | { proto: typeof MOVE_PROTOCOL; type: "batch"; seq: number; batch: MoveBatch; progress?: MoveProgress }
  | { proto: typeof MOVE_PROTOCOL; type: "ack"; seq: number; stored: MoveCounts }
  | { proto: typeof MOVE_PROTOCOL; type: "done"; seq: number }
  | { proto: typeof MOVE_PROTOCOL; type: "error"; seq: number; message: string };

/** The parts of the browser's messaging this module uses (faked in tests). */
export interface MessagePort {
  post(target: { postMessage(msg: unknown, origin: string): void }, msg: MoveMessage, origin: string): void;
  listen(handler: (data: unknown, origin: string, source: unknown) => void): () => void;
}

export const windowMessagePort: MessagePort = {
  post: (target, msg, origin) => target.postMessage(msg, origin),
  listen: (handler) => {
    const listener = (event: MessageEvent) => handler(event.data, event.origin, event.source);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  },
};

function isMoveMessage(data: unknown): data is MoveMessage {
  return !!data && typeof data === "object" && (data as { proto?: unknown }).proto === MOVE_PROTOCOL;
}

const ACK_TIMEOUT_MS = 60_000;

/**
 * Old address: waits for "ready" from the new window, then sends everything.
 * Resolves with what the new address stored; rejects on timeout or error.
 */
export function sendDeviceData(options: {
  target: { postMessage(msg: unknown, origin: string): void };
  targetOrigin: string;
  onProgress?: (sent: MoveCounts, progress: MoveProgress) => void;
  readyTimeoutMs?: number;
  store?: DeviceStore;
  port?: MessagePort;
}): Promise<MoveCounts> {
  const {
    target,
    targetOrigin,
    onProgress,
    // Long enough to type the site password in the new window first.
    readyTimeoutMs = 10 * 60_000,
    store = browserDeviceStore,
    port = windowMessagePort,
  } = options;

  return new Promise((resolve, reject) => {
    let waiting: { seq: number; resolve: (stored: MoveCounts) => void; reject: (e: Error) => void } | null = null;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (err: Error) => {
      clearTimeout(timer);
      unlisten();
      reject(err);
    };

    const waitForAck = (seq: number) =>
      new Promise<MoveCounts>((res, rej) => {
        waiting = { seq, resolve: res, reject: rej };
        clearTimeout(timer);
        timer = setTimeout(
          () => rej(new Error("Das neue Fenster antwortet nicht mehr. Bitte lass es offen und versuche es erneut.")),
          ACK_TIMEOUT_MS,
        );
      });

    const unlisten = port.listen((data, origin) => {
      if (origin !== targetOrigin || !isMoveMessage(data)) return;
      if (data.type === "ready" && !started) {
        started = true;
        void run();
      } else if (data.type === "ack" && waiting && data.seq === waiting.seq) {
        waiting.resolve(data.stored);
      } else if (data.type === "error" && waiting && data.seq === waiting.seq) {
        waiting.reject(new Error(data.message));
      }
    });

    timer = setTimeout(
      () => fail(new Error("Die neue Adresse hat sich nicht gemeldet. Falls sich kein Fenster geöffnet hat, nutze „Als Datei sichern“.")),
      readyTimeoutMs,
    );

    async function run() {
      try {
        let stored = NO_COUNTS;
        let seq = 0;
        const counts = await countDeviceData(store);
        const progress: MoveProgress = { done: 0, total: counts.images + counts.queue + counts.draft };
        onProgress?.(stored, { ...progress });
        for await (const batch of packDeviceData(store)) {
          seq += 1;
          progress.done = Math.min(progress.total, progress.done + batchEntries(batch));
          const ack = waitForAck(seq);
          port.post(target, { proto: MOVE_PROTOCOL, type: "batch", seq, batch, progress: { ...progress } }, targetOrigin);
          stored = addCounts(stored, await ack);
          onProgress?.(stored, { ...progress });
        }
        seq += 1;
        const finished = waitForAck(seq);
        port.post(target, { proto: MOVE_PROTOCOL, type: "done", seq }, targetOrigin);
        await finished;
        clearTimeout(timer);
        unlisten();
        resolve(stored);
      } catch (err) {
        fail(err instanceof Error ? err : new Error("Der Umzug ist fehlgeschlagen."));
      }
    }
  });
}

/**
 * New address: tells the opener it is ready and stores every batch it gets
 * from one of the allowed old addresses. Returns a function that stops
 * listening.
 */
export function receiveDeviceData(options: {
  opener: { postMessage(msg: unknown, origin: string): void };
  allowedOrigins: string[];
  onBatch?: (stored: MoveCounts, progress: MoveProgress | null) => void;
  onDone?: () => void;
  store?: DeviceStore;
  port?: MessagePort;
  readyIntervalMs?: number;
}): () => void {
  const { opener, allowedOrigins, onBatch, onDone, store = browserDeviceStore, port = windowMessagePort, readyIntervalMs = 2_000 } = options;
  let busy: Promise<void> = Promise.resolve();
  let repeat: ReturnType<typeof setInterval> | undefined;

  const unlisten = port.listen((data, origin) => {
    if (!allowedOrigins.includes(origin) || !isMoveMessage(data)) return;
    // The old address heard us: no more "ready".
    clearInterval(repeat);
    if (data.type === "batch") {
      // One batch at a time, in order.
      busy = busy.then(async () => {
        try {
          const stored = await applyMoveBatch(data.batch, store);
          onBatch?.(stored, data.progress ?? null);
          port.post(opener, { proto: MOVE_PROTOCOL, type: "ack", seq: data.seq, stored }, origin);
        } catch {
          port.post(
            opener,
            { proto: MOVE_PROTOCOL, type: "error", seq: data.seq, message: "Speichern auf der neuen Adresse fehlgeschlagen (Speicher voll?)." },
            origin,
          );
        }
      });
    } else if (data.type === "done") {
      busy = busy.then(() => {
        port.post(opener, { proto: MOVE_PROTOCOL, type: "ack", seq: data.seq, stored: NO_COUNTS }, origin);
        onDone?.();
      });
    }
  });

  // The opener may be any of the old addresses; only the matching one gets it.
  // Said again and again until the old address answers: it may not be
  // listening yet, or it started over after the site password was typed here.
  const sayReady = () => {
    for (const origin of allowedOrigins) {
      try {
        port.post(opener, { proto: MOVE_PROTOCOL, type: "ready" }, origin);
      } catch {
        /* wrong origin for this opener: ignored by the browser */
      }
    }
  };
  sayReady();
  repeat = setInterval(sayReady, readyIntervalMs);
  return () => {
    clearInterval(repeat);
    unlisten();
  };
}
