import express, { type Express, type Request, type Response } from "express"; // 1. Imported explicit Request & Response types
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http"; // 2. Changed to a named destructured import
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      // 3. Added explicit types to req and res variables to satisfy strict TS rules
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

export default app;
