import { type NextFunction, type Request, type Response } from 'express';
import { db, farmMembershipsTable, type FarmRole } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

import { requireApproved } from './requireApproved';

/**
 * Access to one farm's data ("Meine Farm"). Every farm route has a :farmId
 * parameter and goes through requireFarm(minRole):
 *
 * - the account must be signed in and approved (requireApproved),
 * - it must be a member of exactly that farm – otherwise 404, so a stranger
 *   cannot even tell whether the farm exists,
 * - its role must be at least minRole – otherwise 403.
 *
 * The app owner gets no automatic access: farm data is private to its members.
 * Handlers then use req.farm.farmId in EVERY query (farmScope / where).
 */

export interface FarmContext {
  farmId: number;
  userId: string;
  role: FarmRole;
}

declare global {
  namespace Express {
    interface Request {
      farm?: FarmContext;
    }
  }
}

const RANK: Record<FarmRole, number> = { guest: 0, caretaker: 1, admin: 2 };

export function roleAtLeast(role: FarmRole, minRole: FarmRole): boolean {
  return RANK[role] >= RANK[minRole];
}

/** The farm id from the route, or null when it is not a plain positive integer. */
export function parseFarmId(raw: unknown): number | null {
  return typeof raw === 'string' && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

export function requireFarm(minRole: FarmRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireApproved(req, res, () => {
      const farmId = parseFarmId(req.params['farmId']);
      if (farmId === null) {
        res.status(404).json({ error: 'Farm nicht gefunden.' });
        return;
      }
      const userId = req.user!.id;
      db.select({ role: farmMembershipsTable.role })
        .from(farmMembershipsTable)
        .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, userId)))
        .then(([membership]) => {
          if (!membership) {
            res.status(404).json({ error: 'Farm nicht gefunden.' });
            return;
          }
          if (!roleAtLeast(membership.role, minRole)) {
            res.status(403).json({ error: 'Dafür fehlen dir auf dieser Farm die Rechte.' });
            return;
          }
          req.farm = { farmId, userId, role: membership.role };
          next();
        })
        .catch(next);
    });
  };
}
