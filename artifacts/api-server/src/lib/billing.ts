/**
 * Bezahlung (docs/bezahlung.md): Lite and Premium as a monthly or yearly
 * subscription. The provider writes the same `premium` row the owner's hand
 * grants use (source, tier, plan, activeUntil), so `premiumOf` and the AI
 * limits need no change when the provider changes.
 *
 * Two providers:
 * - stripe: Checkout for ordering, the customer portal for payment details,
 *   our own cancel button (§ 312k BGB) and a signed webhook that keeps the
 *   row up to date. Plain REST calls, no SDK.
 * - mock: a test checkout inside the app, never real money. Only outside
 *   production – it would hand out Premium for free.
 *
 * Without configuration billing is off: GET /billing says so and the app shows
 * "kommt bald". Configuration: BILLING_PROVIDER, STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET and the four STRIPE_PRICE_* ids.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { db, premiumTable, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';
import { INTERVALS, TIERS, premiumOf, type Interval, type Premium, type Tier } from './premium';

export type Provider = 'stripe' | 'mock';

/** Days a paid period stays active after its end, while the provider retries a failed payment (Richtwert). */
export const GRACE_DAYS = 3;

/** How far apart a Stripe signature's timestamp and now may be (Stripe's own default). */
const SIGNATURE_TOLERANCE_S = 300;

const PRICE_ENV: Record<Tier, Record<Interval, string>> = {
  lite: { monthly: 'STRIPE_PRICE_LITE_MONTHLY', yearly: 'STRIPE_PRICE_LITE_YEARLY' },
  premium: { monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY', yearly: 'STRIPE_PRICE_PREMIUM_YEARLY' },
};

/** Which provider is set up, or null (billing off). */
export function billingProvider(env: NodeJS.ProcessEnv = process.env): Provider | null {
  const wanted = env['BILLING_PROVIDER']?.trim();
  if (wanted === 'mock') return env['NODE_ENV'] === 'production' ? null : 'mock';
  if (wanted !== 'stripe') return null;
  const ready = env['STRIPE_SECRET_KEY'] && env['STRIPE_WEBHOOK_SECRET'] && TIERS.every((t) => INTERVALS.every((i) => env[PRICE_ENV[t][i]]));
  return ready ? 'stripe' : null;
}

export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}

export function isInterval(v: unknown): v is Interval {
  return typeof v === 'string' && (INTERVALS as readonly string[]).includes(v);
}

/** End of a period that starts now: one month or one year later. */
export function periodEnd(interval: Interval, from: Date): Date {
  const end = new Date(from);
  if (interval === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

function off(): never {
  throw new FarmDataError(503, 'Die Bezahlung ist noch nicht eingerichtet.');
}

async function rowOf(userId: string) {
  const [row] = await db.select().from(premiumTable).where(eq(premiumTable.userId, userId));
  return row ?? null;
}

/** Writes the subscription into the account's premium row (insert or replace). */
async function saveSubscription(
  userId: string,
  values: { source: Provider; tier: Tier; plan: Interval; activeUntil: Date; customerId: string | null; subscriptionId: string; cancelAtPeriodEnd: boolean },
): Promise<void> {
  await db
    .insert(premiumTable)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: premiumTable.userId, set: values });
}

// ── Stripe (REST) ────────────────────────────────────────────────────────────

/** Form encoding with Stripe's brackets: { a: { b: 1 }, c: [{ d: 2 }] } → a[b]=1, c[0][d]=2. */
export function stripeForm(params: Record<string, unknown> | unknown[], prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') out.push(...stripeForm(value as Record<string, unknown>, name));
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

async function stripe<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env['STRIPE_SECRET_KEY']}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(method === 'POST' && { 'Idempotency-Key': randomUUID() }),
    },
    body: method === 'POST' ? stripeForm(params).join('&') : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message ?? 'unknown error'}`);
  return data;
}

/**
 * Verifies a Stripe-Signature header ("t=…,v1=…") against the raw body. Pure,
 * so it is tested without Stripe.
 */
export function verifyStripeSignature(rawBody: Buffer | string, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`).digest();
  return parts
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v ?? '', 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  /** Older API versions have it here, newer ones on the item. */
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
}

/** What a Stripe subscription means for the premium row, or null when it carries no account. Pure. */
export function subscriptionUpdate(sub: StripeSubscription, now: Date): { userId: string; values: Parameters<typeof saveSubscription>[1] } | null {
  const userId = sub.metadata?.['userId'];
  const tier = sub.metadata?.['tier'];
  const plan = sub.metadata?.['interval'];
  if (!userId || !isTier(tier) || !isInterval(plan)) return null;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  // Running (also while a payment is retried): until the period's end plus grace. Otherwise over now.
  const running = ['active', 'trialing', 'past_due'].includes(sub.status) && typeof end === 'number';
  const activeUntil = running ? new Date((end! + GRACE_DAYS * 86_400) * 1000) : now;
  return {
    userId,
    values: { source: 'stripe', tier, plan, activeUntil, customerId: sub.customer, subscriptionId: sub.id, cancelAtPeriodEnd: running && sub.cancel_at_period_end },
  };
}

/**
 * A verified Stripe event. Subscription events carry the account in their
 * metadata (set at checkout); everything else is acknowledged and ignored.
 * Returns what happened, for the log.
 */
