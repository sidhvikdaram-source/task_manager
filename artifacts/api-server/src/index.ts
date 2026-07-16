import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./migrate";

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

const migrationAttempts = 12;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateWithRetry() {
  for (let attempt = 1; attempt <= migrationAttempts; attempt += 1) {
    try {
      await runMigrations();
      return;
    } catch (err) {
      if (attempt === migrationAttempts) throw err;
      const delayMs = Math.min(15_000, 1_500 * attempt);
      logger.warn({ err, attempt, delayMs }, "Database is unavailable; retrying migration");
      await wait(delayMs);
    }
  }
}

async function start() {
  try {
    await migrateWithRetry();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  } catch (err) {
    logger.error({ err, attempts: migrationAttempts }, "Database migration failed after retries");
    process.exit(1);
  }
}

void start();
