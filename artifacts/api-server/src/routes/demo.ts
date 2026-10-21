import { Router, type IRouter } from 'express';
import { DeleteDemoResponse, GetDemoStatusResponse, LoadDemoResponse } from '@workspace/api-zod';

import { deleteDemo, demoStatus, loadDemo } from '../lib/demoData';
import { requireApproved } from '../middlewares/requireApproved';
import { handle } from './farmRouteHelpers';

// Demo-Daten: load and delete the Demo-Hof (docs/demo.md).

const router: IRouter = Router();

router.get(
  '/demo',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetDemoStatusResponse.parse(await demoStatus(req.user!.id)));
  }),
);

router.post(
  '/demo',
  requireApproved,
  handle(async (req, res) => {
    res.json(LoadDemoResponse.parse(await loadDemo(req.user!.id)));
  }),
);

router.delete(
  '/demo',
  requireApproved,
  handle(async (req, res) => {
    res.json(DeleteDemoResponse.parse(await deleteDemo(req.user!.id)));
  }),
);

export default router;
