import { Router, type IRouter } from 'express';
import {
  AddNoteShareBody,
  AddNoteShareResponse,
  ClearDoneNotesResponse,
  CreateNoteBody,
  CreateNoteResponse,
  ListNoteSharesResponse,
  ListNotesResponse,
  PlanNotesBody,
  PlanNotesResponse,
  RemoveNoteShareResponse,
  UpdateNoteBody,
  UpdateNoteResponse,
} from '@workspace/api-zod';

import { requireApproved } from '../middlewares/requireApproved';
import { addShare, clearDoneNotes, createNote, deleteNote, listNotes, listShares, planNotes, removeShare, updateNote } from '../lib/dailyNotes';
import { badRequest, handle, idParam, notFound, withAiQuota } from './farmRouteHelpers';

// Alltagsnotizen (docs/alltagsnotizen.md): the own list and the lists shared
// with one. The owner deletes; who it is shared with ticks off and adds.

const router: IRouter = Router();

router.get(
  '/notes',
  requireApproved,
  handle(async (req, res) => {
    res.json(ListNotesResponse.parse(await listNotes(req.user!.id)));
  }),
);

router.post(
  '/notes',
  requireApproved,
  handle(async (req, res) => {
    const body = CreateNoteBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateNoteResponse.parse(await createNote(req.user!.id, body.data)));
  }),
);

// Free speech → notes, nothing saved; counts against the daily AI limit.
router.post(
  '/notes/plan',
  requireApproved,
  handle(async (req, res) => {
    const body = PlanNotesBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const notes = await withAiQuota(req, res, 'farm', () => planNotes(body.data.text));
    if (notes) res.json(PlanNotesResponse.parse({ notes }));
  }),
);

router.post(
  '/notes/clear-done',
  requireApproved,
  handle(async (req, res) => {
    res.json(ClearDoneNotesResponse.parse({ removed: await clearDoneNotes(req.user!.id) }));
  }),
);

router.get(
  '/notes/shares',
  requireApproved,
  handle(async (req, res) => {
    res.json(ListNoteSharesResponse.parse(await listShares(req.user!.id)));
  }),
);

router.post(
  '/notes/shares',
  requireApproved,
  handle(async (req, res) => {
    const body = AddNoteShareBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(AddNoteShareResponse.parse(await addShare(req.user!.id, body.data)));
  }),
);

router.delete(
  '/notes/shares/:userId',
  requireApproved,
  handle(async (req, res) => {
    const other = req.params['userId'];
    if (typeof other !== 'string' || !other || other.length > 200) return notFound(res);
    res.json(RemoveNoteShareResponse.parse(await removeShare(req.user!.id, other)));
  }),
);

router.patch(
  '/notes/:noteId',
  requireApproved,
  handle(async (req, res) => {
    const noteId = idParam(req, 'noteId');
    if (noteId === null) return notFound(res);
    const body = UpdateNoteBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateNoteResponse.parse(await updateNote(req.user!.id, noteId, body.data)));
  }),
);

router.delete(
  '/notes/:noteId',
  requireApproved,
  handle(async (req, res) => {
    const noteId = idParam(req, 'noteId');
    if (noteId === null) return notFound(res);
    await deleteNote(req.user!.id, noteId);
    res.sendStatus(204);
  }),
);

export default router;
