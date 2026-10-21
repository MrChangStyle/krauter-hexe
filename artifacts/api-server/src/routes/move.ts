import { Router, type IRouter } from 'express';

import { clearParcels, moveStatus, nextParcel, putParcel } from '../lib/moveParcels';
import { requireApproved } from '../middlewares/requireApproved';
import { handle } from './farmRouteHelpers';

// Umzug über das Konto (docs/landingpage.md). Not in the OpenAPI spec: the
// parcels are opaque MoveBatch objects the app packs and unpacks itself.

const router: IRouter = Router();

router.get(
  '/move/status',
  requireApproved,
  handle(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await moveStatus(req.user!.id));
  }),
);

router.post(
  '/move/parcels',
  requireApproved,
  handle(async (req, res) => {
    const body = (req.body ?? {}) as { batch?: unknown; entries?: unknown };
    res.status(201).json(await putParcel(req.user!.id, body.batch, body.entries));
  }),
);

router.get(
  '/move/parcels/next',
  requireApproved,
  handle(async (req, res) => {
    const raw = req.query['after'];
    const after = typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? Number(raw) : 0;
    const parcel = await nextParcel(req.user!.id, after);
    res.set('Cache-Control', 'no-store');
    if (!parcel) {
      res.status(204).end();
      return;
    }
    res.json(parcel);
  }),
);

router.delete(
  '/move/parcels',
  requireApproved,
  handle(async (req, res) => {
    await clearParcels(req.user!.id);
    res.status(204).end();
  }),
);

export default router;
