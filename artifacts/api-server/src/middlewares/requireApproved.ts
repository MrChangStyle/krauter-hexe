import { type NextFunction, type Request, type Response } from 'express';

// Whole-app protection: every plant endpoint requires a signed-in AND
// owner-approved account. 401 -> not signed in (client shows the login
// screen), 403 -> signed in but not (or no longer) approved (client shows
// the waiting-for-approval screen).
export function requireApproved(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (!req.user.approved) {
    res
      .status(403)
      .json({ error: 'Dieses Konto ist noch nicht freigeschaltet.' });
    return;
  }
  next();
}

// Account management is reserved for the owner (the first account that ever
// signed in).
export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (!req.user.isOwner) {
    res.status(403).json({ error: 'Nur der Besitzer darf Konten verwalten.' });
    return;
  }
  next();
}
