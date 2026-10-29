/**
 * Wildtier-Radar ("Meine Farm", step 6): cameras of a farm, the webhook a
 * camera posts its photos to, the AI predator check, the relay and the push.
 *
 * Not real time: on the free hosting plan the service sleeps and needs up to
 * a minute to wake up – an alarm can arrive that late (docs/meine-farm-app.md).
 *
 * A camera authenticates with its own secret (shown once). Only the sha256 of
 * it is stored; without a valid secret nothing else runs – no AI request, no
 * upload. The relay URL is called from the server, so it must point to the
 * public internet (no private, loopback or link-local addresses).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  cameraEventsTable,
  camerasTable,
  db,
  farmMembershipsTable,
  farmsTable,
} from '@workspace/db';
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { deleteFarmPhotos } from './farmMembers';
import { berlinDay } from './monitoring';
import { grantedSql } from './farmModules';
import { deleteImageByUrl, uploadImage } from './imageStorage';
import { MODELS, runModelChain } from './plantIdentification';
import { sendPushToUser } from './webPush';

/** A predator alarm needs at least this confidence. */
export const ALARM_CONFIDENCE = 0.7;
export const RELAY_TIMEOUT_MS = 5_000;
export const MAX_CAMERA_IMAGE_BYTES = 5 * 1024 * 1024;
/** Photos closer together are refused (no AI request) – a camera in a loop costs nothing. */
export const MIN_SECONDS_BETWEEN_IMAGES = 10;
export const MAX_IMAGES_PER_CAMERA_PER_DAY = 300;
/**
 * AI checks per farm and day across all its cameras (Richtwert, docs/kostenschutz.md):
 * ten cameras at their own limit would otherwise mean 3,000 paid requests a day.
 */
export const MAX_IMAGES_PER_FARM_PER_DAY = 600;
/** Older events (and their photos) are removed. */
export const KEEP_EVENTS_PER_CAMERA = 100;
export const MAX_CAMERAS_PER_FARM = 10;

// ── Secrets ──────────────────────────────────────────────────────────────────

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function newSecret(): string {
  return `lfcam_${randomBytes(24).toString('base64url')}`;
}

// ── Relay URL ────────────────────────────────────────────────────────────────

/** True for addresses the server must never call: private, loopback, link-local, … */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') ||
    v6.startsWith('ff')
  );
}

