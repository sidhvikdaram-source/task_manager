import express, { type Express, type Request, type Response } from "express"; 
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http"; 
import router from "./routes/index.js";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: Request) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res: Response) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

// In production, serve the built frontend as static files
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  const frontendDist = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "artifacts",
    "task-manager",
    "dist",
    "public",
  );
  app.use(express.static(frontendDist));
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
