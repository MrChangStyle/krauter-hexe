/**
 * Finanzen (docs/finanzen.md): the owner's view of the business – who has
 * which Paket, what came in, and what the AI cost.
 *
 * - Revenue: the payments the provider confirmed (`payments`, written by the
 *   Stripe webhook on invoice.paid and by the test checkout).
 * - Recurring revenue (MRR): the running subscriptions, a yearly one as a
 *   twelfth, from the list prices (PRICE_CENTS).
 * - AI costs: the AI requests counted per day (usage_daily "ai_actions")
 *   times a cost per request – a Richtwert (AI_COST_PER_REQUEST_CENT), not
 *   Google's bill.
 */
import { db, paymentsTable, premiumTable, usageDailyTable, usersTable } from '@workspace/db';
import { desc, eq, gte, sql } from 'drizzle-orm';

import { premiumFrom, testPhaseEnd, type Interval, type Premium, type Tier } from './premium';

/** List prices in cents – the same as PLANS on the homepage (lib/site.ts in the app). */
export const PRICE_CENTS: Record<Tier, Record<Interval, number>> = {
  lite: { monthly: 299, yearly: 2990 },
  premium: { monthly: 599, yearly: 5990 },
};

/** Default cost of one AI request in cents (Gemini Flash with a photo, Richtwert – see docs/finanzen.md "Offen"). */
export const DEFAULT_AI_COST_CENT = 0.3;

export function aiCostPerRequestCent(value = process.env['AI_COST_PER_REQUEST_CENT']): number {
  const n = Number(value?.replace(',', '.'));
  return value && Number.isFinite(n) && n >= 0 ? n : DEFAULT_AI_COST_CENT;
}

/** What one month of a subscription brings in, in cents. */
export function monthlyCents(tier: Tier, plan: Interval): number {
  return plan === 'monthly' ? PRICE_CENTS[tier].monthly : Math.round(PRICE_CENTS[tier].yearly / 12);
}

export type PaketKey = 'owner' | 'premium' | 'lite' | 'manual' | 'tester' | 'test' | 'basis';

/** The Paket of an account as the finance list groups it. Pure. */
export function paketKey(p: Premium): PaketKey {
  if (!p.active) return 'basis';
  if (p.source === 'owner' || p.source === 'test' || p.source === 'tester' || p.source === 'manual') return p.source;
  return p.tier === 'lite' ? 'lite' : 'premium';
}

