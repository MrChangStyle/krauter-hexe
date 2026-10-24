import { Router, type IRouter } from 'express';

import { exportAccountData } from '../lib/dataExport';
import { handle } from './farmRouteHelpers';

// Meine Daten herunterladen (docs/datenexport.md). A file download, so it is
// not part of the generated client: the app links to it directly.

const router: IRouter = Router();

const PER_HOUR = 5;
const recent = new Map<string, number[]>();

export function resetDataExportLimit(): void {
  recent.clear();
}

router.get(
  '/auth/user/export',
  handle(async (req, res) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    const userId = req.user!.id;
    const now = Date.now();
    const times = (recent.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (times.length >= PER_HOUR) {
      res.status(429).json({ error: 'Du hast deine Daten gerade erst heruntergeladen. Bitte versuche es in einer Stunde noch einmal.' });
      return;
    }
    const data = await exportAccountData(userId);
    if (!data) {
      res.status(404).json({ error: 'Konto nicht gefunden.' });
      return;
    }
    recent.set(userId, [...times, now]);
    const day = data.exportedAt.slice(0, 10);
    res
      .set({ 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="little-farming-daten-${day}.json"` })
      .type('application/json')
      .send(JSON.stringify(data, null, 2));
  }),
);

export default router;