/** Checks a relay URL when it is saved; null clears it. */
export function validRelayUrl(raw: unknown): string | null {
  const value = text(raw, 500, 'Die Relais-Adresse');
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FarmDataError(400, 'Die Relais-Adresse ist keine gültige URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new FarmDataError(400, 'Die Relais-Adresse muss mit https:// oder http:// beginnen.');
  }
  if (url.username || url.password) {
    throw new FarmDataError(400, 'Bitte keine Zugangsdaten vor dem Hostnamen (user:pass@) angeben.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && isPrivateAddress(host))) {
    throw new FarmDataError(
      400,
      'Die Relais-Adresse muss aus dem Internet erreichbar sein (keine Adresse aus dem Heimnetz).',
    );
  }
  return url.toString();
}

/**
 * Calls the relay (GET, 5 s timeout, no redirects). Resolves the name first
 * and refuses private addresses, so a public name cannot point into the
 * server's own network.
 */
export async function callRelay(relayUrl: string): Promise<boolean> {
  try {
    const url = new URL(relayUrl);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) return false;
    const res = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

// ── Cameras ──────────────────────────────────────────────────────────────────

export interface CameraInput {
  name: unknown;
  relayUrl?: unknown;
  cooldownSeconds: number;
}

function cameraValues(input: CameraInput) {
  if (!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds < 30 || input.cooldownSeconds > 86_400) {
    throw new FarmDataError(400, 'Die Pause zwischen zwei Alarmen muss zwischen 30 Sekunden und 24 Stunden liegen.');
  }
  return {
    name: text(input.name, 60, 'Der Name', true),
    relayUrl: validRelayUrl(input.relayUrl),
    cooldownSeconds: input.cooldownSeconds,
  };
}

const lastEventAt = sql<Date | null>`(
  SELECT max(${cameraEventsTable.createdAt}) FROM ${cameraEventsTable}
  WHERE ${cameraEventsTable.cameraId} = ${camerasTable.id}
)`;

/**
 * Cameras of a farm. The relay URL can carry an access key (e.g. a cloud
 * relay's auth key), so only admins see it; others learn whether one is set.
 */
export async function listCameras(farmId: number, isAdmin: boolean) {
  const rows = await db
    .select({
      id: camerasTable.id,
      name: camerasTable.name,
      relayUrl: camerasTable.relayUrl,
      cooldownSeconds: camerasTable.cooldownSeconds,
      lastTriggeredAt: camerasTable.lastTriggeredAt,
      createdAt: camerasTable.createdAt,
      lastEventAt,
    })
    .from(camerasTable)
    .where(eq(camerasTable.farmId, farmId))
    .orderBy(camerasTable.name, camerasTable.id);
  return rows.map((r) => ({
    ...r,
    lastEventAt: r.lastEventAt ? new Date(r.lastEventAt) : null,
    hasRelay: r.relayUrl !== null,
    relayUrl: isAdmin ? r.relayUrl : null,
  }));
}

async function getCamera(farmId: number, cameraId: number) {
  const camera = (await listCameras(farmId, true)).find((c) => c.id === cameraId);
  if (!camera) throw notFound();
  return camera;
}

/** Returns the camera and its secret – the only time the secret is shown. */
export async function createCamera(farmId: number, input: CameraInput) {
  const values = cameraValues(input);
  const [{ n }] = (await db
    .select({ n: count() })
    .from(camerasTable)
    .where(eq(camerasTable.farmId, farmId))) as [{ n: number }];
  if (n >= MAX_CAMERAS_PER_FARM) {
    throw new FarmDataError(400, `Eine Farm kann höchstens ${MAX_CAMERAS_PER_FARM} Kameras haben.`);
  }
  const secret = newSecret();
  const [row] = await db
    .insert(camerasTable)
    .values({ farmId, ...values, secretHash: hashSecret(secret) })
    .returning({ id: camerasTable.id });
  return { camera: await getCamera(farmId, row!.id), secret };
}

export async function updateCamera(farmId: number, cameraId: number, input: CameraInput) {
  const updated = await db
    .update(camerasTable)
    .set(cameraValues(input))
    .where(and(eq(camerasTable.id, cameraId), eq(camerasTable.farmId, farmId)))
    .returning({ id: camerasTable.id });
  if (updated.length === 0) throw notFound();
  return getCamera(farmId, cameraId);
}

/** A new secret; the old one stops working at once. */
export async function rotateCameraSecret(farmId: number, cameraId: number) {
  const secret = newSecret();
  const updated = await db
    .update(camerasTable)
    .set({ secretHash: hashSecret(secret) })
    .where(and(eq(camerasTable.id, cameraId), eq(camerasTable.farmId, farmId)))
    .returning({ id: camerasTable.id });
  if (updated.length === 0) throw notFound();
  return { camera: await getCamera(farmId, cameraId), secret };
}

export async function deleteCamera(farmId: number, cameraId: number): Promise<void> {
  const photos = await db
    .select({ url: cameraEventsTable.imageUrl })
    .from(cameraEventsTable)
    .where(and(eq(cameraEventsTable.cameraId, cameraId), eq(cameraEventsTable.farmId, farmId)));
  const deleted = await db
    .delete(camerasTable)
    .where(and(eq(camerasTable.id, cameraId), eq(camerasTable.farmId, farmId)))
    .returning({ id: camerasTable.id });
  if (deleted.length === 0) throw notFound();
  deleteFarmPhotos(photos.map((p) => p.url).filter((u): u is string => !!u));
}

export async function listCameraEvents(farmId: number) {
  return db
    .select({
      id: cameraEventsTable.id,
      cameraId: cameraEventsTable.cameraId,
      cameraName: camerasTable.name,
      imageUrl: cameraEventsTable.imageUrl,
      predatorDetected: cameraEventsTable.predatorDetected,
      species: cameraEventsTable.species,
      confidence: cameraEventsTable.confidence,
      relayTriggered: cameraEventsTable.relayTriggered,
      createdAt: cameraEventsTable.createdAt,
    })
    .from(cameraEventsTable)
    .innerJoin(
      camerasTable,
      and(eq(camerasTable.id, cameraEventsTable.cameraId), eq(camerasTable.farmId, cameraEventsTable.farmId)),
    )
    .where(eq(cameraEventsTable.farmId, farmId))
    .orderBy(desc(cameraEventsTable.createdAt), desc(cameraEventsTable.id))
    .limit(50);
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export class CameraWebhookError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CameraWebhookError';
  }
}

export interface PredatorCheck {
  predatorDetected: boolean;
  species: string | null;
  confidence: number;
}

export function coercePredatorCheck(parsed: Record<string, unknown>): PredatorCheck {
  const raw = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : Number(parsed['confidence']);
  const confidence = Number.isFinite(raw) ? Math.min(1, Math.max(0, Math.round(raw * 100) / 100)) : 0;
  const species = typeof parsed['species'] === 'string' && parsed['species'].trim() ? parsed['species'].trim().slice(0, 60) : null;
  return { predatorDetected: parsed['predatorDetected'] === true, species, confidence };
}

const PREDATOR_PROMPT = `Das Foto stammt von einer Wildkamera an einem Stall oder Gehege in Deutschland (Hühner, Kaninchen, Ziegen o. ä.).
Ist darauf ein Beutegreifer zu sehen, der den Tieren gefährlich werden kann – z. B. Fuchs, Marder, Iltis, Waschbär, Dachs, Wolf, Habicht oder anderer Greifvogel, Ratte, streunender Hund oder Katze?
Antworte nur mit einem JSON-Objekt:
{ "predatorDetected": boolean, "species": "deutscher Name des Tieres oder null", "confidence": Zahl 0 bis 1 }
Eigene Hof- und Nutztiere, Menschen, Fahrzeuge und leere Bilder sind KEIN Beutegreifer.`;

async function checkForPredator(image: { mimeType: string; data: string }): Promise<PredatorCheck> {
  const parsed = (await runModelChain(
    [{ role: 'user', parts: [{ text: PREDATOR_PROMPT }, { inlineData: image }] }],
    MODELS,
    { maxOutputTokens: 256, responseMimeType: 'application/json' },
  )) as Record<string, unknown>;
  return coercePredatorCheck(parsed ?? {});
}

/** Finds the camera for a secret; the stored hash is compared in constant time. */
export async function cameraForSecret(secret: string) {
  const hash = hashSecret(secret);
  const [camera] = await db.select().from(camerasTable).where(eq(camerasTable.secretHash, hash));
  if (!camera) return null;
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(camera.secretHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? camera : null;
}

export interface WebhookResult {
  eventId: number;
  predatorDetected: boolean;
  species: string | null;
  confidence: number;
  alarm: boolean;
  relayTriggered: boolean;
}

/**
 * One photo from an authenticated camera: throttle, ask the AI, store the
 * event (photo in Cloudinary), and on a confident predator outside the
 * cooldown call the relay and push to every member of the farm.
 */
export async function handleCameraImage(
  camera: NonNullable<Awaited<ReturnType<typeof cameraForSecret>>>,
  image: { mimeType: string; data: string },
): Promise<WebhookResult> {
  const [last] = await db
    .select({ createdAt: cameraEventsTable.createdAt })
    .from(cameraEventsTable)
    .where(eq(cameraEventsTable.cameraId, camera.id))
    .orderBy(desc(cameraEventsTable.createdAt))
    .limit(1);
  if (last && Date.now() - last.createdAt.getTime() < MIN_SECONDS_BETWEEN_IMAGES * 1000) {
    throw new CameraWebhookError(429, `At most one photo every ${MIN_SECONDS_BETWEEN_IMAGES} seconds`);
  }
  // Daily limits per camera and per farm. Counted on the camera row – the
  // events keep only the newest KEEP_EVENTS_PER_CAMERA photos, so counting
  // them could never reach the limit. The claim is one atomic UPDATE.
  const day = berlinDay();
  const [{ n: farmToday }] = (await db
    .select({ n: sql<number>`coalesce(sum(${camerasTable.aiCount}), 0)::int` })
    .from(camerasTable)
    .where(and(eq(camerasTable.farmId, camera.farmId), eq(camerasTable.aiDay, day)))) as [{ n: number }];
  if (farmToday >= MAX_IMAGES_PER_FARM_PER_DAY) {
    throw new CameraWebhookError(429, 'Daily photo limit of this farm reached');
  }
  const [claimed] = await db
    .update(camerasTable)
    .set({
      aiCount: sql`CASE WHEN ${camerasTable.aiDay} = ${day} THEN ${camerasTable.aiCount} + 1 ELSE 1 END`,
      aiDay: day,
    })
    .where(
      and(
        eq(camerasTable.id, camera.id),
        or(isNull(camerasTable.aiDay), ne(camerasTable.aiDay, day), lt(camerasTable.aiCount, MAX_IMAGES_PER_CAMERA_PER_DAY)),
      ),
    )
    .returning({ id: camerasTable.id });
  if (!claimed) {
    throw new CameraWebhookError(429, 'Daily photo limit of this camera reached');
  }

  let check: PredatorCheck;
  try {
    check = await checkForPredator(image);
  } catch {
    throw new CameraWebhookError(502, 'AI check failed');
  }

  const imageUrl = await uploadImage(`data:${image.mimeType};base64,${image.data}`).catch(() => null);

  // Claim the alarm atomically: only one request per cooldown wins.
  let alarm = false;
  if (check.predatorDetected && check.confidence >= ALARM_CONFIDENCE) {
    const claimed = await db
      .update(camerasTable)
      .set({ lastTriggeredAt: new Date() })
      .where(
        and(
          eq(camerasTable.id, camera.id),
          or(
            isNull(camerasTable.lastTriggeredAt),
            lte(camerasTable.lastTriggeredAt, sql`now() - make_interval(secs => ${camerasTable.cooldownSeconds})`),
          ),
        ),
      )
      .returning({ id: camerasTable.id });
    alarm = claimed.length > 0;
  }

  const relayTriggered = alarm && camera.relayUrl ? await callRelay(camera.relayUrl) : false;

  const [event] = await db
    .insert(cameraEventsTable)
    .values({
      farmId: camera.farmId,
      cameraId: camera.id,
      imageUrl,
      predatorDetected: check.predatorDetected,
      species: check.species,
      confidence: check.confidence,
      relayTriggered,
    })
    .returning({ id: cameraEventsTable.id });

  if (alarm) await pushAlarm(camera.farmId, camera.name, check);
  await pruneEvents(camera.id);

  return { eventId: event!.id, ...check, alarm, relayTriggered };
}

async function pushAlarm(farmId: number, cameraName: string, check: PredatorCheck): Promise<void> {
  const [farm] = await db.select({ name: farmsTable.name }).from(farmsTable).where(eq(farmsTable.id, farmId));
  const members = await db
    .select({ userId: farmMembershipsTable.userId })
    .from(farmMembershipsTable)
    .where(and(eq(farmMembershipsTable.farmId, farmId), grantedSql('wildlife')));
  for (const { userId } of members) {
    await sendPushToUser(userId, { topic: 'wildlife',
      title: `Wildtier-Alarm: ${check.species ?? 'Beutegreifer'}`,
      body: `Kamera „${cameraName}“ (${farm?.name ?? 'Farm'}), ${Math.round(check.confidence * 100)} % sicher`,
      tag: `camera-${farmId}`,
      url: '/farm/kameras',
    });
  }
}

/** Keeps the newest events of a camera; older ones go with their photos. */
async function pruneEvents(cameraId: number): Promise<void> {
  const old = await db
    .select({ id: cameraEventsTable.id, imageUrl: cameraEventsTable.imageUrl })
    .from(cameraEventsTable)
    .where(eq(cameraEventsTable.cameraId, cameraId))
    .orderBy(desc(cameraEventsTable.createdAt), desc(cameraEventsTable.id))
    .offset(KEEP_EVENTS_PER_CAMERA);
  if (old.length === 0) return;
  await db.delete(cameraEventsTable).where(inArray(cameraEventsTable.id, old.map((e) => e.id)));
  for (const e of old) void deleteImageByUrl(e.imageUrl).catch(() => false);
}
