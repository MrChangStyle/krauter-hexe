/**
 * Moderation: reports on public content and what the owner does about them.
 *
 * Public content is what other accounts can see: the shared photo of an
 * archive entry (plant or insect) and usernames in the leaderboard. Reports
 * are grouped per content for the owner; acting on a group closes all of its
 * open reports at once.
 */

import {
  db,
  insectsTable,
  plantsTable,
  reportsTable,
  usersTable,
  type ReportContentType,
  type ReportReason,
} from '@workspace/db';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { deleteImageByUrl } from './imageStorage';

/** Reports one account may file per rolling 24 hours. */
export const DAILY_REPORT_LIMIT = 20;

export type ModerationAction = 'dismiss' | 'remove_image' | 'reset_username' | 'block_user';

export class ModerationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ModerationError';
  }
}

function numericId(contentId: string): number | null {
  return /^\d{1,9}$/.test(contentId) ? Number(contentId) : null;
}

/** Whether the reported thing is (still) there to be seen. */
async function contentIsVisible(type: ReportContentType, contentId: string): Promise<boolean> {
  if (type === 'username') {
    const [user] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, contentId));
    return !!user?.username;
  }
  const id = numericId(contentId);
  if (id === null) return false;
  const table = type === 'plant_image' ? plantsTable : insectsTable;
  const [row] = await db
    .select({
      hasImage: sql<boolean>`(${table.imageUrl} IS NOT NULL OR ${table.imageData} IS NOT NULL)`,
    })
    .from(table)
    .where(eq(table.id, id));
  return !!row?.hasImage;
}

/**
 * Files a report. Returns false when this account already has an open report
 * on the same content (nothing new is stored).
 */
export async function createReport(
  reporterId: string,
  input: { contentType: ReportContentType; contentId: string; reason: ReportReason; note?: string },
): Promise<boolean> {
  if (input.contentType === 'username' && input.contentId === reporterId) {
    throw new ModerationError(400, 'Du kannst deinen eigenen Namen nicht melden.');
  }
  if (!(await contentIsVisible(input.contentType, input.contentId))) {
    throw new ModerationError(404, 'Dieser Inhalt existiert nicht mehr.');
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(eq(reportsTable.userId, reporterId), gte(reportsTable.createdAt, since)));
  if ((recent?.count ?? 0) >= DAILY_REPORT_LIMIT) {
    throw new ModerationError(429, 'Du hast heute schon sehr viele Meldungen geschickt. Bitte versuche es morgen erneut.');
  }

  const note = input.note?.trim().slice(0, 500) || null;
  const inserted = await db
    .insert(reportsTable)
    .values({
      userId: reporterId,
      contentType: input.contentType,
      contentId: input.contentId,
      reason: input.reason,
      note,
    })
    // The partial unique index allows one OPEN report per account and content.
    .onConflictDoNothing()
    .returning({ id: reportsTable.id });
  return inserted.length > 0;
}

export interface ReportGroup {
  contentType: ReportContentType;
  contentId: string;
  reportCount: number;
  reasons: Array<{ reason: ReportReason; count: number }>;
  notes: string[];
  firstReportedAt: Date;
  exists: boolean;
  label: string;
  imageUrl: string | null;
}

