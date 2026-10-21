import { Router, type IRouter } from 'express';
import { GetDashboardResponse, SetDashboardBody, SetDashboardResponse } from '@workspace/api-zod';

import { getDashboard, setDashboard } from '../lib/dashboard';
import { requireApproved } from '../middlewares/requireApproved';
import { badRequest, handle } from './farmRouteHelpers';

// Hof-Dashboard: the account's own choice of widgets (docs/dashboard.md).

const router: IRouter = Router();

router.get(
  '/dashboard',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetDashboardResponse.parse(await getDashboard(req.user!.id)));
  }),
);

router.put(
  '/dashboard',
  requireApproved,
  handle(async (req, res) => {
    const body = SetDashboardBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetDashboardResponse.parse(await setDashboard(req.user!.id, body.data.widgets)));
  }),
);

export default router;
