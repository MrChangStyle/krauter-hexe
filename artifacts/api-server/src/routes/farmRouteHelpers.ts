import type { Request, Response } from 'express';

import { FarmDataError } from '../lib/farmAnimals';
import { checkAndRecordScanAttempt, refundScanAttempt } from '../lib/scanRateLimit';

// Shared by the farm data routes (farm-animals.ts, farm-health.ts,
// farm-tasks.ts, farm-ai.ts, garden.ts).

export function idParam(req: Request, name: string): number | null {
  const raw = req.params[name];
  return typeof raw === 'string' && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

/** Runs a handler, turning FarmDataError into its status and German message. */
export function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof FarmDataError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  };
}

export function badRequest(res: Response) {
  res.status(400).json({ error: 'Bitte prüfe deine Eingaben.' });
}

export function notFound(res: Response) {
  res.status(404).json({ error: 'Nicht gefunden.' });
}

const AI_AREA = { farm: 'die Farm', garden: 'den Garten', grow: 'den Grow' } as const;

/**
 * Records one AI attempt, or answers 429 and returns null. A failed AI call
 * gives its attempt back (like the plant scan). Farm and garden have their own
 * daily counter and share the app-wide budget.
 */
export async function withAiQuota<T>(
  req: Request,
  res: Response,
  area: keyof typeof AI_AREA,
  run: () => Promise<T>,
): Promise<T | null> {
  const user = req.user!;
  const limit = await checkAndRecordScanAttempt(user.id, area, { unlimited: user.isOwner });
  if (!limit.allowed) {
    res.status(429).json({
      error:
        limit.reason === 'budget'
          ? 'Die KI ist für heute ausgelastet. Bitte versuche es morgen wieder.'
          : `Du hast heute schon ${limit.limit} KI-Anfragen für ${AI_AREA[area]} gestellt. Morgen geht es weiter.`,
      resetsAt: limit.resetsAt,
    });
    return null;
  }
  try {
    return await run();
  } catch (err) {
    await refundScanAttempt(limit.attemptId);
    if (err instanceof FarmDataError) throw err;
    req.log.error({ err }, 'AI request failed');
    throw new FarmDataError(502, 'Die KI ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.');
  }
}
