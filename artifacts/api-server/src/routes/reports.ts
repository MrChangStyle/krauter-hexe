import { Router, type IRouter, type Response } from 'express';
import {
  CreateReportBody,
  ListReportsResponse,
  ResolveReportsBody,
  ResolveReportsResponse,
} from '@workspace/api-zod';

import { requireApproved, requireOwner } from '../middlewares/requireApproved';
import {
  ModerationError,
  createReport,
  listOpenReports,
  resolveReports,
} from '../lib/moderation';

const router: IRouter = Router();

function sendModerationError(res: Response, err: unknown): boolean {
  if (err instanceof ModerationError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

// Any approved account: report a shared photo or a username.
router.post('/reports', requireApproved, async (req, res): Promise<void> => {
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Ungültige Meldung.' });
    return;
  }
  try {
    await createReport(req.user!.id, body.data);
  } catch (err) {
    if (sendModerationError(res, err)) return;
    throw err;
  }
  // Same answer for a repeated report: the reporter needs no different reaction.
  res.status(201).json({ ok: true });
});

// Owner: open reports, grouped by content.
router.get('/reports', requireOwner, async (_req, res): Promise<void> => {
  res.json(ListReportsResponse.parse(await listOpenReports()));
});

// Owner: act on all open reports of one content.
router.post('/reports/resolve', requireOwner, async (req, res): Promise<void> => {
  const body = ResolveReportsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Ungültige Anfrage.' });
    return;
  }
  try {
    const resolved = await resolveReports(body.data);
    req.log.info({ ...body.data, resolved }, 'Reports resolved');
    res.json(ResolveReportsResponse.parse({ resolved }));
  } catch (err) {
    if (sendModerationError(res, err)) return;
    throw err;
  }
});

export default router;
