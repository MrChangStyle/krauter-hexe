/**
 * Tests for serving the built PWA from the API process (single-service hosts).
 *
 * A real express app is booted on an ephemeral port against a throwaway build
 * directory, so the assertions cover what the host actually answers - route
 * matching, status codes and cache headers - rather than the shape of the code.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { mountWebClient, shouldServeAppShell } from "./webClient";

const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ASSET_ACCEPT = "*/*";

let server: Server;
let baseUrl: string;
let clientDir: string;

beforeAll(async () => {
  clientDir = await mkdtemp(path.join(tmpdir(), "web-client-"));
  await mkdir(path.join(clientDir, "assets"));
  await writeFile(path.join(clientDir, "index.html"), "<!doctype html><title>Shell</title>");
  await writeFile(path.join(clientDir, "assets", "index-abc123.js"), "export default 1;");
  await writeFile(path.join(clientDir, "sw.js"), "// service worker");

  const app = express();
  // Stand-in for the real API router: everything under /api must stay with it.
  app.use("/api", express.Router().get("/healthz", (_req, res) => res.json({ status: "ok" })));
  mountWebClient(app, clientDir);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function get(pathname: string, accept: string = HTML_ACCEPT) {
  return fetch(`${baseUrl}${pathname}`, { headers: { accept } });
}

describe("serving the app", () => {
  it("returns the app shell at the root", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returns the app shell for a deep link, so a hard refresh works", async () => {
    const res = await get("/pflanzen/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Shell");
  });

  it("serves a real asset instead of the shell", async () => {
    const res = await get("/assets/index-abc123.js", ASSET_ACCEPT);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });
});

describe("the API keeps its own responses", () => {
  it("answers a real API route", async () => {
    const res = await get("/api/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("keeps an unknown API path a 404 rather than returning HTML", async () => {
    const res = await get("/api/gibt-es-nicht");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Shell");
  });

  it("does not hand the bare /api to the app shell", async () => {
    const res = await get("/api");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Shell");
  });

  it("still treats a path that merely starts with 'api' as a page", async () => {
    // /apitheke is a normal client route, not the API.
    const res = await get("/apitheke");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Shell");
  });
});

describe("a missing asset must not be masked by the app shell", () => {
  it("404s a missing script requested by the browser", async () => {
    // Returning HTML here would surface as a confusing MIME-type error and
    // hide the fact that the release is broken.
    const res = await get("/assets/index-veraltet.js", ASSET_ACCEPT);
    expect(res.status).toBe(404);
  });

  it("404s a missing icon", async () => {
    const res = await get("/favicon-missing.ico", ASSET_ACCEPT);
    expect(res.status).toBe(404);
  });
});

describe("cache headers", () => {
  it("lets content-hashed assets be cached forever", async () => {
    const res = await get("/assets/index-abc123.js", ASSET_ACCEPT);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("makes the browser revalidate the service worker", async () => {
    // A cached service worker strands users on an old version for days.
    const res = await get("/sw.js", ASSET_ACCEPT);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("makes the browser revalidate the app shell", async () => {
    const res = await get("/");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });
});

describe("shouldServeAppShell", () => {
  it("serves the shell to a navigating browser", () => {
    expect(shouldServeAppShell("/pflanzen/1", HTML_ACCEPT)).toBe(true);
  });

  it("refuses an asset request that does not want HTML", () => {
    expect(shouldServeAppShell("/assets/x.js", ASSET_ACCEPT)).toBe(false);
  });

  it("serves the shell to a client that sends no Accept header at all", () => {
    // Crawlers and command-line tools request route paths without one.
    expect(shouldServeAppShell("/pflanzen/1", undefined)).toBe(true);
  });

  it("serves the shell when a browser navigates to a path containing a dot", () => {
    expect(shouldServeAppShell("/pflanzen/Ahorn.spitz", HTML_ACCEPT)).toBe(true);
  });
});

describe("startup", () => {
  it("refuses to start when the frontend has not been built", () => {
    // Silently serving 404s for every page would look like a broken app rather
    // than a missing build step.
    expect(() => mountWebClient(express(), path.join(clientDir, "nicht-gebaut"))).toThrow(
      /no built frontend was found/,
    );
  });
});
