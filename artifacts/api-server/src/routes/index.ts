import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./google-auth";
import usersRouter from "./users";
import plantsRouter from "./plants";
import insectsRouter from "./insects";
import tasksRouter from "./tasks";
import careGuidesRouter from "./care-guides";
import leaderboardRouter from "./leaderboard";
import pushRouter from "./push";
import geoRouter from "./geo";
import cronRouter from "./cron";
import migrationRouter from "./migration";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(usersRouter);
router.use(plantsRouter);
router.use(insectsRouter);
router.use(tasksRouter);
router.use(careGuidesRouter);
router.use(leaderboardRouter);
router.use(pushRouter);
router.use(geoRouter);
router.use(cronRouter);
router.use(migrationRouter);

export default router;
