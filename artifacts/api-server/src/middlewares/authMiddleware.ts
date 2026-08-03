import type { AuthUser } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { type NextFunction, type Request, type Response } from 'express';

import { clearAuthCookie, getAuthToken, setAuthCookie } from '../lib/auth';
import { createAuthToken, verifyAuthToken } from '../lib/token';

// How often the token is re-issued (once per day of activity is enough - the
// point is that active users never hit the 30-day expiry).
const ROLL_INTERVAL_S = 24 * 60 * 60;

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request['isAuthenticated'];

  const token = getAuthToken(req);
  if (!token) {
    next();
    return;
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    // Expired, tampered with, or signed with a different key.
    clearAuthCookie(res);
    next();
    return;
  }

  // Approval/ownership can change at any time (the owner manages accounts in
  // the app) and a removed account must lock out instantly - so req.user
  // always reflects the current DB row, never a snapshot taken at login time.
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!dbUser) {
    clearAuthCookie(res);
    next();
    return;
  }

  // Rolling sessions: hand out a fresh token once per day of activity, so an
  // active user never reaches the 30-day expiry and gets logged out mid-use.
  const nowS = Math.floor(Date.now() / 1000);
  if (nowS - payload.issuedAt > ROLL_INTERVAL_S) {
    setAuthCookie(res, await createAuthToken(dbUser.id));
  }

  req.user = {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    approved: dbUser.approved,
    isOwner: dbUser.isOwner,
    username: dbUser.username ?? null,
    leavesCount: dbUser.leavesCount ?? 0,
  };
  next();
}
