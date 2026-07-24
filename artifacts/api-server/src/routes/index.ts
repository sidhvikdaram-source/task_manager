import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tasksRouter from "./tasks";
import checklistRouter from "./checklist";
import focusRouter from "./focus";
import userRouter from "./user";
import analyticsRouter from "./analytics";
import habitsRouter from "./habits";
import projectsRouter from "./projects";
import aiRouter from "./ai";
import socialRouter from "./social";
import rewardsRouter from "./rewards";
import planningRouter from "./planning";
import quickCaptureRouter from "./quickCapture";
import canvasRouter from "./canvas";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  next();
});

router.use(healthRouter);
router.use(authRouter);
router.use(tasksRouter);
router.use(checklistRouter);
router.use(focusRouter);
router.use(userRouter);
router.use(analyticsRouter);
router.use(habitsRouter);
router.use(projectsRouter);
router.use(aiRouter);
router.use(socialRouter);
router.use(rewardsRouter);
router.use(planningRouter);
router.use(quickCaptureRouter);
router.use(canvasRouter);

export default router;
