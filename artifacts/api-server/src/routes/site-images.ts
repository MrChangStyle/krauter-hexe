import { Router, type IRouter } from 'express';
import { GenerateSiteImageBody, ListSiteImageSlotsResponse, ListSiteImagesResponse } from '@workspace/api-zod';

import { requireOwner } from '../middlewares/requireApproved';
import { deleteSiteImage, generateSiteImage, listSiteImages, siteImageAdmin } from '../lib/siteImages';
import { badRequest, handle } from './farmRouteHelpers';

// Homepage-Bilder (docs/landingpage.md): public for the homepage, generated
// and removed by the owner in Verwaltung.

const router: IRouter = Router();

router.get(
  '/site-images',
  handle(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(ListSiteImagesResponse.parse(await listSiteImages()));
  }),
);

router.get(
  '/admin/site-images',
  requireOwner,
  handle(async (_req, res) => {
    res.json(ListSiteImageSlotsResponse.parse(await siteImageAdmin()));
  }),
);

router.post(
  '/admin/site-images/:slot',
  requireOwner,
  handle(async (req, res) => {
    const body = GenerateSiteImageBody.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res);
    res.json(ListSiteImageSlotsResponse.parse(await generateSiteImage(String(req.params['slot']), body.data.extra ?? null)));
  }),
);

router.delete(
  '/admin/site-images/:slot',
  requireOwner,
  handle(async (req, res) => {
    res.json(ListSiteImageSlotsResponse.parse(await deleteSiteImage(String(req.params['slot']))));
  }),
);

export default router;
