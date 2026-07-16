import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getConfiguredDatabaseHost, getDatabaseState } from "../lib/databaseState";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const database = getDatabaseState();
  const data = HealthCheckResponse.parse({ status: database.ready ? "ok" : "degraded" });
  res.status(200).json({
    ...data,
    database: database.ready ? "ready" : "reconnecting",
    databaseHost: getConfiguredDatabaseHost(),
    attempt: database.attempt,
    updatedAt: database.updatedAt,
  });
});

export default router;
