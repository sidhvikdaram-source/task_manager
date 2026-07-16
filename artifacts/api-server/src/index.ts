import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./migrate";
import { getConfiguredDatabaseHost, setDatabaseConnecting, setDatabaseReady } from "./lib/databaseState";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDatabase() {
  let attempt = 0;
  while (true) {
    attempt += 1;
    setDatabaseConnecting(attempt);
    try {
      await runMigrations();
      setDatabaseReady();
      logger.info({ attempt, host: getConfiguredDatabaseHost() }, "Database is ready");
      return;
    } catch (err) {
      setDatabaseConnecting(attempt, err);
      const delayMs = Math.min(30_000, 2_000 * attempt);
      logger.warn(
        { attempt, delayMs, host: getConfiguredDatabaseHost(), error: err instanceof Error ? err.message.slice(-300) : String(err) },
        "Database unavailable; web server remains online and will retry",
      );
      await wait(delayMs);
    }
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening; database connection starts in background");
  void connectDatabase();
});
