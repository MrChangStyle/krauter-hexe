/**
 * The plans from speech (Hof-Aufgaben, Alltagsnotizen) are waited for on
 * screen. The server gives up after 25 s (AI_PLAN_TIMEOUT_MS); the app waits
 * a little longer, then splits the text itself – it never hangs.
 */
export const AI_PLAN_WAIT_MS = 30_000;

/** What the app says when the AI took too long – the same shape as a server error. */
export const AI_TOO_SLOW = { data: { error: "Die KI hat zu lange gebraucht." } };

/** The answer, or AI_TOO_SLOW as the error once `ms` have passed. */
export function withPlanTimeout<T>(answer: Promise<T>, ms: number = AI_PLAN_WAIT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(AI_TOO_SLOW), ms);
  });
  return Promise.race([answer, slow]).finally(() => clearTimeout(timer));
}
