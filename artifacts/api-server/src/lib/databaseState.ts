type DatabaseState = {
  ready: boolean;
  attempt: number;
  lastError: string | null;
  updatedAt: string;
};

const state: DatabaseState = {
  ready: false,
  attempt: 0,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

export function getDatabaseState(): Readonly<DatabaseState> {
  return state;
}

export function setDatabaseConnecting(attempt: number, error?: unknown) {
  state.ready = false;
  state.attempt = attempt;
  state.lastError = error instanceof Error ? error.message.slice(0, 300) : error ? String(error).slice(0, 300) : null;
  state.updatedAt = new Date().toISOString();
}

export function setDatabaseReady() {
  state.ready = true;
  state.lastError = null;
  state.updatedAt = new Date().toISOString();
}

export function getConfiguredDatabaseHost() {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "not configured";
  } catch {
    return "invalid DATABASE_URL";
  }
}
