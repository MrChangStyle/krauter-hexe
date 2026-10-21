/**
 * Vorschau-Schutz: with SITE_PASSWORD set, pages and API answer only with the
 * password page until the cookie is there; machines get through.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env['JWT_SECRET'] ??= 'test-geheimnis-mindestens-16-zeichen';

import { GATE_PATH, resetSiteGateFailures, safeNext, siteGate, siteGateRoutes } from './siteGate';

describe('Vorschau-Schutz', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: true }));
    app.all(GATE_PATH, siteGateRoutes);
    app.use(siteGate);
    app.get('/api/healthz', (_req, res) => res.json({ ok: true }));
    app.post('/api/cron/trigger-notifications', (_req, res) => res.json({ ok: true }));
    app.post('/api/webhooks/camera', (_req, res) => res.json({ ok: true }));
    app.get('/api/auth/user', (_req, res) => res.json({ user: 'x' }));
    app.get('/{*rest}', (_req, res) => res.type('html').send('<p>App</p>'));
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
    delete process.env['SITE_PASSWORD'];
  });

  beforeEach(() => {
    process.env['SITE_PASSWORD'] = 'gruener-daumen';
    resetSiteGateFailures();
  });

  const login = (password: string, next = '/farm') =>
    fetch(`${base}${GATE_PATH}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password, next }).toString(),
    });

  it('shows only the password page until the password is typed', async () => {
    const page = await fetch(`${base}/farm?x=1`);
    expect(page.status).toBe(401);
    const html = await page.text();
    expect(html).toContain('name="password"');
    expect(html).toContain('value="/farm?x=1"');
    expect(html).not.toContain('<p>App</p>');

    const api = await fetch(`${base}/api/auth/user`);
    expect(api.status).toBe(401);
    expect(api.headers.get('x-site-locked')).toBe('1');

    const wrong = await login('falsch');
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain('Das Passwort stimmt nicht.');
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const right = await login('gruener-daumen');
    expect(right.status).toBe(303);
    expect(right.headers.get('location')).toBe('/farm');
    const cookie = right.headers.get('set-cookie')!.split(';')[0]!;
    expect(cookie).toMatch(/^lf_site=[0-9a-f]{64}$/);
    expect(right.headers.get('set-cookie')).toMatch(/HttpOnly/i);

    expect(await (await fetch(`${base}/farm`, { headers: { cookie } })).text()).toContain('<p>App</p>');
    expect((await fetch(`${base}/api/auth/user`, { headers: { cookie } })).status).toBe(200);

    // A new password locks everyone out again.
    process.env['SITE_PASSWORD'] = 'neues-passwort';
    expect((await fetch(`${base}/farm`, { headers: { cookie } })).status).toBe(401);
  });

  it('lets machines through', async () => {
    expect((await fetch(`${base}/api/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/api/cron/trigger-notifications`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${base}/api/webhooks/camera`, { method: 'POST' })).status).toBe(200);
  });

  it('is off without SITE_PASSWORD', async () => {
    delete process.env['SITE_PASSWORD'];
    expect(await (await fetch(`${base}/farm`)).text()).toContain('<p>App</p>');
    const r = await fetch(`${base}${GATE_PATH}?next=/mehr`, { redirect: 'manual' });
    expect(r.headers.get('location')).toBe('/mehr');
  });

  it('slows down guessing', async () => {
    for (let i = 0; i < 10; i++) expect((await login('falsch')).status).toBe(401);
    expect((await login('gruener-daumen')).status).toBe(429);
  });

  it('only sends visitors on to paths of this site', () => {
    expect(safeNext('/farm/aufgaben?x=1')).toBe('/farm/aufgaben?x=1');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/\\evil')).toBe('/');
    expect(safeNext(`${GATE_PATH}?next=/`)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});
