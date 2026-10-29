import { Router, type IRouter, type Request } from 'express';
import {
  GetAppStatusResponse,
  GetSiteVisitsResponse,
  GetUsageResponse,
  ListErrorGroupsResponse,
  ReportClientErrorBody,
  SetAppStatusBody,
  SetAppStatusResponse,
} from '@workspace/api-zod';

import { recordVisit, visitReport } from '../lib/siteVisits';
import { requireOwner } from '../middlewares/requireApproved';
import {
  getStatus,
  listErrorGroups,
  normalizePath,
  recordError,
  resolveErrorGroup,
  setStatus,
  usageSummary,
} from '../lib/monitoring';

// Betrieb: the status notice (read by everyone, also before sign-in), error
// reports from the app, and the owner's view of errors and daily totals.

const router: IRouter = Router();

router.get('/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(GetAppStatusResponse.parse(await getStatus()));
});

router.put('/admin/status', requireOwner, async (req, res) => {
  const body = SetAppStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Bitte prüfe deine Eingaben.' });
    return;
  }
  res.json(SetAppStatusResponse.parse(await setStatus(body.data.message ?? null, body.data.level)));
});

// App errors arrive without sign-in (they happen on the login screen too), so
// each address may send only a few; nothing about the sender is stored.
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 20;
const reportsByAddress = new Map<string, { count: number; since: number }>();

function tooMany(req: Request): boolean {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = reportsByAddress.get(key);
  if (!entry || now - entry.since > WINDOW_MS) {
    if (reportsByAddress.size > 10_000) reportsByAddress.clear();
    reportsByAddress.set(key, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  return entry.count > PER_WINDOW;
}

router.post('/client-errors', (req, res) => {
  if (tooMany(req)) {
    res.status(429).json({ error: 'Zu viele Meldungen.' });
    return;
  }
  const body = ReportClientErrorBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Bitte prüfe deine Eingaben.' });
    return;
  }
  recordError({
    source: 'client',
    message: body.data.message,
    stack: body.data.stack ?? null,
    location: body.data.path ? normalizePath(body.data.path) : null,
    release: body.data.release ?? null,
  });
  res.sendStatus(204);
});

router.get('/admin/errors', requireOwner, async (_req, res) => {
  res.json(ListErrorGroupsResponse.parse(await listErrorGroups()));
});

router.post('/admin/errors/:fingerprint/resolve', requireOwner, async (req, res) => {
  const fp = String(req.params['fingerprint']);
  if (!/^[0-9a-f]{40}$/.test(fp) || !(await resolveErrorGroup(fp))) {
    res.status(404).json({ error: 'Nicht gefunden.' });
    return;
  }
  res.sendStatus(204);
});

router.get('/admin/usage', requireOwner, async (_req, res) => {
  res.json(GetUsageResponse.parse(await usageSummary()));
});

// Besucher der Homepage (docs/analyse.md): counted without account, cookie or IP.
router.post('/site/visit', async (req, res) => {
  const body = (req.body ?? {}) as { path?: unknown; campaign?: unknown; referrer?: unknown };
  await recordVisit(body, req.get('user-agent'), req.get('host') ?? null);
  res.sendStatus(204);
});

router.get('/admin/site-visits', requireOwner, async (_req, res) => {
  res.json(GetSiteVisitsResponse.parse(await visitReport()));
});

export default router;
