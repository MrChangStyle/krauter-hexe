/**
 * Serving the built PWA from the API process.
 *
 * On Replit the frontend has its own dev server behind its own preview path, so
 * this is not used. A single-service host (Render's free tier allows exactly one
 * web service) sets SERVE_WEB_CLIENT=true and this process then answers both
 * /api/* and every page of the app from one origin — which is what the session
 * cookie and the deliberate absence of CORS already assume anyway.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

/**
 * Where the frontend build lands. Relative to the bundled dist/index.mjs, the
 * sibling artifact's output directory.
 */
export function resolveWebClientDir(): string {
  return (
    process.env["WEB_CLIENT_DIR"] ??
    path.resolve(import.meta.dirname, "../../pflanzenscanner/dist/public")
  );
}

/**
 * Decides whether a request that matched no file should receive the app shell.
 *
 * A page navigation must get the shell so client-side routing survives a hard
 * refresh. A *missing asset* must not: answering a request for a JavaScript
 * file with HTML turns a broken release into a confusing MIME-type error in the
 * browser instead of an obvious 404.
 *
 * Both signals are used in the permissive direction, so only a request that
 * looks like an asset *and* does not ask for HTML is refused: browsers send
 * "Accept: text/html" when navigating and "*∕*" when loading a script, while
 * crawlers and command-line tools may send no useful Accept header at all but
 * do request extension-less route paths.
 */
export function shouldServeAppShell(
  requestPath: string,
  acceptHeader: string | undefined,
): boolean {
  const wantsHtml = (acceptHeader ?? "").includes("text/html");
  const looksLikeAsset = path.extname(requestPath) !== "";
  return wantsHtml || !looksLikeAsset;
}

/** Matches every path except the API, including the bare "/api". */
export const NON_API_PATH = /^\/(?!api(?:\/|$)).*/;

export function mountWebClient(app: Express, clientDir: string): void {
  const indexHtml = path.join(clientDir, "index.html");

  if (!existsSync(indexHtml)) {
    // Fail at boot instead of answering every page with a 404, which would look
    // like a broken app rather than a missing build step.
    throw new Error(
      `SERVE_WEB_CLIENT is enabled but no built frontend was found at ${clientDir}. ` +
        "Run the frontend build before starting the server, or point WEB_CLIENT_DIR at the build output.",
    );
  }

  app.use(
    express.static(clientDir, {
      // index.html is served by the fallback below so it gets the same headers
      // whether the user opened "/" or a deep link.
      index: false,
      setHeaders(res, filePath) {
        // Asset filenames contain a content hash, so they can be cached
        // forever. Everything the browser must re-check to discover a new
        // release (the shell, the service worker, the manifest) must not be —
        // a cached service worker keeps users on an old version for days.
        const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader(
          "Cache-Control",
          isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );

  app.get(NON_API_PATH, (req, res, next) => {
    if (!shouldServeAppShell(req.path, req.headers.accept)) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
}
