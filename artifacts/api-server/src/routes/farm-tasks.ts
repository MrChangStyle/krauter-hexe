import { Router, type IRouter } from 'express';
import {
  CompleteFarmTaskBody,
  CompleteFarmTaskResponse,
  CreateFarmTaskBody,
  CreateFarmTaskResponse,
  ListFarmTasksResponse,
  UpdateFarmTaskBody,
  UpdateFarmTaskResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import { completeFarmTask, createFarmTask, deleteFarmTask, listFarmTasks, updateFarmTask } from '../lib/farmTasks';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Stall tasks of a farm. Reading: every member; writing and ticking off:
// caretaker or admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/tasks',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmTasksResponse.parse(await listFarmTasks(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/tasks',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateFarmTaskBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateFarmTaskResponse.parse(await createFarmTask(req.farm!.farmId, body.data)));
  }),
);

router.patch(
  '/farms/:farmId/tasks/:taskId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    if (taskId === null) return notFound(res);
    const body = UpdateFarmTaskBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateFarmTaskResponse.parse(await updateFarmTask(req.farm!.farmId, taskId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/tasks/:taskId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    if (taskId === null) return notFound(res);
    await deleteFarmTask(req.farm!.farmId, taskId);
    res.sendStatus(204);
  }),
);

router.post(
  '/farms/:farmId/tasks/:taskId/complete',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    if (taskId === null) return notFound(res);
    const body = CompleteFarmTaskBody.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res);
    res.json(CompleteFarmTaskResponse.parse(await completeFarmTask(req.farm!.farmId, taskId, body.data.doneAt ?? undefined)));
  }),
);

export default router;
