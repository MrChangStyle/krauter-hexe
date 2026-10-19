import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Receives every log call at level error or above (the error monitor
 * registers itself here at start, see lib/monitoring.ts and index.ts). Kept as
 * a late-bound hook so the logger does not depend on the database.
 */
type ErrorSink = (obj: Record<string, unknown> | null, msg: string | undefined) => void;
let errorSink: ErrorSink | null = null;

export function setErrorSink(sink: ErrorSink | null): void {
  errorSink = sink;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  hooks: {
    logMethod(args, method, level) {
      if (level >= 50 && errorSink) {
        try {
          const [first, second] = args as unknown[];
          if (first instanceof Error) errorSink({ err: first }, typeof second === "string" ? second : undefined);
          else if (first && typeof first === "object") errorSink(first as Record<string, unknown>, typeof second === "string" ? second : undefined);
          else errorSink(null, typeof first === "string" ? first : undefined);
        } catch {
          /* never let monitoring break logging */
        }
      }
      return method.apply(this, args);
    },
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
