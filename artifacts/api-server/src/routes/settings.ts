import { Router, type IRouter } from 'express';
import { GetSettingsResponse, SetSettingsBody, SetSettingsResponse } from '@workspace/api-zod';

import { getSettings, setSettings } from '../lib/userSettings';
import { requireApproved } from '../middlewares/requireApproved';
import { badRequest, handle } from './farmRouteHelpers';

// Module the account uses and the first-start assistant (docs/module.md).

const router: IRouter = Router();

router.get(
  '/settings',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetSettingsResponse.parse(await getSettings(req.user!.id)));
  }),
);

router.put(
  '/settings',
  requireApproved,
  handle(async (req, res) => {
    const body = SetSettingsBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(SetSettingsResponse.parse(await setSettings(req.user!.id, body.data)));
  }),
);

export default router;
