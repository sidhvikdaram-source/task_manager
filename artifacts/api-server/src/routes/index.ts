import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import checklistRouter from "./checklist";
import focusRouter from "./focus";
import userRouter from "./user";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(checklistRouter);
router.use(focusRouter);
router.use(userRouter);
router.use(analyticsRouter);

export default router;
