import app from "./app";
import { isGoogleAuthConfigured } from "./lib/googleOAuth";
import { logger, setErrorSink } from "./lib/logger";
import { errorFromLog, flushErrors, recordError } from "./lib/monitoring";
import { assertAuthConfigured } from "./lib/token";
import { upgradeSchema } from "./lib/schemaUpgrade";
import { normalizeStoredSymptoms } from "./lib/plantSymptoms";
import { assignMissingUserCodes } from "./lib/userCode";

// Error monitor: every logger.error/fatal ends up in the owner's list (lib/monitoring.ts).
setErrorSink((obj, msg) => {
  const report = errorFromLog(obj, msg);
  if (report) recordError(report);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  // Record it before the process goes down, as Node would without this handler.
  void flushErrors().finally(() => process.exit(1));
});

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

// Add new columns before serving requests: queries select every column, so a
// missing one would break every page. On failure the process exits and the
// host keeps the previous version running.
try {
  await upgradeSchema();
} catch (err) {
  logger.error({ err }, "Schema upgrade failed");
  process.exit(1);
}

app.listen(port, host, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");

  // Rename stored symptom tags to the fixed Beschwerden names (idempotent).
  void normalizeStoredSymptoms().catch((err) => logger.error({ err }, "Symptom renaming failed"));

  // Every account gets its Nutzer-ID (lib/userCode.ts) – older ones once here.
  void assignMissingUserCodes().catch((err) => logger.error({ err }, "Assigning Nutzer-IDs failed"));

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
