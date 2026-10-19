import { Router, type IRouter } from 'express';
import {
  CreateMedicalRecordBody,
  CreateMedicalRecordResponse,
  CreateMedicineBody,
  CreateMedicineResponse,
  CreateWeightLogBody,
  CreateWeightLogResponse,
  GetFarmExportResponse,
  ListMedicalRecordsResponse,
  ListMedicinesResponse,
  ListWeightLogsResponse,
  UpdateMedicalRecordBody,
  UpdateMedicalRecordResponse,
  UpdateMedicineBody,
  UpdateMedicineResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import {
  createMedicalRecord,
  createWeightLog,
  deleteMedicalRecord,
  deleteWeightLog,
  farmExport,
  listMedicalRecords,
  listWeightLogs,
  updateMedicalRecord,
} from '../lib/farmHealth';
import { createMedicine, deleteMedicine, listMedicines, updateMedicine } from '../lib/medicines';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Health records, weights, the Arzneimittel-Vorrat and the veterinary office export. Reading: every
// member; writing: caretaker or admin.

const router: IRouter = Router();

// ── Health records ───────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/animals/:animalId/medical',
  requireFarm('guest'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    res.json(ListMedicalRecordsResponse.parse(await listMedicalRecords(req.farm!.farmId, animalId)));
  }),
);

router.post(
  '/farms/:farmId/animals/:animalId/medical',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = CreateMedicalRecordBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res
      .status(201)
      .json(CreateMedicalRecordResponse.parse(await createMedicalRecord(req.farm!.farmId, animalId, body.data)));
  }),
);

router.patch(
  '/farms/:farmId/medical/:recordId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const recordId = idParam(req, 'recordId');
    if (recordId === null) return notFound(res);
    const body = UpdateMedicalRecordBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateMedicalRecordResponse.parse(await updateMedicalRecord(req.farm!.farmId, recordId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/medical/:recordId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const recordId = idParam(req, 'recordId');
    if (recordId === null) return notFound(res);
    await deleteMedicalRecord(req.farm!.farmId, recordId);
    res.sendStatus(204);
  }),
);

// ── Weights ──────────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/animals/:animalId/weights',
  requireFarm('guest'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    res.json(ListWeightLogsResponse.parse(await listWeightLogs(req.farm!.farmId, animalId)));
  }),
);

router.post(
  '/farms/:farmId/animals/:animalId/weights',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const animalId = idParam(req, 'animalId');
    if (animalId === null) return notFound(res);
    const body = CreateWeightLogBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateWeightLogResponse.parse(await createWeightLog(req.farm!.farmId, animalId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/weights/:weightId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const weightId = idParam(req, 'weightId');
    if (weightId === null) return notFound(res);
    await deleteWeightLog(req.farm!.farmId, weightId);
    res.sendStatus(204);
  }),
);

// ── Export ───────────────────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/export',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(GetFarmExportResponse.parse(await farmExport(req.farm!.farmId)));
  }),
);

// ── Arzneimittel-Vorrat ──────────────────────────────────────────────────────

router.get(
  '/farms/:farmId/medicines',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListMedicinesResponse.parse(await listMedicines(req.farm!.farmId)));
  }),
);

router.post(
  '/farms/:farmId/medicines',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const body = CreateMedicineBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateMedicineResponse.parse(await createMedicine(req.farm!.farmId, body.data)));
  }),
);

router.put(
  '/farms/:farmId/medicines/:medicineId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'medicineId');
    if (id === null) return notFound(res);
    const body = UpdateMedicineBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateMedicineResponse.parse(await updateMedicine(req.farm!.farmId, id, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/medicines/:medicineId',
  requireFarm('caretaker'),
  handle(async (req, res) => {
    const id = idParam(req, 'medicineId');
    if (id === null) return notFound(res);
    await deleteMedicine(req.farm!.farmId, id);
    res.sendStatus(204);
  }),
);

export default router;
