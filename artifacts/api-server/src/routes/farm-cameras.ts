import express, { Router, type IRouter, type Request } from 'express';
import {
  CreateCameraBody,
  CreateCameraResponse,
  ListCameraEventsResponse,
  ListCamerasResponse,
  RotateCameraSecretResponse,
  UpdateCameraBody,
  UpdateCameraResponse,
} from '@workspace/api-zod';

import { requireFarm } from '../middlewares/requireFarm';
import {
  CameraWebhookError,
  MAX_CAMERA_IMAGE_BYTES,
  cameraForSecret,
  createCamera,
  deleteCamera,
  handleCameraImage,
  listCameraEvents,
  listCameras,
  rotateCameraSecret,
  updateCamera,
} from '../lib/farmCameras';
import { badRequest, handle, idParam, notFound } from './farmRouteHelpers';

// Wildtier-Radar: camera management (admin), the event list (every member)
// and the webhook the cameras post their photos to (camera secret, no login).

const router: IRouter = Router();

router.get(
  '/farms/:farmId/cameras',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListCamerasResponse.parse(await listCameras(req.farm!.farmId, req.farm!.role === 'admin')));
  }),
);

router.post(
  '/farms/:farmId/cameras',
  requireFarm('admin'),
  handle(async (req, res) => {
    const body = CreateCameraBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.status(201).json(CreateCameraResponse.parse(await createCamera(req.farm!.farmId, body.data)));
  }),
);

router.patch(
  '/farms/:farmId/cameras/:cameraId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const cameraId = idParam(req, 'cameraId');
    if (cameraId === null) return notFound(res);
    const body = UpdateCameraBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(UpdateCameraResponse.parse(await updateCamera(req.farm!.farmId, cameraId, body.data)));
  }),
);

router.delete(
  '/farms/:farmId/cameras/:cameraId',
  requireFarm('admin'),
  handle(async (req, res) => {
    const cameraId = idParam(req, 'cameraId');
    if (cameraId === null) return notFound(res);
    await deleteCamera(req.farm!.farmId, cameraId);
    res.sendStatus(204);
  }),
);

router.post(
  '/farms/:farmId/cameras/:cameraId/secret',
  requireFarm('admin'),
  handle(async (req, res) => {
    const cameraId = idParam(req, 'cameraId');
    if (cameraId === null) return notFound(res);
    res.json(RotateCameraSecretResponse.parse(await rotateCameraSecret(req.farm!.farmId, cameraId)));
  }),
);

router.get(
  '/farms/:farmId/camera-events',
  requireFarm('guest'),
  handle(async (req, res) => {
    res.json(ListCameraEventsResponse.parse(await listCameraEvents(req.farm!.farmId)));
  }),
);

// ── Webhook ──────────────────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The photo, either as the raw request body (Content-Type image/jpeg, png or
 * webp – what most cameras send) or as JSON { "image": "<data URL or base64>" }.
 */
export function cameraImage(req: Request): { mimeType: string; data: string } | null {
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (IMAGE_TYPES.includes(type) && Buffer.isBuffer(req.body)) {
    if (req.body.length === 0 || req.body.length > MAX_CAMERA_IMAGE_BYTES) return null;
    return { mimeType: type, data: req.body.toString('base64') };
  }
  const raw = (req.body as { image?: unknown } | undefined)?.image;
  if (typeof raw !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  const mimeType = match ? match[1]! : 'image/jpeg';
  const data = match ? match[2]! : raw;
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes === 0 || bytes > MAX_CAMERA_IMAGE_BYTES) return null;
  return { mimeType, data };
}

router.post(
  '/webhooks/camera',
  express.raw({ type: IMAGE_TYPES, limit: MAX_CAMERA_IMAGE_BYTES }),
  async (req, res) => {
    const auth = req.headers['authorization'] ?? '';
    const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    // No valid secret: nothing else happens – no AI request, no upload.
    const camera = secret ? await cameraForSecret(secret) : null;
    if (!camera) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const image = cameraImage(req);
    if (!image) {
      res.status(400).json({ error: 'Expected a JPEG, PNG or WebP photo of at most 5 MB' });
      return;
    }
    try {
      res.json(await handleCameraImage(camera, image));
    } catch (err) {
      if (err instanceof CameraWebhookError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, 'Camera webhook failed');
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

export default router;