/** Open reports, one entry per content, most reported first. */
export async function listOpenReports(): Promise<ReportGroup[]> {
  const rows = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.status, 'open'))
    .orderBy(reportsTable.createdAt);

  const groups = new Map<string, ReportGroup>();
  for (const row of rows) {
    const key = `${row.contentType}:${row.contentId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        contentType: row.contentType,
        contentId: row.contentId,
        reportCount: 0,
        reasons: [],
        notes: [],
        firstReportedAt: row.createdAt,
        exists: false,
        label: '',
        imageUrl: null,
      };
      groups.set(key, group);
    }
    group.reportCount += 1;
    const reason = group.reasons.find((r) => r.reason === row.reason);
    if (reason) reason.count += 1;
    else group.reasons.push({ reason: row.reason, count: 1 });
    if (row.note) group.notes.push(row.note);
  }

  const ids = (type: ReportContentType) =>
    [...groups.values()].filter((g) => g.contentType === type).map((g) => g.contentId);

  const plantIds = ids('plant_image').map(numericId).filter((id): id is number => id !== null);
  const insectIds = ids('insect_image').map(numericId).filter((id): id is number => id !== null);
  const userIds = ids('username');

  const plants = plantIds.length
    ? await db
        .select({
          id: plantsTable.id,
          name: plantsTable.germanName,
          imageUrl: plantsTable.imageUrl,
          hasData: sql<boolean>`${plantsTable.imageData} IS NOT NULL`,
        })
        .from(plantsTable)
        .where(inArray(plantsTable.id, plantIds))
    : [];
  const insects = insectIds.length
    ? await db
        .select({
          id: insectsTable.id,
          name: insectsTable.germanName,
          imageUrl: insectsTable.imageUrl,
          hasData: sql<boolean>`${insectsTable.imageData} IS NOT NULL`,
        })
        .from(insectsTable)
        .where(inArray(insectsTable.id, insectIds))
    : [];
  const users = userIds.length
    ? await db
        .select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];

  for (const group of groups.values()) {
    if (group.contentType === 'username') {
      const user = users.find((u) => u.id === group.contentId);
      group.exists = !!user?.username;
      group.label = user?.username ?? (user ? '(Name bereits entfernt)' : '(Konto gelöscht)');
      continue;
    }
    const isPlant = group.contentType === 'plant_image';
    const row = (isPlant ? plants : insects).find((r) => String(r.id) === group.contentId);
    group.exists = !!row && (!!row.imageUrl || row.hasData);
    group.label = row?.name ?? '(Eintrag gelöscht)';
    group.imageUrl =
      row?.imageUrl ??
      (row?.hasData ? `/api/${isPlant ? 'plants' : 'insects'}/${row.id}/image` : null);
  }

  return [...groups.values()].sort(
    (a, b) => b.reportCount - a.reportCount || a.firstReportedAt.getTime() - b.firstReportedAt.getTime(),
  );
}

const ACTIONS_BY_TYPE: Record<ReportContentType, ModerationAction[]> = {
  plant_image: ['dismiss', 'remove_image'],
  insect_image: ['dismiss', 'remove_image'],
  username: ['dismiss', 'reset_username', 'block_user'],
};

/**
 * Carries out the owner's decision and closes every open report of that
 * content. Returns how many reports were closed.
 */
export async function resolveReports(input: {
  contentType: ReportContentType;
  contentId: string;
  action: ModerationAction;
}): Promise<number> {
  const { contentType, contentId, action } = input;
  if (!ACTIONS_BY_TYPE[contentType].includes(action)) {
    throw new ModerationError(400, 'Diese Aktion passt nicht zu dieser Meldung.');
  }

  const removedUrls: Array<string | null> = [];

  const closed = await db.transaction(async (tx) => {
    if (action === 'remove_image') {
      const id = numericId(contentId);
      if (id !== null) {
        if (contentType === 'plant_image') {
          const [old] = await tx
            .select({ url: plantsTable.imageUrl, side: plantsTable.imageUrlSide })
            .from(plantsTable)
            .where(eq(plantsTable.id, id));
          // has_side_image stays: it records that the mushroom was verified
          // with two photos, which the edibility rule depends on.
          await tx
            .update(plantsTable)
            .set({
              imageUrl: null,
              imageUrlSide: null,
              imageData: null,
              imageDataSide: null,
              imageQuality: null,
              imageLocked: false,
            })
            .where(eq(plantsTable.id, id));
          if (old) removedUrls.push(old.url, old.side);
        } else {
          const [old] = await tx
            .select({ url: insectsTable.imageUrl })
            .from(insectsTable)
            .where(eq(insectsTable.id, id));
          await tx
            .update(insectsTable)
            .set({ imageUrl: null, imageData: null, imageQuality: null, imageLocked: false })
            .where(eq(insectsTable.id, id));
          if (old) removedUrls.push(old.url);
        }
      }
    }

    if (action === 'reset_username' || action === 'block_user') {
      const [target] = await tx
        .select({ isOwner: usersTable.isOwner })
        .from(usersTable)
        .where(eq(usersTable.id, contentId));
      if (target?.isOwner) {
        throw new ModerationError(400, 'Das Inhaber-Konto kann nicht gesperrt oder umbenannt werden.');
      }
      if (target) {
        await tx
          .update(usersTable)
          .set(
            action === 'block_user'
              ? { username: null, approved: false, blockedAt: new Date() }
              : { username: null },
          )
          .where(eq(usersTable.id, contentId));
      }
    }

    const done = await tx
      .update(reportsTable)
      .set({
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        resolution: action,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(reportsTable.status, 'open'),
          eq(reportsTable.contentType, contentType),
          eq(reportsTable.contentId, contentId),
        ),
      )
      .returning({ id: reportsTable.id });
    return done.length;
  });

  // Only after the database change is committed: removing the files first
  // would leave broken image links if the transaction rolled back.
  await Promise.all(removedUrls.map((url) => deleteImageByUrl(url).catch(() => false)));

  return closed;
}
