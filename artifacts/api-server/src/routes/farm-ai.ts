import { Router, type IRouter, type Request, type Response } from 'express';
import {
  AnalyzeFeedBody,
  AnalyzeFeedResponse,
  GetHusbandryGuideParams,
  GetHelpfulPlantsParams,
  GetHelpfulPlantsResponse,
  GetHusbandryGuideResponse,
  ListFeedAnalysesResponse,
  SuggestFarmAnimalSpeciesBody,
  SuggestFarmAnimalSpeciesResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { FarmDataError } from '../lib/farmAnimals';
import {
  analyzeFeed,
  checkImage,
  deleteFeedAnalysis,
  helpfulPlantsFor,
  husbandryGuide,
  listFeedAnalyses,
  suggestSpecies,
} from '../lib/farmAi';
import { checkAndRecordScanAttempt, refundScanAttempt } from '../lib/scanRateLimit';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// AI features of "Meine Farm". Calls that send a photo to Gemini count
// against the same daily limit as the scans (own counter "farm", same app-wide
// budget). The cached Haltungs-Wiki and the archive lookup cost nothing.

const router: IRouter = Router();

/**
 * Records one AI attempt, or answers 429 and returns null. A failed AI call
 * gives its attempt back (like the plant scan).
 */
async function withAiQuota<T>(req: Request, res: Response, run: () => Promise<T>): Promise<T | null> {
  const user = req.user!;
  const limit = await checkAndRecordScanAttempt(user.id, 'farm', { unlimited: user.isOwner });
  if (!limit.allowed) {
    res.status(429).json({
      error:
        limit.reason === 'budget'
          ? 'Die KI ist für heute ausgelastet. Bitte versuche es morgen wieder.'
          : `Du hast heute schon ${limit.limit} KI-Anfragen für die Farm gestellt. Morgen geht es weiter.`,
      resetsAt: limit.resetsAt,
    });
    return null;
  }
  try {
    return await run();
  } catch (err) {
    await refundScanAttempt(limit.attemptId);
    if (err instanceof FarmDataError) throw err;
    req.log.error({ err }, 'Farm AI request failed');
    throw new FarmDataError(502, 'Die KI ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.');
  }
}

router.post(
  '/farms/:farmId/ai/species',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = SuggestFarmAnimalSpeciesBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    checkImage(body.data.imageData);
    const result = await withAiQuota(req, res, () => suggestSpecies(body.data.imageData));
    if (result) res.json(SuggestFarmAnimalSpeciesResponse.parse(result));
  }),
);

router.get(
  '/farms/:farmId/husbandry/:species',
  requireFarm('guest'),
  handle(async (req, res) => {
    const params = GetHusbandryGuideParams.safeParse(req.params);
    if (!params.success) return notFound(res);
    try {
      res.json(GetHusbandryGuideResponse.parse(await husbandryGuide(params.data.species)));
    } catch (err) {
      if (err instanceof FarmDataError) throw err;
      req.log.error({ err }, 'Husbandry guide failed');
      throw new FarmDataError(502, 'Das Haltungs-Wiki konnte gerade nicht erstellt werden.');
    }
  }),
);

router.get(
  '/farms/:farmId/helpful-plants/:species',
  requireFarm('guest'),
  handle(async (req, res) => {
    const params = GetHelpfulPlantsParams.safeParse(req.params);
    if (!params.success) return notFound(res);
    res.json(GetHelpfulPlantsResponse.parse(await helpfulPlantsFor(params.data.species)));
  }),
);

router.get(
  '/farms/:farmId/animals/:animalId/feed',
  requireFarm('guest'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    res.json(ListFeedAnalysesResponse.parse(await listFeedAnalyses(req.farm!.farmId, animalId)));
  }),
);

router.post(
  '/farms/:farmId/animals/:animalId/feed',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = AnalyzeFeedBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    checkImage(body.data.imageData);
    const result = await withAiQuota(req, res, () => analyzeFeed(req.farm!.farmId, animalId, body.data.imageData));
    if (result) res.status(201).json(AnalyzeFeedResponse.parse(result));
  }),
);

router.delete(
  '/farms/:farmId/feed/:logId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const logId = idParam(req, 'logId');
    if (logId === null) return notFound(res);
    await deleteFeedAnalysis(req.farm!.farmId, logId);
    res.sendStatus(204);
  }),
);

export default router;
