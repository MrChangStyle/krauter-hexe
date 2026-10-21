import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { mountWebClient, resolveWebClientDir } from "./lib/webClient";
import { GATE_PATH, siteGate, siteGateRoutes } from "./lib/siteGate";

const app: Express = express();

// The app runs behind the host's proxy (Render), so the client address is in
// X-Forwarded-For. Trusting exactly the configured number of hops (default 1)
// makes req.ip the real client for the per-address limits on sign-in and
// registration, without letting a client spoof it by sending its own header.
const trustProxyHops = Number(process.env["TRUST_PROXY_HOPS"] ?? "1");
app.set(
  "trust proxy",
  Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1,
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Deliberately NO CORS layer: the PWA is served from the same origin as this
// API (path-based routing in dev and in the published app), so cross-origin
// access is never needed — and reflecting arbitrary origins with
// credentials:true would let malicious sites ride on the session cookie.
app.use(cookieParser());
// Plant photos are sent as base64 data URLs, so the default JSON limit is too small.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
// Vorschau-Schutz: while SITE_PASSWORD is set, nothing but the password page
// until the visitor has typed it (machines with their own secrets excepted).
app.all(GATE_PATH, siteGateRoutes);
app.use(siteGate);
// Loads the user from the session (if any) on every request.
app.use(authMiddleware);

app.use("/api", router);

// Single-service hosts serve the built PWA from this same process. Off by
// default, so on Replit (separate dev server per artifact) nothing changes.
if (process.env["SERVE_WEB_CLIENT"] === "true") {
  mountWebClient(app, resolveWebClientDir());
}

// Last stop for errors a route did not handle (recorded by the error monitor).
app.use(errorHandler);

export default app;