/** "2026-10" in Berlin for a moment. */
function berlinMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${parts.find((x) => x.type === 'year')!.value}-${parts.find((x) => x.type === 'month')!.value}`;
}

/** The last `count` months, newest first ("2026-10", "2026-09", …). */
export function lastMonths(now: Date, count: number): string[] {
  const [y, m] = berlinMonth(now).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function recordPayment(values: {
  accountId: string | null;
  source: 'stripe' | 'mock';
  externalId: string;
  amountCents: number;
  currency?: string;
  tier: string | null;
  plan: string | null;
  paidAt?: Date;
}): Promise<void> {
  // The provider may send an event twice: the invoice counts once.
  await db.insert(paymentsTable).values(values).onConflictDoNothing({ target: paymentsTable.externalId });
}

interface StripeInvoice {
  id?: string;
  amount_paid?: number;
  currency?: string;
  customer?: string | null;
  subscription?: string | null;
  status_transitions?: { paid_at?: number | null };
  subscription_details?: { metadata?: Record<string, string> };
  parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } };
}

/** The parts of a Stripe invoice the payment list needs; null without an id or amount. Pure. */
export function invoicePayment(inv: StripeInvoice) {
  if (!inv.id || typeof inv.amount_paid !== 'number' || inv.amount_paid <= 0) return null;
  const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
  return {
    externalId: inv.id,
    amountCents: inv.amount_paid,
    currency: inv.currency ?? 'eur',
    paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : new Date(),
    userId: meta['userId'] ?? null,
    tier: meta['tier'] ?? null,
    plan: meta['interval'] ?? null,
    subscriptionId: inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null,
    customerId: inv.customer ?? null,
  };
}

/** Stripe's invoice.paid: one payment, assigned to the account by metadata, subscription or customer. */
export async function recordStripeInvoice(invoice: unknown): Promise<string> {
  const p = invoicePayment(invoice as StripeInvoice);
  if (!p) return 'no payment';
  let accountId: string | null = p.userId;
  let tier: string | null = p.tier;
  let plan: string | null = p.plan;
  if (!accountId || !tier) {
    const rows = await db.select().from(premiumTable);
    const row = rows.find((r) => (p.subscriptionId && r.subscriptionId === p.subscriptionId) || (p.customerId && r.customerId === p.customerId));
    accountId ??= row?.userId ?? null;
    tier ??= row?.tier ?? null;
    plan ??= row?.plan ?? null;
  }
  await recordPayment({ accountId, source: 'stripe', externalId: p.externalId, amountCents: p.amountCents, currency: p.currency, tier, plan, paidAt: p.paidAt });
  return 'payment';
}

// ── Overview ─────────────────────────────────────────────────────────────────

export async function financeOverview(now = new Date()) {
  const end = testPhaseEnd();
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      userCode: usersTable.userCode,
      isOwner: usersTable.isOwner,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);
  const rows = new Map((await db.select().from(premiumTable)).map((r) => [r.userId, r]));

  const counts: Record<PaketKey, number> = { owner: 0, premium: 0, lite: 0, manual: 0, tester: 0, test: 0, basis: 0 };
  let mrrCents = 0;
  const accounts = users.map((u) => {
    const p = premiumFrom(rows.get(u.id) ?? null, u.isOwner, u.createdAt, end, now);
    const paket = paketKey(p);
    counts[paket] += 1;
    const paying = (p.source === 'stripe' || p.source === 'mock') && p.plan !== null && p.tier !== null;
    if (paying && !p.cancelAtPeriodEnd) mrrCents += monthlyCents(p.tier!, p.plan!);
    return {
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
      email: u.email,
      userCode: u.userCode,
      paket,
      source: p.source,
      plan: p.plan,
      until: p.until,
      cancelAtPeriodEnd: p.cancelAtPeriodEnd,
      monthlyCents: paying ? monthlyCents(p.tier!, p.plan!) : 0,
      since: rows.get(u.id)?.grantedAt.toISOString() ?? null,
    };
  });
  const order: PaketKey[] = ['premium', 'lite', 'manual', 'tester', 'test', 'basis', 'owner'];
  accounts.sort((a, b) => order.indexOf(a.paket) - order.indexOf(b.paket) || (a.email ?? '').localeCompare(b.email ?? ''));

  const months = lastMonths(now, 12);
  const from = new Date(Date.UTC(Number(months.at(-1)!.slice(0, 4)), Number(months.at(-1)!.slice(5)) - 1, 1) - 2 * 3600_000);
  const revenue = await db
    .select({
      month: sql<string>`to_char(${paymentsTable.paidAt} AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')`,
      cents: sql<number>`sum(${paymentsTable.amountCents})::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(paymentsTable)
    .where(gte(paymentsTable.paidAt, from))
    .groupBy(sql`1`);
  const ai = await db
    .select({ month: sql<string>`substr(${usageDailyTable.day}::text, 1, 7)`, n: sql<number>`sum(${usageDailyTable.value})::int` })
    .from(usageDailyTable)
    .where(eq(usageDailyTable.metric, 'ai_actions'))
    .groupBy(sql`1`);
  const cost = aiCostPerRequestCent();
  const monthRows = months.map((month) => {
    const r = revenue.find((x) => x.month === month);
    const aiRequests = ai.find((x) => x.month === month)?.n ?? 0;
    const revenueCents = r?.cents ?? 0;
    const aiCostCents = Math.round(aiRequests * cost);
    return { month, revenueCents, payments: r?.n ?? 0, aiRequests, aiCostCents, resultCents: revenueCents - aiCostCents };
  });

  const emails = new Map(users.map((u) => [u.id, u.email]));
  const recent = await db.select().from(paymentsTable).orderBy(desc(paymentsTable.paidAt)).limit(20);

  return {
    counts,
    mrrCents,
    aiCostPerRequestCent: cost,
    months: monthRows,
    accounts,
    payments: recent.map((p) => ({
      paidAt: p.paidAt.toISOString(),
      amountCents: p.amountCents,
      currency: p.currency,
      source: p.source,
      tier: p.tier,
      plan: p.plan,
      email: p.accountId ? (emails.get(p.accountId) ?? null) : null,
    })),
  };
}
