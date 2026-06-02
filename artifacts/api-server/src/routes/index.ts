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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tasksRouter);
router.use(checklistRouter);
router.use(focusRouter);
router.use(userRouter);
router.use(analyticsRouter);
router.use(habitsRouter);
router.use(projectsRouter);

export default router;
