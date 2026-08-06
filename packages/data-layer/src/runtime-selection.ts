import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { RuntimeSelection, RuntimeSelectionStore } from "./contracts.js";

const RUNTIME_SELECTION_SCHEMA = `
CREATE TABLE IF NOT EXISTS runtime_selection (
  session_id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL CHECK (runtime IN ('harness', 'python')),
  updated_at TEXT NOT NULL
);
`;

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new TypeError("Runtime selection session id must be non-empty");
  }
}

function validateRuntime(runtime: RuntimeSelection): RuntimeSelection {
  if (runtime !== "harness" && runtime !== "python") {
    throw new TypeError("Runtime selection is invalid");
  }
  return runtime;
}

/** Resolve the same state database location used by the Python runtime. */
export function getHermesStateDatabasePath(): string {
  const configuredHome = process.env.HERMES_HOME?.trim();
  const home = configuredHome === undefined || configuredHome.length === 0
    ? process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "hermes")
      : join(homedir(), ".hermes")
    : configuredHome;
  return join(home, "state.db");
}

export function createDefaultRuntimeSelectionStore(): SQLiteRuntimeSelectionStore {
  return new SQLiteRuntimeSelectionStore(getHermesStateDatabasePath());
}

/** SQLite-backed runtime pins that survive gateway recreation and process restart. */
export class SQLiteRuntimeSelectionStore implements RuntimeSelectionStore {
  private readonly db: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(RUNTIME_SELECTION_SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  async load(sessionId: string): Promise<RuntimeSelection | undefined> {
    validateSessionId(sessionId);
    const row = this.db.query<{ runtime: string }, [string]>(
      "SELECT runtime FROM runtime_selection WHERE session_id = ?",
    ).get(sessionId);
    return row === null ? undefined : validateRuntime(row.runtime as RuntimeSelection);
  }

  async save(sessionId: string, runtime: RuntimeSelection): Promise<void> {
    validateSessionId(sessionId);
    validateRuntime(runtime);
    this.db.run(
      `INSERT INTO runtime_selection (session_id, runtime, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET runtime = excluded.runtime,
       updated_at = excluded.updated_at`,
      [sessionId, runtime, new Date().toISOString()],
    );
  }

  async clear(sessionId?: string): Promise<void> {
    if (sessionId === undefined) {
      this.db.exec("DELETE FROM runtime_selection");
      return;
    }
    validateSessionId(sessionId);
    this.db.run("DELETE FROM runtime_selection WHERE session_id = ?", [sessionId]);
  }
}
