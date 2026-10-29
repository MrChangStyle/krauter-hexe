import { Router, type IRouter, type Request } from 'express';
import {
  BillingCheckoutBody,
  BillingCheckoutResponse,
  BillingPortalResponse,
  CancelBillingResponse,
  CompleteMockCheckoutBody,
  CompleteMockCheckoutResponse,
  GetBillingResponse,
} from '@workspace/api-zod';

import { getAppConfig } from '../lib/appConfig';
import {
  billingStatus,
  cancelSubscription,
  completeMockCheckout,
  handleStripeEvent,
  portalUrl,
  startCheckout,
  verifyStripeSignature,
} from '../lib/billing';
import { logger } from '../lib/logger';
import { requireApproved } from '../middlewares/requireApproved';
import { badRequest, handle } from './farmRouteHelpers';

// Bezahlung (docs/bezahlung.md): status, ordering, cancelling, the provider's
// portal, the test checkout and Stripe's webhook.

const router: IRouter = Router();

function appUrl(req: Request): string {
  return getAppConfig().canonicalOrigin ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

router.get(
  '/billing',
  requireApproved,
  handle(async (req, res) => {
    res.json(GetBillingResponse.parse(await billingStatus(req.user!.id, req.user!.isOwner)));
  }),
);

router.post(
  '/billing/checkout',
  requireApproved,
  handle(async (req, res) => {
    const body = BillingCheckoutBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    const url = await startCheckout(req.user!, body.data.tier, body.data.interval, appUrl(req));
    res.json(BillingCheckoutResponse.parse({ url }));
  }),
);

router.post(
  '/billing/cancel',
  requireApproved,
  handle(async (req, res) => {
    res.json(CancelBillingResponse.parse(await cancelSubscription(req.user!.id)));
  }),
);

router.post(
  '/billing/portal',
  requireApproved,
  handle(async (req, res) => {
    res.json(BillingPortalResponse.parse({ url: await portalUrl(req.user!.id, appUrl(req)) }));
  }),
);

// The test checkout (BILLING_PROVIDER=mock, never in production).
router.post(
  '/billing/mock/complete',
  requireApproved,
  handle(async (req, res) => {
    const body = CompleteMockCheckoutBody.safeParse(req.body);
    if (!body.success) return badRequest(res);
    res.json(CompleteMockCheckoutResponse.parse(await completeMockCheckout(req.user!.id, body.data.tier, body.data.interval)));
  }),
);

// Stripe: no session – the signature over the raw body (kept by app.ts) is the proof.
router.post('/webhooks/stripe', async (req, res) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const secret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
  if (!raw || !verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await handleStripeEvent(req.body as { type: string; data: { object: unknown } });
    logger.info({ type: (req.body as { type?: string }).type, result }, 'Stripe event');
    res.json({ received: true });
  } catch (err) {
    // Stripe retries on an error, so a passing database hiccup heals itself.
    logger.error({ err }, 'Stripe webhook failed');
    res.status(500).json({ error: 'Webhook failed' });
  }
});

export default router;