export async function handleStripeEvent(event: { type: string; data: { object: unknown } }, now = new Date()): Promise<string> {
  if (!event.type.startsWith('customer.subscription.')) return 'ignored';
  const update = subscriptionUpdate(event.data.object as StripeSubscription, now);
  if (!update) return 'no account';
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, update.userId));
  if (!user) return 'unknown account';
  if (event.type === 'customer.subscription.deleted') update.values.activeUntil = now;
  await saveSubscription(update.userId, update.values);
  return 'saved';
}

// ── What the app calls ───────────────────────────────────────────────────────

export interface BillingStatus {
  enabled: boolean;
  provider: Provider | null;
  premium: Premium;
}

export async function billingStatus(userId: string, isOwner: boolean): Promise<BillingStatus> {
  const provider = billingProvider();
  return { enabled: provider !== null, provider, premium: await premiumOf(userId, isOwner) };
}

/** Start an order: the address of the checkout (Stripe's, or the test checkout in the app). */
export async function startCheckout(user: { id: string; email: string | null; isOwner: boolean }, tier: unknown, interval: unknown, appUrl: string): Promise<string> {
  const provider = billingProvider();
  if (!provider) off();
  if (!isTier(tier) || !isInterval(interval)) throw new FarmDataError(400, 'Bitte Paket und Zeitraum wählen.');
  if (user.isOwner) throw new FarmDataError(409, 'Der Betreiber hat Premium immer.');
  const current = await premiumOf(user.id, false);
  // A second Stripe subscription would bill twice; a cancelled one is resumed in the portal.
  if (current.subscribed && (current.source === 'stripe' || !current.cancelAtPeriodEnd)) {
    throw new FarmDataError(409, 'Du hast schon ein Abo. Paket, Zahlungsdaten oder Fortsetzen findest du unter „Zahlung verwalten“.');
  }
  if (provider === 'mock') return `${appUrl}/abo/testkasse?paket=${tier}&zeitraum=${interval}`;
  const row = await rowOf(user.id);
  const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: process.env[PRICE_ENV[tier][interval]], quantity: 1 }],
    success_url: `${appUrl}/abo?bezahlt=1`,
    cancel_url: `${appUrl}/abo`,
    client_reference_id: user.id,
    customer: row?.customerId ?? undefined,
    customer_email: row?.customerId ? undefined : (user.email ?? undefined),
    locale: 'de',
    subscription_data: { metadata: { userId: user.id, tier, interval } },
    metadata: { userId: user.id, tier, interval },
  });
  return session.url;
}

/** The test checkout's "bezahlen": what the webhook would write after a real payment. */
export async function completeMockCheckout(userId: string, tier: unknown, interval: unknown, now = new Date()): Promise<Premium> {
  if (billingProvider() !== 'mock') throw new FarmDataError(404, 'Nicht gefunden.');
  if (!isTier(tier) || !isInterval(interval)) throw new FarmDataError(400, 'Bitte Paket und Zeitraum wählen.');
  await saveSubscription(userId, {
    source: 'mock',
    tier,
    plan: interval,
    activeUntil: periodEnd(interval, now),
    customerId: `mock_cus_${userId}`,
    subscriptionId: `mock_sub_${randomUUID()}`,
    cancelAtPeriodEnd: false,
  });
  return premiumOf(userId, false, now);
}

/**
 * Kündigen (§ 312k BGB): the subscription ends with the paid period; until
 * then everything stays. For Stripe the webhook confirms it as well.
 */
export async function cancelSubscription(userId: string, now = new Date()): Promise<Premium> {
  const provider = billingProvider();
  if (!provider) off();
  const row = await rowOf(userId);
  if (!row?.subscriptionId || !row.activeUntil || row.activeUntil <= now) throw new FarmDataError(404, 'Es gibt kein laufendes Abo zum Kündigen.');
  if (row.source === 'stripe') await stripe('POST', `/subscriptions/${encodeURIComponent(row.subscriptionId)}`, { cancel_at_period_end: true });
  await db.update(premiumTable).set({ cancelAtPeriodEnd: true }).where(eq(premiumTable.userId, userId));
  return premiumOf(userId, false, now);
}

/**
 * Konto löschen: a running Stripe subscription ends at once (no further
 * charge). Throws when Stripe cannot be reached – the account then stays, so
 * the user can try again instead of being billed without an account.
 */
export async function endSubscriptionNow(userId: string): Promise<void> {
  // Without a key nothing can be ended (and nothing is charged through us).
  if (!process.env['STRIPE_SECRET_KEY']) return;
  const row = await rowOf(userId);
  if (row?.source !== 'stripe' || !row.subscriptionId || (row.activeUntil && row.activeUntil <= new Date())) return;
  try {
    await stripe('DELETE', `/subscriptions/${encodeURIComponent(row.subscriptionId)}`);
  } catch {
    throw new FarmDataError(502, 'Dein Abo ließ sich gerade nicht beenden. Bitte versuche es gleich noch einmal – dein Konto bleibt bis dahin bestehen.');
  }
}

/** Zahlung verwalten: the provider's portal (payment method, invoices, Paket). */
export async function portalUrl(userId: string, appUrl: string): Promise<string> {
  const provider = billingProvider();
  if (!provider) off();
  const row = await rowOf(userId);
  if (!row?.customerId) throw new FarmDataError(404, 'Es gibt noch keine Zahlungsdaten.');
  if (provider === 'mock' || row.source === 'mock') return `${appUrl}/abo`;
  const session = await stripe<{ url: string }>('POST', '/billing_portal/sessions', { customer: row.customerId, return_url: `${appUrl}/abo`, locale: 'de' });
  return session.url;
}
