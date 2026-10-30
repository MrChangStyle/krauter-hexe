/**
 * An AI answer that took too long (docs/kostenschutz.md). Kept apart from
 * plantIdentification so routes can tell it apart without loading the AI client.
 */

/** The AI did not answer within the time someone waits on screen – not a fault of ours. */
export class AiTimeoutError extends Error {
  constructor() {
    super("AI request timed out");
    this.name = "AiTimeoutError";
  }
}

/** True for a chain that ran out of time: our own budget or an aborted request. */
export function isAiTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return err instanceof AiTimeoutError || name === "AbortError" || name === "TimeoutError";
}
