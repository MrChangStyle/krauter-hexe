import { Router, type IRouter } from 'express';
import {
  CreateFarmContactBody,
  CreateFarmContactResponse,
  DeleteFarmContactResponse,
  ListFarmContactsResponse,
  UpdateFarmContactBody,
  UpdateFarmContactResponse,
} from '@workspace/api-zod';

import { createContact, deleteContact, listContacts, updateContact } from '../lib/farmContacts';
import { requireFarm } from '../middlewares/requireFarm';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Farm & Team – Wichtige Kontakte. Reading: every member; writing: admins.

const router: IRouter = Router();

router.get(
  '/farms/:farmId/contacts',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListFarmContactsResponse.parse(await listContacts(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/contacts',
  requireFarm('admin'),
  handle(async (req, res) => {
    const body = CreateFarmContactBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateFarmContactResponse.parse(await createContact(req.farm!.farmId, body.data)));
  }),
);

router.put(
  '/farms/:farmId/contacts/:contactId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const id = idParam(req, 'contactId');
    if (id === null) return notFound(res);
    const body = UpdateFarmContactBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateFarmContactResponse.parse(await updateContact(req.farm!.farmId, id, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/contacts/:contactId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const id = idParam(req, 'contactId');
    if (id === null) return notFound(res);
    res.json(DeleteFarmContactResponse.parse(await deleteContact(req.farm!.farmId, id)));
  }),
);

export default router;
