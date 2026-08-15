import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { getDatabaseState } from "./lib/databaseState";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Render sits behind a proxy — trust so Express uses x-forwarded-* headers
app.set("trust proxy", true);
app.use(compression());

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
const allowedOrigins = new Set([
  "https://nimbusdo.firebaseapp.com",
  "https://nimbusdo.web.app",
  "https://nimbusdo.onrender.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed"));
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const database = getDatabaseState();
  if (req.path === "/api/healthz") return next();
  if (!database.ready && req.path.startsWith("/api/")) {
    res.status(503).json({
      error:
        "Nimbus's database is temporarily unavailable. The server is reconnecting automatically.",
      code: "DATABASE_UNAVAILABLE",
      retryAfterSeconds: 30,
    });
    return;
  }
  if (!database.ready) return next();
  void authMiddleware(req, res, next).catch(next);
});

app.use("/api", router);

app.use(
  "/api",
  (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path }, "API request failed");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  },
);

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
  app.use(
    express.static(frontendDist, {
      etag: true,
      setHeaders(res, filePath) {
        const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader(
          "Cache-Control",
          isHashedAsset
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        );
      },
    }),
  );
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
