import type { NextFunction, Request, Response } from 'express';

import { normalizePath, recordError, serverRelease } from '../lib/monitoring';

/**
 * Last stop for errors a route did not handle: server errors are recorded
 * for the owner (error monitor), and every error is answered with a German
 * message instead of Express' HTML page.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const e = err as { status?: number; statusCode?: number } | null;
  const status = e?.status ?? e?.statusCode ?? 500;
  if (status >= 500) {
    const error = err instanceof Error ? err : new Error(String(err));
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : normalizePath(req.originalUrl);
    recordError({ source: 'server', message: error.message, stack: error.stack, location: `${req.method} ${route}`, release: serverRelease() });
    req.log?.error({ err: error, captured: true }, 'Unhandled route error');
  }
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? 'Da ist etwas schiefgelaufen. Bitte versuche es später noch einmal.' : 'Bitte prüfe deine Eingaben.' });
}
