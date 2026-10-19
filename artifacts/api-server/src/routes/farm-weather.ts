import { Router, type IRouter } from 'express';
import { GetFarmWeatherResponse, SetFarmLocationBody, SetFarmLocationResponse } from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { farmWeather, setFarmLocation } from '../lib/farmWeather';
import { badRequest, handle } from './farmRouteHelpers';

// Wetter für den Hof: forecast and warnings (every member), the location (admin).

const router: IRouter = Router();

router.get(
  '/farms/:farmId/weather',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetFarmWeatherResponse.parse(await farmWeather(req.farm!.farmId)));
  }),
);

router.put(
  '/farms/:farmId/location',
  requireFarm('admin'),
  handle(async (req, res) => {
    const body = SetFarmLocationBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    await setFarmLocation(req.farm!.farmId, body.data);
    res.json(SetFarmLocationResponse.parse(await farmWeather(req.farm!.farmId)));
  }),
);

export default router;
