import { Router, type IRouter } from 'express';
import { getAppConfig } from '../lib/appConfig';

const router: IRouter = Router();

// Public: the app needs it before anyone is signed in (on the old address the
// move helper replaces the login screen).
router.get('/app-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getAppConfig());
});

export default router;
