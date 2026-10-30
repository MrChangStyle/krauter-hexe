import { Router, type IRouter } from 'express';
import { ListFeedbackResponse, MarkFeedbackBody, SendFeedbackBody, SendSiteFeedbackBody } from '@workspace/api-zod';

import { deleteFeedback, feedbackScreenshot, listFeedback, markFeedback, sendFeedback, sendSiteFeedback } from '../lib/feedback';
import { requireApproved, requireOwner } from '../middlewares/requireApproved';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Feedback to the owner (docs/feedback.md): everyone sends, the owner reads.
// The homepage bubble needs no account.

const router: IRouter = Router();

router.post(
  '/feedback',
  requireApproved,
  handle(async (req, res) => {
    const body = SendFeedbackBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await sendFeedback(req.user!.id, body.data);
    res.status(201).json({ ok: true });
  }),
);

router.post(
  '/feedback/site',
  handle(async (req, res) => {
    const body = SendSiteFeedbackBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const userId = req.isAuthenticated?.() && req.user?.approved ? req.user.id : null;
    await sendSiteFeedback(body.data, req.ip ?? 'unknown', userId);
    res.status(201).json({ ok: true });
  }),
);

router.get(
  '/feedback',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListFeedbackResponse.parse(await listFeedback()));
  }),
);

// The screenshot of a feedback – only for the owner, never cached by others.
router.get(
  '/feedback/:feedbackId/screenshot',
  requireOwner,
  handle(async (req, res) => {
    const id = idParam(req, 'feedbackId');
    const shot = id === null ? null : await feedbackScreenshot(id);
    if (!shot) return notFound(res);
    res.set({ 'Content-Type': shot.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.send(shot.bytes);
  }),
);

router.put(
  '/feedback/:feedbackId',
  requireOwner,
  handle(async (req, res) => {
    const id = idParam(req, 'feedbackId');
    if (id === null) return notFound(res);
    const body = MarkFeedbackBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await markFeedback(id, body.data.read);
    res.json(ListFeedbackResponse.parse(await listFeedback()));
  }),
);

router.delete(
  '/feedback/:feedbackId',
  requireOwner,
  handle(async (req, res) => {
    const id = idParam(req, 'feedbackId');
    if (id === null) return notFound(res);
    await deleteFeedback(id);
    res.json(ListFeedbackResponse.parse(await listFeedback()));
  }),
);

export default router;
