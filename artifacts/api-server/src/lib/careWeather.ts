/**
 * Wetterabhängige Pflege (docs/pflege-wetter.md) for the plant care plan:
 *
 * - Winter (November to February), unless the account switched it off:
 *   watering intervals are half as long again, fertilising pauses.
 * - Rain: an outdoor watering task that is due on a day with at least 5 l/m²
 *   counts as done by the rain – no push.
 * - Frost: whoever has plants outside gets "Frost in Sicht" once, then not
 *   again for 45 days.
 *
 * The weather is the one of the account's farm (its location or a bed's).
 */

import { db, farmMembershipsTable, tasksTable, userSettingsTable } from '@workspace/db';
import { and, asc, eq, sql } from 'drizzle-orm';

import { farmLocation, forecast, type DayForecast } from './farmWeather';
import { addDays } from './feedSeason';
import { logger } from './logger';
import { berlinDayKey, unitToDays } from './pushScheduler';

export const RAIN_MM = 5;
export const FROST_DAYS = 3;
const FROST_PAUSE_DAYS = 45;

type CareTask = {
  actionType: string;
  intervalValue: number;
  intervalUnit: 'Tage' | 'Wochen' | 'Monate';
  lastCompletedAt: Date | null;
  createdAt: Date;
  outdoor: boolean;
  rainSkippedOn: string | null;
};

export function isWinter(day: string): boolean {
  const month = Number(day.slice(5, 7));
  return month >= 11 || month <= 2;
}

/** First day of March after a winter day – the end of the fertilising pause. */
function springAfter(day: string): string {
  const year = Number(day.slice(0, 4)) + (Number(day.slice(5, 7)) >= 11 ? 1 : 0);
  return `${year}-03-01`;
}

/** Days between two reminders – longer for watering in winter. */
export function careIntervalDays(task: Pick<CareTask, 'actionType' | 'intervalValue' | 'intervalUnit'>, day: string, seasonal: boolean): number {
  const days = task.intervalValue * unitToDays(task.intervalUnit);
  return seasonal && isWinter(day) && task.actionType === 'Gießen' ? Math.ceil(days * 1.5) : days;
}

/**
 * The day the task is next due, seen from `today`. Fertilising in winter
 * waits until March (when seasonal care is on).
 */
export function careNextDue(task: CareTask, today: string, seasonal: boolean): string {
  const ref = berlinDayKey(task.lastCompletedAt ?? task.createdAt);
  const due = addDays(ref, careIntervalDays(task, today, seasonal));
  if (seasonal && task.actionType === 'Düngen' && isWinter(today) && due <= addDays(springAfter(today), -1)) {
    return springAfter(today);
  }
  return due;
}

export function careDue(task: CareTask, today: string, seasonal: boolean): boolean {
  return careNextDue(task, today, seasonal) <= today;
}

/** A short line for the task card, or null. */
export function careNote(task: CareTask, today: string, seasonal: boolean): string | null {
  if (task.rainSkippedOn === today) return 'Heute hat der Regen gegossen.';
  if (seasonal && isWinter(today)) {
    if (task.actionType === 'Düngen') return 'Winterpause: im Winter wird nicht gedüngt, weiter ab März.';
    if (task.actionType === 'Gießen') return `Winter: seltener gießen, alle ${careIntervalDays(task, today, true)} Tage.`;
  }
  return null;
}

export function rainWaters(task: Pick<CareTask, 'actionType' | 'outdoor'>, todayWeather: DayForecast | null): boolean {
  return task.outdoor && task.actionType === 'Gießen' && todayWeather !== null && todayWeather.precipitationMm >= RAIN_MM;
}

/** The coldest night in the next days when it freezes, else null. */
export function frostAhead(days: DayForecast[]): DayForecast | null {
  const cold = days.slice(0, FROST_DAYS).filter((d) => d.minTemp <= 0);
  return cold.length === 0 ? null : cold.reduce((a, b) => (b.minTemp < a.minTemp ? b : a));
}

/** A task as the app gets it: next due day and the note, with the weather rules. */
export function withCare<T extends CareTask>(task: T, today: string, seasonal: boolean) {
  return { ...task, nextDueDate: careNextDue(task, today, seasonal), careNote: careNote(task, today, seasonal) };
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function seasonalCareOn(userId: string): Promise<boolean> {
  const [row] = await db.select({ on: userSettingsTable.seasonalCare }).from(userSettingsTable).where(eq(userSettingsTable.userId, userId));
  return row?.on ?? true;
}

/** Where the account's plants are: the first of its farms (admin first) that has a location. */
export async function careLocation(userId: string) {
  const farms = await db
    .select({ farmId: farmMembershipsTable.farmId })
    .from(farmMembershipsTable)
    .where(eq(farmMembershipsTable.userId, userId))
    .orderBy(sql`${farmMembershipsTable.role} = 'admin' DESC`, asc(farmMembershipsTable.farmId));
  for (const { farmId } of farms) {
    const place = await farmLocation(farmId).catch(() => null);
    if (place) return place;
  }
  return null;
}

/** The account's weather for the next days; empty without a location or service. */
export async function careForecast(userId: string, today: string): Promise<DayForecast[]> {
  const place = await careLocation(userId);
  return place ? forecast(place.latitude, place.longitude, today) : [];
}

/**
 * "Frost in Sicht" to every account with active outdoor tasks, at most once
 * in 45 days. Claims the day before sending, so parallel cron calls send
 * once. Never throws.
 */
export async function sendFrostNotices(
  day: string,
  send: (userId: string, payload: { topic: 'plant-care'; title: string; body: string; tag: string; url: string }) => Promise<unknown>,
): Promise<number> {
  let sent = 0;
  try {
    const owners = await db
      .selectDistinct({ userId: tasksTable.userId })
      .from(tasksTable)
      .where(and(eq(tasksTable.isActive, true), eq(tasksTable.outdoor, true)));
    for (const { userId } of owners) {
      try {
        const [settings] = await db.select({ last: userSettingsTable.frostNoticeOn }).from(userSettingsTable).where(eq(userSettingsTable.userId, userId));
        if (settings?.last && settings.last > addDays(day, -FROST_PAUSE_DAYS)) continue;
        const frost = frostAhead(await careForecast(userId, day));
        if (!frost) continue;
        const claimed = await db
          .insert(userSettingsTable)
          .values({ userId, frostNoticeOn: day })
          .onConflictDoUpdate({
            target: userSettingsTable.userId,
            set: { frostNoticeOn: day },
            setWhere: sql`${userSettingsTable.frostNoticeOn} IS NULL OR ${userSettingsTable.frostNoticeOn} <= ${addDays(day, -FROST_PAUSE_DAYS)}`,
          })
          .returning({ userId: userSettingsTable.userId });
        if (claimed.length === 0) continue;
        const when = frost.date === day ? 'heute Nacht' : `am ${frost.date.slice(8, 10)}.${frost.date.slice(5, 7)}.`;
        await send(userId, {
          topic: 'plant-care',
          title: 'Frost in Sicht',
          body: `${when} bis ${String(frost.minTemp).replace('.', ',')} °C: frostempfindliche Pflanzen draußen reinholen oder abdecken.`,
          tag: 'care-frost',
          url: '/aufgaben',
        });
        sent++;
      } catch (err) {
        logger.warn({ err, userId }, 'Frost notice failed');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Frost notices failed');
  }
  return sent;
}
