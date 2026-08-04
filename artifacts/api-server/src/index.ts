import app from "./app";
import { isGoogleAuthConfigured } from "./lib/googleOAuth";
import { logger } from "./lib/logger";
import { assertAuthConfigured } from "./lib/token";

// Fail at startup rather than on the first sign-in attempt: without a signing
// key nobody can log in, and that should be obvious from the deploy log.
assertAuthConfigured();

// The host assigns the port: Replit gives each artifact its own, Render (and
// most container hosts) inject PORT at start. The fallback only applies when
// running the bundle by hand.
const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bind to all interfaces. Container platforms route traffic in from outside the
// container, so a server listening only on localhost is invisible to them and
// the deploy is marked as failed ("no open ports detected").
const host = process.env["HOST"] ?? "0.0.0.0";

app.listen(port, host, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");

  // Google sign-in builds its callback URL from the request unless a canonical
  // one is configured. Behind a proxy that is a guess based on headers the
  // caller controls, so say so once at boot instead of leaving a confusing
  // "redirect_uri_mismatch" from Google as the only symptom.
  if (isGoogleAuthConfigured() && !process.env["PUBLIC_BASE_URL"]) {
    logger.warn(
      "Google sign-in is configured but PUBLIC_BASE_URL is not set. Set it to the " +
        "public origin of this app (e.g. https://kraeuter-hexe.onrender.com) so the " +
        "OAuth callback URL is always the one registered with Google.",
    );
  }
  // Push notifications are no longer driven by an in-process setInterval.
  // An external cron service (e.g. cron-job.org) should POST to
  // /api/cron/trigger-notifications with Authorization: Bearer <CRON_SECRET>
  // once per minute. See replit.md → "Push-Benachrichtigungen (Cron)".
});
