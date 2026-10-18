import type { Request, Response } from 'express';

import { FarmDataError } from '../lib/farmAnimals';

// Shared by the farm data routes (farm-animals.ts, farm-health.ts,
// farm-tasks.ts).

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
