import { Router, type IRouter } from 'express';
import {
  AddFarmTaskCommentBody,
  AddFarmTaskCommentResponse,
  CompleteFarmTaskBody,
  CompleteFarmTaskResponse,
  DeleteFarmTaskCommentResponse,
  PlanFarmTasksBody,
  PlanFarmTasksResponse,
  UncompleteFarmTaskResponse,
  CreateFarmTaskBody,
  CreateFarmTaskResponse,
  ListFarmTasksResponse,
  UpdateFarmTaskBody,
  UpdateFarmTaskResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import {
  addFarmTaskComment,
  completeFarmTask,
  createFarmTask,
  deleteFarmTask,
  deleteFarmTaskComment,
  listFarmTasks,
  uncompleteFarmTask,
  updateFarmTask,
} from '../lib/farmTasks';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';
import { planTasks } from '../lib/hofTaskPlanner';
import { berlinTodayKey } from '../lib/pushScheduler';

// Stall and Hof tasks of a farm (docs/hof-aufgaben.md). Reading: every member;
// writing, ticking off and commenting: caretaker or admin.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/tasks',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmTasksResponse.parse(await listFarmTasks(req.farm!.farmId, req.farm!.userId)));
  }),
);

router.post(
  '/farms/:farmId/tasks',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateFarmTaskBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateFarmTaskResponse.parse(await createFarmTask(req.farm!.farmId, body.data, req.farm!.userId)));
  }),
);

// KI-Aufgabenplan: free text → proposed tasks, nothing saved (docs/hof-aufgaben.md).
// Counts against the farm's daily AI limit.
router.post(
  '/farms/:farmId/tasks/plan',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = PlanFarmTasksBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const defaults = { assigneeId: body.data.assigneeId ?? null, repeats: body.data.repeats ?? false };
    const tasks = await withAiQuota(req, res, 'farm', () => planTasks(req.farm!.farmId, body.data.text, berlinTodayKey(), defaults));
    if (tasks) res.json(PlanFarmTasksResponse.parse({ tasks }));
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
    res.json(UpdateFarmTaskResponse.parse(await updateFarmTask(req.farm!.farmId, taskId, body.data, req.farm!.userId)));
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
    res.json(CompleteFarmTaskResponse.parse(await completeFarmTask(req.farm!.farmId, taskId, body.data.doneAt ?? undefined, new Date(), req.farm!.userId)));
  }),
);

router.post(
  '/farms/:farmId/tasks/:taskId/uncomplete',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    if (taskId === null) return notFound(res);
    res.json(UncompleteFarmTaskResponse.parse(await uncompleteFarmTask(req.farm!.farmId, taskId, req.farm!.userId)));
  }),
);

router.post(
  '/farms/:farmId/tasks/:taskId/comments',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    if (taskId === null) return notFound(res);
    const body = AddFarmTaskCommentBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(AddFarmTaskCommentResponse.parse(await addFarmTaskComment(req.farm!.farmId, taskId, req.farm!.userId, body.data.body)));
  }),
);

router.delete(
  '/farms/:farmId/tasks/:taskId/comments/:commentId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const taskId = idParam(req, 'taskId');
    const commentId = idParam(req, 'commentId');
    if (taskId === null || commentId === null) return notFound(res);
    const task = await deleteFarmTaskComment(req.farm!.farmId, taskId, commentId, req.farm!.userId, req.farm!.role === 'admin');
    res.json(DeleteFarmTaskCommentResponse.parse(task));
  }),
);

export default router;
