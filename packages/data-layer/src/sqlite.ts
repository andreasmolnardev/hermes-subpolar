import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database, type Statement } from "bun:sqlite";
import {
  CHECKPOINT_FORMAT_VERSION,
  PERSISTENCE_SCHEMA_VERSION,
  assertSupportedSchemaVersion,
  assertValidSessionMessages,
  isMessageContent,
} from "./contracts.js";
import type {
  AppendMessagesOptions,
  AppendMessagesResult,
  AtomicTurnWrite,
  CheckpointRecord,
  IdempotencyClaim,
  IdempotencyClaimResult,
  IdempotencyCompletion,
  IdempotencyLookup,
  IdempotencyRecord,
  JsonObject,
  JsonValue,
  MigrationStateRecord,
  PersistenceRepository,
  PersistenceRepositoryTransaction,
  RuntimeMigrationMetadata,
  SessionMessage,
  SessionMessageDraft,
  SessionRecord,
  TerminalWriteResult,
  ToolCall,
  ToolCallRecord,
  ToolResult,
  ToolResultRecord,
  TurnRecord,
  TurnTerminalRecord,
  TurnTerminalStatus,
  Usage,
  UsageRecord,
} from "./contracts.js";

type SqlValue = string | number | null | undefined;
type SqlBinding = string | number | null;
type SqlRow = Record<string, SqlValue>;

export type SQLiteSessionRepositoryOptions = {
  path: string;
  runtimeVersion?: string;
};

export class UnsupportedSchemaError extends Error {
  constructor(message: string) {
    super(`Unsupported SQLite schema: ${message}`);
    this.name = "UnsupportedSchemaError";
  }
}

export class IdempotencyMismatchError extends Error {
  constructor() {
    super("Idempotency key was reused with a different request hash");
    this.name = "IdempotencyMismatchError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copy(item)) as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = copy(item);
    return result as T;
  }
  return value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isToolCall(value: unknown): value is ToolCall {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    (typeof value.arguments === "string" || isJsonObject(value.arguments));
}

function isToolResult(value: unknown): value is ToolResult {
  return isRecord(value) && typeof value.toolCallId === "string" && value.toolCallId.length > 0 &&
    isMessageContent(value.content) && typeof value.isError === "boolean" &&
    (value.toolName === undefined || typeof value.toolName === "string");
}

function isUsage(value: unknown): value is Usage {
  if (!isRecord(value)) return false;
  const nonNegative = (item: unknown): item is number =>
    typeof item === "number" && Number.isFinite(item) && item >= 0;
  return nonNegative(value.inputTokens) && nonNegative(value.outputTokens) &&
    (value.totalTokens === undefined || nonNegative(value.totalTokens)) &&
    (value.cachedInputTokens === undefined || nonNegative(value.cachedInputTokens)) &&
    (value.reasoningTokens === undefined || nonNegative(value.reasoningTokens)) &&
    (value.cacheCreationInputTokens === undefined || nonNegative(value.cacheCreationInputTokens)) &&
    (value.cacheReadInputTokens === undefined || nonNegative(value.cacheReadInputTokens));
}

function isRecovery(value: unknown): boolean {
  if (!isRecord(value) || typeof value.turnId !== "string" || value.turnId.length === 0 ||
      (value.status !== "running" && value.status !== "interrupted" && value.status !== "recoverable") ||
      typeof value.startedAt !== "string" || Number.isNaN(Date.parse(value.startedAt)) ||
      typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return false;
  if (value.checkpointId !== undefined &&
      (typeof value.checkpointId !== "string" || value.checkpointId.length === 0)) return false;
  if (value.pendingToolCallIds !== undefined &&
      (!Array.isArray(value.pendingToolCallIds) ||
       new Set(value.pendingToolCallIds).size !== value.pendingToolCallIds.length ||
       !value.pendingToolCallIds.every((id) => typeof id === "string" && id.length > 0))) return false;
  return value.status === "running" || value.checkpointId !== undefined;
}

function isRuntime(value: unknown): value is RuntimeMigrationMetadata {
  return isRecord(value) && typeof value.runtimeVersion === "string" &&
    value.schemaVersion === PERSISTENCE_SCHEMA_VERSION &&
    (value.migratedFromSchemaVersion === undefined ||
      (typeof value.migratedFromSchemaVersion === "number" &&
        Number.isSafeInteger(value.migratedFromSchemaVersion) && value.migratedFromSchemaVersion >= 0)) &&
    (value.migrationId === undefined || typeof value.migrationId === "string") &&
    (value.migratedAt === undefined || typeof value.migratedAt === "string");
}

function json(value: JsonValue): string {
  return JSON.stringify(value);
}

function optionalJson(value: JsonValue | undefined): string | null {
  return value === undefined ? null : json(value);
}

function parseJson(value: SqlValue, label: string): unknown {
  if (typeof value !== "string") throw new UnsupportedSchemaError(`${label} is not JSON text`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new UnsupportedSchemaError(`${label} contains invalid JSON`);
  }
}

function requiredString(row: SqlRow, column: string, table: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new UnsupportedSchemaError(`${table}.${column} must be a non-empty string`);
  }
  return value;
}

function optionalString(row: SqlRow, column: string, table: string): string | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new UnsupportedSchemaError(`${table}.${column} must be text`);
  return value;
}

function isCheckpointReason(value: unknown): value is CheckpointRecord["reason"] {
  return value === "manual" || value === "turn" || value === "before-tool" || value === "migration";
}

function finishReasonValue(value: SqlValue): SessionMessage["finishReason"] | undefined {
  return value === "stop" || value === "length" || value === "tool_calls" ||
    value === "content_filter" || value === "error" ? value : undefined;
}

const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  title TEXT,
  model TEXT,
  provider TEXT,
  metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  tool_result_json TEXT,
  finish_reason TEXT,
  usage_json TEXT,
  reasoning TEXT,
  metadata_json TEXT,
  api_content_json TEXT,
  display_kind TEXT,
  display_metadata_json TEXT,
  synthetic INTEGER,
  context_json TEXT,
  UNIQUE(session_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_data_layer_messages_session_sequence
  ON messages(session_id, sequence);
`;

const AUXILIARY_SCHEMA = `
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  arguments_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_results (
  tool_call_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  content_json TEXT NOT NULL,
  is_error INTEGER NOT NULL,
  tool_name TEXT
);
CREATE TABLE IF NOT EXISTS usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  message_id TEXT
);
CREATE TABLE IF NOT EXISTS migration (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  recovery_json TEXT
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  message_sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  label TEXT
);
CREATE TABLE IF NOT EXISTS idempotency (
  schema_version INTEGER NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed')),
  status_code INTEGER NOT NULL CHECK (status_code > 0),
  response_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, key),
  UNIQUE (scope, key, request_hash),
  CHECK ((state = 'pending' AND response_json IS NULL) OR
         (state IN ('completed', 'failed') AND response_json IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('running', 'interrupted', 'recoverable', 'completed', 'failed', 'cancelled',
     'budget_exhausted', 'provider_failed', 'tool_failed', 'approval_rejected')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recovery_json TEXT,
  UNIQUE (session_id, id)
);
CREATE TABLE IF NOT EXISTS turn_terminals (
  turn_id TEXT PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('completed', 'failed', 'cancelled', 'budget_exhausted', 'provider_failed',
     'tool_failed', 'approval_rejected')),
  completed_at TEXT NOT NULL,
  result_json TEXT,
  FOREIGN KEY (session_id, turn_id) REFERENCES turns(session_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_layer_tool_calls_session_sequence
  ON tool_calls(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_data_layer_tool_results_session_sequence
  ON tool_results(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_data_layer_usages_session_recorded
  ON usages(session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_data_layer_checkpoints_session_created
  ON checkpoints(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_data_layer_turns_status_updated
  ON turns(status, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_data_layer_idempotency_expiry
  ON idempotency(expires_at);
`;

const AUTH_TABLES = new Set([
  "users", "auth_sessions", "projects", "agents", "session_owners", "provider_connections",
]);

export class SQLiteSessionRepository implements PersistenceRepository {
  private readonly db: Database;
  private readonly runtimeVersion: string;
  private queue = Promise.resolve();

  constructor(path: string);
  constructor(options: SQLiteSessionRepositoryOptions);
  constructor(pathOrOptions: string | SQLiteSessionRepositoryOptions) {
    const path = typeof pathOrOptions === "string" ? pathOrOptions : pathOrOptions.path;
    this.runtimeVersion = typeof pathOrOptions === "string" ? "typescript" :
      (pathOrOptions.runtimeVersion ?? "typescript");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    try {
      this.initializeSchema();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  private query<T extends object>(sql: string): Statement<T, SqlBinding[]> {
    return this.db.query<T, SqlBinding[]>(sql);
  }

  private run(sql: string, ...params: SqlBinding[]): void {
    this.db.run(sql, params);
  }

  private tableExists(table: string): boolean {
    const row = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table);
    return row !== null;
  }

  private columns(table: string): Set<string> {
    const rows = this.query<{ name: string }>(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map((row) => row.name));
  }

  private schemaVersion(): number | null {
    if (!this.tableExists("schema_version")) return null;
    const row = this.query<{ version: number }>(
      "SELECT version FROM schema_version ORDER BY rowid DESC LIMIT 1",
    ).get();
    return row?.version ?? null;
  }

  private tableNames(): Set<string> {
    const rows = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all();
    return new Set(rows.map(({ name }) => name));
  }

  private requireColumns(table: string, required: readonly string[]): void {
    const columns = this.columns(table);
    if (!required.every((column) => columns.has(column))) {
      throw new UnsupportedSchemaError(`${table} is not a TypeScript persistence table`);
    }
  }

  private initializeSchema(): void {
    const tables = this.tableNames();
    const hasSessions = this.tableExists("sessions");
    const hasMessages = this.tableExists("messages");
    if (!hasSessions && !hasMessages) {
      if (tables.size > 0 && [...tables].some((table) => !AUTH_TABLES.has(table))) {
        throw new UnsupportedSchemaError("database contains a non-TypeScript schema");
      }
      this.db.exec(CORE_SCHEMA);
      this.db.exec(AUXILIARY_SCHEMA);
      this.run("INSERT INTO schema_version (version) VALUES (?)", PERSISTENCE_SCHEMA_VERSION);
      return;
    }
    if (!hasSessions || !hasMessages) {
      throw new UnsupportedSchemaError("sessions and messages must exist together");
    }

    const sessionColumns = this.columns("sessions");
    const messageColumns = this.columns("messages");
    const canonical = ["schema_version", "workspace_id", "status", "created_at", "updated_at", "runtime_json"]
      .every((column) => sessionColumns.has(column)) &&
      ["schema_version", "sequence", "content_json", "created_at"]
        .every((column) => messageColumns.has(column));

    if (canonical) {
      const version = this.schemaVersion();
      if (version !== null && version !== PERSISTENCE_SCHEMA_VERSION) {
        throw new UnsupportedSchemaError(`persistence schema version ${String(version)}`);
      }
      const allowed = new Set([
        "schema_version", "sessions", "messages", "tool_calls", "tool_results", "usages",
        "migration", "checkpoints", "idempotency", "turns", "turn_terminals", ...AUTH_TABLES,
      ]);
      if ([...tables].some((table) => !allowed.has(table))) {
        throw new UnsupportedSchemaError("database contains a non-TypeScript schema");
      }
      if (this.tableExists("schema_version")) this.requireColumns("schema_version", ["version"]);
      const existingTables: readonly [string, readonly string[]][] = [
        ["migration", ["session_id", "schema_version", "updated_at", "runtime_json"]],
        ["checkpoints", ["id", "session_id", "schema_version", "message_sequence", "created_at", "reason", "runtime_json", "snapshot_json"]],
        ["tool_calls", ["id", "schema_version", "session_id", "message_id", "sequence", "created_at", "name", "arguments_json"]],
        ["tool_results", ["tool_call_id", "schema_version", "session_id", "message_id", "sequence", "created_at", "content_json", "is_error"]],
        ["usages", ["id", "schema_version", "session_id", "recorded_at", "usage_json"]],
        ["idempotency", ["schema_version", "scope", "key", "request_hash", "state", "status_code", "created_at", "expires_at"]],
        ["turns", ["id", "session_id", "schema_version", "status", "started_at", "updated_at"]],
        ["turn_terminals", ["turn_id", "session_id", "schema_version", "status", "completed_at"]],
      ];
      for (const [table, required] of existingTables) {
        if (this.tableExists(table)) this.requireColumns(table, required);
      }
      this.ensureCanonicalColumns();
      this.db.exec(AUXILIARY_SCHEMA);
      this.ensureAuxiliaryColumns();
      if (version === null) {
        this.db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
        this.run("INSERT INTO schema_version (version) VALUES (?)", PERSISTENCE_SCHEMA_VERSION);
      }
      return;
    }
    throw new UnsupportedSchemaError("sessions/messages are not a TypeScript persistence schema");
  }

  private runExclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  private ensureAuxiliaryColumns(): void {
    const columns = (table: "migration" | "checkpoints"): Set<string> =>
      new Set(this.query<{ name: string }>(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    if (!columns("migration").has("recovery_json")) {
      this.db.exec("ALTER TABLE migration ADD COLUMN recovery_json TEXT");
    }
    if (!columns("checkpoints").has("format_version")) {
      this.db.exec("ALTER TABLE checkpoints ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1");
    }
  }

  private ensureCanonicalColumns(): void {
    const columns = (table: "sessions" | "messages"): Set<string> => this.columns(table);
    const additions: readonly ["sessions" | "messages", string, string][] = [
      ["sessions", "title", "TEXT"],
      ["sessions", "model", "TEXT"],
      ["sessions", "provider", "TEXT"],
      ["sessions", "metadata_json", "TEXT"],
      ["messages", "name", "TEXT"],
      ["messages", "tool_calls_json", "TEXT"],
      ["messages", "tool_call_id", "TEXT"],
      ["messages", "tool_result_json", "TEXT"],
      ["messages", "finish_reason", "TEXT"],
      ["messages", "usage_json", "TEXT"],
      ["messages", "reasoning", "TEXT"],
      ["messages", "metadata_json", "TEXT"],
      ["messages", "api_content_json", "TEXT"],
      ["messages", "display_kind", "TEXT"],
      ["messages", "display_metadata_json", "TEXT"],
      ["messages", "synthetic", "INTEGER"],
      ["messages", "context_json", "TEXT"],
    ];
    const known = new Map<"sessions" | "messages", Set<string>>([
      ["sessions", columns("sessions")],
      ["messages", columns("messages")],
    ]);
    for (const [table, column, definition] of additions) {
      const tableColumns = known.get(table);
      if (tableColumns !== undefined && !tableColumns.has(column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        tableColumns.add(column);
      }
    }
  }

  private requireSession(sessionId: string): void {
    const row = this.query<{ id: string }>("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    if (row === null) throw new Error(`Session not found: ${sessionId}`);
  }

  private canonicalSession(row: SqlRow): SessionRecord {
    const session: SessionRecord = {
      schemaVersion: Number(row.schema_version) as SessionRecord["schemaVersion"],
      id: requiredString(row, "id", "sessions"),
      workspaceId: requiredString(row, "workspace_id", "sessions"),
      status: requiredString(row, "status", "sessions") as SessionRecord["status"],
      createdAt: requiredString(row, "created_at", "sessions"),
      updatedAt: requiredString(row, "updated_at", "sessions"),
      runtime: this.jsonRuntime(row.runtime_json, "sessions.runtime_json"),
    };
    assertSupportedSchemaVersion(session.schemaVersion);
    if (session.status !== "active" && session.status !== "completed" &&
        session.status !== "failed" && session.status !== "cancelled") {
      throw new UnsupportedSchemaError(`sessions.status has unsupported value ${session.status}`);
    }
    this.addOptionalSessionFields(session, row);
    return session;
  }

  private addOptionalSessionFields(session: SessionRecord, row: SqlRow): void {
    const title = optionalString(row, "title", "sessions");
    const model = optionalString(row, "model", "sessions");
    const provider = optionalString(row, "provider", "sessions");
    if (title !== undefined) session.title = title;
    if (model !== undefined) session.model = model;
    if (provider !== undefined) session.provider = provider;
    if (row.metadata_json !== null && row.metadata_json !== undefined) {
      const metadata = parseJson(row.metadata_json, "sessions.metadata_json");
      if (!isJsonObject(metadata)) throw new UnsupportedSchemaError("sessions.metadata_json is not an object");
      session.metadata = metadata;
    }
  }

  private jsonRuntime(value: SqlValue, label: string): RuntimeMigrationMetadata {
    const runtime = parseJson(value, label);
    if (!isRuntime(runtime)) throw new UnsupportedSchemaError(`${label} is invalid runtime metadata`);
    return runtime;
  }

  private canonicalMessage(row: SqlRow): SessionMessage {
    const content = parseJson(row.content_json, "messages.content_json");
    if (!isMessageContent(content)) throw new UnsupportedSchemaError("messages.content_json is invalid content");
    const message: SessionMessage = {
      schemaVersion: Number(row.schema_version) as SessionMessage["schemaVersion"],
      id: requiredString(row, "id", "messages"),
      sessionId: requiredString(row, "session_id", "messages"),
      sequence: Number(row.sequence),
      role: requiredString(row, "role", "messages") as SessionMessage["role"],
      content,
      createdAt: requiredString(row, "created_at", "messages"),
    };
    assertSupportedSchemaVersion(message.schemaVersion);
    if (!Number.isSafeInteger(message.sequence) || message.sequence < 0) {
      throw new UnsupportedSchemaError("messages.sequence is invalid");
    }
    if (message.role !== "system" && message.role !== "user" &&
        message.role !== "assistant" && message.role !== "tool") {
      throw new UnsupportedSchemaError("messages.role is invalid");
    }
    this.addOptionalMessageFields(message, row);
    return message;
  }

  private addOptionalMessageFields(message: SessionMessage, row: SqlRow): void {
    if (row.api_content_json !== null && row.api_content_json !== undefined) {
      const content = parseJson(row.api_content_json, "messages.api_content_json");
      if (!isMessageContent(content)) throw new UnsupportedSchemaError("messages.api_content_json is invalid content");
      message.apiContent = content;
    }
    const displayKind = optionalString(row, "display_kind", "messages");
    if (displayKind !== undefined) message.displayKind = displayKind;
    if (row.display_metadata_json !== null && row.display_metadata_json !== undefined) {
      const metadata = parseJson(row.display_metadata_json, "messages.display_metadata_json");
      if (!isJsonObject(metadata)) throw new UnsupportedSchemaError("messages.display_metadata_json is invalid");
      message.displayMetadata = metadata;
    }
    if (row.synthetic !== null && row.synthetic !== undefined) {
      if (row.synthetic !== 0 && row.synthetic !== 1) {
        throw new UnsupportedSchemaError("messages.synthetic is invalid");
      }
      message.synthetic = row.synthetic === 1;
    }
    if (row.context_json !== null && row.context_json !== undefined) {
      const context = parseJson(row.context_json, "messages.context_json");
      if (!isJsonValue(context)) throw new UnsupportedSchemaError("messages.context_json is invalid");
      message.context = context;
    }
    const name = optionalString(row, "name", "messages");
    const toolCallId = optionalString(row, "tool_call_id", "messages");
    const finishReason = optionalString(row, "finish_reason", "messages");
    if (name !== undefined) message.name = name;
    if (toolCallId !== undefined) message.toolCallId = toolCallId;
    if (finishReason !== undefined) {
      const value = finishReasonValue(finishReason);
      if (value === undefined) throw new UnsupportedSchemaError("messages.finish_reason is invalid");
      message.finishReason = value;
    }
    const reasoning = optionalString(row, "reasoning", "messages");
    if (reasoning !== undefined) message.reasoning = reasoning;
    if (row.metadata_json !== null && row.metadata_json !== undefined) {
      const metadata = parseJson(row.metadata_json, "messages.metadata_json");
      if (!isJsonObject(metadata)) throw new UnsupportedSchemaError("messages.metadata_json is invalid");
      message.metadata = metadata;
    }
    if (row.tool_calls_json !== null && row.tool_calls_json !== undefined) {
      const calls = parseJson(row.tool_calls_json, "messages.tool_calls_json");
      if (!Array.isArray(calls) || !calls.every(isToolCall)) {
        throw new UnsupportedSchemaError("messages.tool_calls_json is invalid");
      }
      message.toolCalls = calls;
    }
    if (row.tool_result_json !== null && row.tool_result_json !== undefined) {
      const result = parseJson(row.tool_result_json, "messages.tool_result_json");
      if (!isToolResult(result)) throw new UnsupportedSchemaError("messages.tool_result_json is invalid");
      message.toolResult = result;
    }
    if (row.usage_json !== null && row.usage_json !== undefined) {
      const usage = parseJson(row.usage_json, "messages.usage_json");
      if (!isUsage(usage)) throw new UnsupportedSchemaError("messages.usage_json is invalid");
      message.usage = usage;
    }
  }

  private transactionFor(): PersistenceRepositoryTransaction {
    return {
      appendMessages: async (sessionId, messages, options) => this.appendToDatabase(sessionId, messages, options),
      getSession: async (sessionId) => this.getSessionNow(sessionId),
      listMessages: async (sessionId) => this.listMessagesNow(sessionId),
      listToolCalls: async (sessionId) => this.listToolCallsNow(sessionId),
      listToolResults: async (sessionId) => this.listToolResultsNow(sessionId),
      listUsage: async (sessionId) => this.listUsageNow(sessionId),
      recordUsage: async (usage) => this.recordUsageNow(usage),
      getMigrationState: async (sessionId) => this.getMigrationStateNow(sessionId),
      saveMigrationState: async (state) => this.saveMigrationStateNow(state),
      saveCheckpoint: async (checkpoint) => this.saveCheckpointNow(checkpoint),
      commitTurn: async (write) => this.commitTurnNow(write),
      claimIdempotency: async (claim) => this.claimIdempotencyNow(claim),
      replayIdempotency: async (scope, key, requestHash) => this.replayIdempotencyNow(scope, key, requestHash),
      completeIdempotency: async (completion) => this.completeIdempotencyNow(completion),
      upsertTurn: async (turn) => this.upsertTurnNow(turn),
      recordTerminal: async (terminal) => this.recordTerminalNow(terminal),
      listIncompleteTurns: async (sessionId) => this.listIncompleteTurnsNow(sessionId),
    };
  }

  private appendToDatabase(
    sessionId: string,
    drafts: readonly SessionMessageDraft[],
    options?: AppendMessagesOptions,
  ): AppendMessagesResult {
    this.requireSession(sessionId);
    const existing = this.listMessagesNow(sessionId);
    assertValidSessionMessages(existing, sessionId);
    const nextSequence = existing.length;
    if (options?.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(`Expected next sequence ${options.expectedNextSequence}, actual ${nextSequence}`);
    }
    if (drafts.length === 0) return { messages: [], firstSequence: null, lastSequence: null };
    const ids = new Set(existing.map((message) => message.id));
    const appended: SessionMessage[] = drafts.map((draft, offset) => {
      const id = draft.id ?? `${sessionId}:message:${nextSequence + offset}`;
      if (id.length === 0 || ids.has(id)) throw new Error(`Duplicate message id: ${id}`);
      ids.add(id);
      return copy({ ...draft, schemaVersion: PERSISTENCE_SCHEMA_VERSION, id, sessionId,
        sequence: nextSequence + offset });
    });
    assertValidSessionMessages([...existing, ...appended], sessionId);
    const callIds = new Set(this.listToolCallsNow(sessionId).map((call) => call.id));
    const resultIds = new Set(this.listToolResultsNow(sessionId).map((result) => result.toolCallId));
    for (const message of appended) {
      this.run(
        `INSERT INTO messages
          (id, session_id, schema_version, sequence, role, content_json, created_at, name,
            tool_calls_json, tool_call_id, tool_result_json, finish_reason, usage_json,
            reasoning, metadata_json, api_content_json, display_kind, display_metadata_json, synthetic, context_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        message.id, message.sessionId, message.schemaVersion, message.sequence, message.role,
        json(message.content), message.createdAt, message.name ?? null,
        optionalJson(message.toolCalls), message.toolCallId ?? null, optionalJson(message.toolResult),
         message.finishReason ?? null, optionalJson(message.usage), message.reasoning ?? null,
         optionalJson(message.metadata), optionalJson(message.apiContent),
        message.displayKind ?? null, optionalJson(message.displayMetadata),
        message.synthetic === undefined ? null : message.synthetic ? 1 : 0,
        optionalJson(message.context),
      );
      for (const call of message.toolCalls ?? []) {
        if (callIds.has(call.id)) throw new Error(`Duplicate tool call id: ${call.id}`);
        callIds.add(call.id);
        this.run(
          `INSERT INTO tool_calls
            (id, schema_version, session_id, message_id, sequence, created_at, name, arguments_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          call.id, PERSISTENCE_SCHEMA_VERSION, sessionId, message.id, message.sequence,
          message.createdAt, call.name, json(call.arguments),
        );
      }
      if (message.toolResult !== undefined) {
        if (resultIds.has(message.toolResult.toolCallId)) {
          throw new Error(`Duplicate tool result: ${message.toolResult.toolCallId}`);
        }
        resultIds.add(message.toolResult.toolCallId);
        this.run(
          `INSERT INTO tool_results
            (tool_call_id, schema_version, session_id, message_id, sequence, created_at,
             content_json, is_error, tool_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          message.toolResult.toolCallId, PERSISTENCE_SCHEMA_VERSION, sessionId, message.id,
          message.sequence, message.createdAt, json(message.toolResult.content),
          message.toolResult.isError ? 1 : 0, message.toolResult.toolName ?? null,
        );
      }
    }
    return { messages: copy(appended), firstSequence: appended[0]?.sequence ?? null,
      lastSequence: appended[appended.length - 1]?.sequence ?? null };
  }

  private commitTurnNow(write: AtomicTurnWrite): AppendMessagesResult {
    if (write.sessionId.length === 0) throw new Error("Turn session id must not be empty");
    const result = this.appendToDatabase(write.sessionId, write.messages, {
      ...(write.expectedNextSequence === undefined ? {} : {
        expectedNextSequence: write.expectedNextSequence,
      }),
    });
    const usages = write.usage === undefined ? [] :
      (Array.isArray(write.usage) ? write.usage : [write.usage]);
    for (const usage of usages) {
      if (usage.sessionId !== write.sessionId) throw new Error("Usage session mismatch");
      this.recordUsageNow(usage);
    }
    if (write.checkpoint !== undefined) {
      if (write.checkpoint.sessionId !== write.sessionId) {
        throw new Error("Checkpoint session mismatch");
      }
      this.saveCheckpointNow(write.checkpoint);
    }
    if (write.migrationState !== undefined) {
      if (write.migrationState.sessionId !== write.sessionId) {
        throw new Error("Migration state session mismatch");
      }
      const recovery = write.migrationState.recovery;
      if (recovery?.checkpointId !== undefined && write.checkpoint !== undefined &&
          recovery.checkpointId !== write.checkpoint.id) {
        throw new Error("Recovery checkpoint mismatch");
      }
      if (recovery?.pendingToolCallIds !== undefined) {
        const calls = new Set(this.listToolCallsNow(write.sessionId).map(({ id }) => id));
        const results = new Set(this.listToolResultsNow(write.sessionId).map(({ toolCallId }) => toolCallId));
        for (const id of recovery.pendingToolCallIds) {
          if (!calls.has(id)) throw new Error(`Recovery references unknown tool call: ${id}`);
          if (results.has(id)) throw new Error(`Recovery references completed tool call: ${id}`);
        }
      }
      this.saveMigrationStateNow(write.migrationState);
    }
    return result;
  }

  private getSessionNow(sessionId: string): SessionRecord | null {
    const row = this.query<SqlRow>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    return row === null ? null : this.canonicalSession(row);
  }

  private listMessagesNow(sessionId: string): readonly SessionMessage[] {
    const rows = this.query<SqlRow>(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY sequence ASC",
    ).all(sessionId);
    const messages = rows.map((row) => this.canonicalMessage(row));
    assertValidSessionMessages(messages, sessionId);
    return messages;
  }

  private listToolCallsNow(sessionId: string): readonly ToolCallRecord[] {
    const rows = this.query<SqlRow>(
      "SELECT * FROM tool_calls WHERE session_id = ? ORDER BY sequence ASC, id ASC",
    ).all(sessionId);
    return rows.map((row) => {
      const argumentsValue = parseJson(row.arguments_json, "tool_calls.arguments_json");
      if (typeof argumentsValue !== "string" && !isJsonObject(argumentsValue)) {
        throw new UnsupportedSchemaError("tool_calls.arguments_json is invalid");
      }
      return {
        schemaVersion: Number(row.schema_version) as ToolCallRecord["schemaVersion"],
        id: requiredString(row, "id", "tool_calls"), name: requiredString(row, "name", "tool_calls"),
        arguments: argumentsValue, sessionId: requiredString(row, "session_id", "tool_calls"),
        messageId: requiredString(row, "message_id", "tool_calls"), sequence: Number(row.sequence),
        createdAt: requiredString(row, "created_at", "tool_calls"),
      } satisfies ToolCallRecord;
    });
  }

  private listToolResultsNow(sessionId: string): readonly ToolResultRecord[] {
    const rows = this.query<SqlRow>(
      "SELECT * FROM tool_results WHERE session_id = ? ORDER BY sequence ASC, tool_call_id ASC",
    ).all(sessionId);
    return rows.map((row) => {
      const content = parseJson(row.content_json, "tool_results.content_json");
      if (!isMessageContent(content)) throw new UnsupportedSchemaError("tool_results.content_json is invalid");
      const result: ToolResultRecord = {
        schemaVersion: Number(row.schema_version) as ToolResultRecord["schemaVersion"],
        toolCallId: requiredString(row, "tool_call_id", "tool_results"), content,
        isError: row.is_error === 1, sessionId: requiredString(row, "session_id", "tool_results"),
        messageId: requiredString(row, "message_id", "tool_results"), sequence: Number(row.sequence),
        createdAt: requiredString(row, "created_at", "tool_results"),
      };
      const toolName = optionalString(row, "tool_name", "tool_results");
      if (toolName !== undefined) result.toolName = toolName;
      return result;
    });
  }

  private listUsageNow(sessionId: string): readonly UsageRecord[] {
    const rows = this.query<SqlRow>(
      "SELECT * FROM usages WHERE session_id = ? ORDER BY recorded_at ASC, id ASC",
    ).all(sessionId);
    return rows.map((row) => {
      const usage = parseJson(row.usage_json, "usages.usage_json");
      if (!isUsage(usage)) throw new UnsupportedSchemaError("usages.usage_json is invalid");
      const record: UsageRecord = {
        schemaVersion: Number(row.schema_version) as UsageRecord["schemaVersion"],
        sessionId: requiredString(row, "session_id", "usages"),
        recordedAt: requiredString(row, "recorded_at", "usages"),
        usage,
      };
      assertSupportedSchemaVersion(record.schemaVersion);
      const messageId = optionalString(row, "message_id", "usages");
      if (messageId !== undefined) record.messageId = messageId;
      return record;
    });
  }

  private recordUsageNow(usage: UsageRecord): void {
    this.requireSession(usage.sessionId);
    assertSupportedSchemaVersion(usage.schemaVersion);
    if (!isUsage(usage.usage)) throw new Error("Invalid usage record");
    this.run(
      "INSERT INTO usages (schema_version, session_id, recorded_at, usage_json, message_id) VALUES (?, ?, ?, ?, ?)",
      usage.schemaVersion, usage.sessionId, usage.recordedAt, json(usage.usage), usage.messageId ?? null,
    );
  }

  private validateIdempotencyKey(scope: string, key: string, requestHash: string): void {
    if (scope.length === 0 || key.length === 0 || key.length > 255 || /[^\x00-\x7f]/.test(key)) {
      throw new Error("Invalid idempotency scope or key");
    }
    if (!/^[0-9a-f]+$/.test(requestHash)) throw new Error("Invalid idempotency request hash");
  }

  private idempotencyRecord(row: SqlRow): IdempotencyRecord {
    const state = requiredString(row, "state", "idempotency");
    if (state !== "pending" && state !== "completed" && state !== "failed") {
      throw new UnsupportedSchemaError("idempotency.state is invalid");
    }
    const statusCode = Number(row.status_code);
    if (!Number.isSafeInteger(statusCode) || statusCode <= 0) {
      throw new UnsupportedSchemaError("idempotency.status_code is invalid");
    }
    const record: IdempotencyRecord = {
      schemaVersion: Number(row.schema_version) as IdempotencyRecord["schemaVersion"],
      scope: requiredString(row, "scope", "idempotency"),
      key: requiredString(row, "key", "idempotency"),
      requestHash: requiredString(row, "request_hash", "idempotency"),
      state,
      statusCode,
      createdAt: requiredString(row, "created_at", "idempotency"),
      expiresAt: requiredString(row, "expires_at", "idempotency"),
    };
    if (Number.isNaN(Date.parse(record.createdAt)) || Number.isNaN(Date.parse(record.expiresAt))) {
      throw new UnsupportedSchemaError("idempotency timestamps are invalid");
    }
    const response = row.response_json;
    if (state === "pending") {
      if (response !== null && response !== undefined) {
        throw new UnsupportedSchemaError("pending idempotency record has a response");
      }
    } else {
      const parsed = parseJson(response, "idempotency.response_json");
      if (!isJsonValue(parsed)) throw new UnsupportedSchemaError("idempotency.response_json is invalid");
      record.response = parsed;
    }
    assertSupportedSchemaVersion(record.schemaVersion);
    return record;
  }

  private replayIdempotencyNow(scope: string, key: string, requestHash: string): IdempotencyLookup {
    this.validateIdempotencyKey(scope, key, requestHash);
    const row = this.query<SqlRow>(
      "SELECT * FROM idempotency WHERE scope = ? AND key = ?",
    ).get(scope, key);
    if (row === null) return { status: "missing" };
    const record = this.idempotencyRecord(row);
    if (Date.parse(record.expiresAt) <= Date.now()) {
      this.run("DELETE FROM idempotency WHERE scope = ? AND key = ?", scope, key);
      return { status: "missing" };
    }
    if (record.requestHash !== requestHash) return { status: "mismatch", record: copy(record) };
    if (record.state === "pending") return { status: "in_progress", record: copy(record) };
    if (record.response === undefined) throw new UnsupportedSchemaError("idempotency response is missing");
    return { status: "replay", record: copy(record), response: copy(record.response) };
  }

  private claimIdempotencyNow(claim: IdempotencyClaim): IdempotencyClaimResult {
    this.validateIdempotencyKey(claim.scope, claim.key, claim.requestHash);
    if (Number.isNaN(Date.parse(claim.createdAt)) || Number.isNaN(Date.parse(claim.expiresAt)) ||
        Date.parse(claim.expiresAt) <= Date.parse(claim.createdAt)) {
      throw new Error("Invalid idempotency timestamps");
    }
    const existing = this.replayIdempotencyNow(claim.scope, claim.key, claim.requestHash);
    if (existing.status !== "missing") return existing;
    this.run(
      `INSERT INTO idempotency
        (schema_version, scope, key, request_hash, state, status_code, response_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'pending', 102, NULL, ?, ?)`,
      PERSISTENCE_SCHEMA_VERSION, claim.scope, claim.key, claim.requestHash, claim.createdAt, claim.expiresAt,
    );
    const row = this.query<SqlRow>(
      "SELECT * FROM idempotency WHERE scope = ? AND key = ?",
    ).get(claim.scope, claim.key);
    if (row === null) throw new Error("Idempotency claim disappeared");
    return { status: "claimed", record: this.idempotencyRecord(row) };
  }

  private completeIdempotencyNow(completion: IdempotencyCompletion): void {
    this.validateIdempotencyKey(completion.scope, completion.key, completion.requestHash);
    if (completion.state !== "completed" && completion.state !== "failed") {
      throw new Error("Invalid idempotency completion state");
    }
    if (!Number.isSafeInteger(completion.statusCode) || completion.statusCode <= 0 ||
        !isJsonValue(completion.response)) {
      throw new Error("Invalid idempotency completion");
    }
    const row = this.query<SqlRow>(
      "SELECT * FROM idempotency WHERE scope = ? AND key = ?",
    ).get(completion.scope, completion.key);
    if (row === null) throw new Error("Idempotency claim not found");
    const record = this.idempotencyRecord(row);
    if (record.requestHash !== completion.requestHash) throw new IdempotencyMismatchError();
    if (record.state !== "pending") {
      if (record.state !== completion.state || record.statusCode !== completion.statusCode ||
          JSON.stringify(record.response) !== JSON.stringify(completion.response)) {
        throw new Error("Idempotency record is already terminal");
      }
      return;
    }
    this.run(
      `UPDATE idempotency SET state = ?, status_code = ?, response_json = ?
       WHERE scope = ? AND key = ? AND request_hash = ? AND state = 'pending'`,
      completion.state, completion.statusCode, json(completion.response), completion.scope,
      completion.key, completion.requestHash,
    );
  }

  private turnRecord(row: SqlRow): TurnRecord {
    const status = requiredString(row, "status", "turns");
    if (status !== "running" && status !== "interrupted" && status !== "recoverable") {
      throw new UnsupportedSchemaError("turns.status is terminal or invalid");
    }
    const turn: TurnRecord = {
      schemaVersion: Number(row.schema_version) as TurnRecord["schemaVersion"],
      id: requiredString(row, "id", "turns"),
      sessionId: requiredString(row, "session_id", "turns"),
      status,
      startedAt: requiredString(row, "started_at", "turns"),
      updatedAt: requiredString(row, "updated_at", "turns"),
    };
    assertSupportedSchemaVersion(turn.schemaVersion);
    if (Number.isNaN(Date.parse(turn.startedAt)) || Number.isNaN(Date.parse(turn.updatedAt))) {
      throw new UnsupportedSchemaError("turn timestamps are invalid");
    }
    if (row.recovery_json !== null && row.recovery_json !== undefined) {
      const recovery = parseJson(row.recovery_json, "turns.recovery_json");
      if (!isRecovery(recovery) || (recovery as { turnId: string }).turnId !== turn.id ||
          (recovery as { status: string }).status !== turn.status) {
        throw new UnsupportedSchemaError("turns.recovery_json is invalid");
      }
      turn.recovery = recovery as NonNullable<TurnRecord["recovery"]>;
    }
    return turn;
  }

  private upsertTurnNow(turn: TurnRecord): void {
    this.requireSession(turn.sessionId);
    assertSupportedSchemaVersion(turn.schemaVersion);
    if (turn.id.length === 0 || Number.isNaN(Date.parse(turn.startedAt)) ||
        Number.isNaN(Date.parse(turn.updatedAt))) throw new Error("Invalid turn metadata");
    if (turn.status !== "running" && turn.status !== "interrupted" && turn.status !== "recoverable") {
      throw new Error("Turn must be incomplete");
    }
    if (turn.recovery !== undefined &&
        (!isRecovery(turn.recovery) || turn.recovery.turnId !== turn.id || turn.recovery.status !== turn.status)) {
      throw new Error("Invalid turn recovery state");
    }
    if (turn.recovery?.checkpointId !== undefined &&
        this.getCheckpointNow(turn.sessionId, turn.recovery.checkpointId) === null) {
      throw new Error(`Recovery references unknown checkpoint: ${turn.recovery.checkpointId}`);
    }
    const existing = this.query<SqlRow>("SELECT * FROM turns WHERE id = ?").get(turn.id);
    if (existing !== null && requiredString(existing, "session_id", "turns") !== turn.sessionId) {
      throw new Error("Turn session mismatch");
    }
    if (this.query<{ turn_id: string }>("SELECT turn_id FROM turn_terminals WHERE turn_id = ?").get(turn.id) !== null) {
      throw new Error("Turn already has a terminal result");
    }
    this.run(
      `INSERT INTO turns (id, session_id, schema_version, status, started_at, updated_at, recovery_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version,
       status = excluded.status, started_at = excluded.started_at,
       updated_at = excluded.updated_at, recovery_json = excluded.recovery_json`,
      turn.id, turn.sessionId, turn.schemaVersion, turn.status, turn.startedAt, turn.updatedAt,
      turn.recovery === undefined ? null : json(turn.recovery),
    );
  }

  private terminalRecord(row: SqlRow): TurnTerminalRecord {
    const status = requiredString(row, "status", "turn_terminals") as TurnTerminalStatus;
    if (status !== "completed" && status !== "failed" && status !== "cancelled" && status !== "budget_exhausted" &&
        status !== "provider_failed" && status !== "tool_failed" && status !== "approval_rejected") {
      throw new UnsupportedSchemaError("turn_terminals.status is invalid");
    }
    const terminal: TurnTerminalRecord = {
      schemaVersion: Number(row.schema_version) as TurnTerminalRecord["schemaVersion"],
      turnId: requiredString(row, "turn_id", "turn_terminals"),
      sessionId: requiredString(row, "session_id", "turn_terminals"),
      status,
      completedAt: requiredString(row, "completed_at", "turn_terminals"),
    };
    assertSupportedSchemaVersion(terminal.schemaVersion);
    if (Number.isNaN(Date.parse(terminal.completedAt))) throw new UnsupportedSchemaError("terminal timestamp is invalid");
    if (row.result_json !== null && row.result_json !== undefined) {
      const result = parseJson(row.result_json, "turn_terminals.result_json");
      if (!isJsonObject(result)) throw new UnsupportedSchemaError("turn_terminals.result_json is invalid");
      terminal.result = result;
    }
    return terminal;
  }

  private recordTerminalNow(terminal: TurnTerminalRecord): TerminalWriteResult {
    this.requireSession(terminal.sessionId);
    assertSupportedSchemaVersion(terminal.schemaVersion);
    if (terminal.turnId.length === 0 || Number.isNaN(Date.parse(terminal.completedAt)) ||
        (terminal.result !== undefined && !isJsonObject(terminal.result))) {
      throw new Error("Invalid terminal record");
    }
    const turn = this.query<SqlRow>("SELECT * FROM turns WHERE id = ?").get(terminal.turnId);
    if (turn === null) throw new Error("Turn not found");
    if (requiredString(turn, "session_id", "turns") !== terminal.sessionId) throw new Error("Turn session mismatch");
    const existingRow = this.query<SqlRow>("SELECT * FROM turn_terminals WHERE turn_id = ?").get(terminal.turnId);
    if (existingRow !== null) {
      const existing = this.terminalRecord(existingRow);
      const same = existing.status === terminal.status &&
        JSON.stringify(existing.result) === JSON.stringify(terminal.result);
      return { status: same ? "already_recorded" : "mismatch", terminal: copy(existing) };
    }
    this.run(
      `INSERT INTO turn_terminals
        (turn_id, session_id, schema_version, status, completed_at, result_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      terminal.turnId, terminal.sessionId, terminal.schemaVersion, terminal.status,
      terminal.completedAt, terminal.result === undefined ? null : json(terminal.result),
    );
    this.run("UPDATE turns SET status = ?, updated_at = ? WHERE id = ?", terminal.status, terminal.completedAt, terminal.turnId);
    return { status: "recorded", terminal: copy(terminal) };
  }

  private listIncompleteTurnsNow(sessionId?: string): readonly TurnRecord[] {
    const rows = sessionId === undefined
      ? this.query<SqlRow>("SELECT * FROM turns WHERE status IN ('running', 'interrupted', 'recoverable') ORDER BY updated_at ASC, id ASC").all()
      : this.query<SqlRow>("SELECT * FROM turns WHERE session_id = ? AND status IN ('running', 'interrupted', 'recoverable') ORDER BY updated_at ASC, id ASC").all(sessionId);
    return rows.map((row) => this.turnRecord(row));
  }

  private getMigrationStateNow(sessionId: string): MigrationStateRecord | null {
    const row = this.query<SqlRow>("SELECT * FROM migration WHERE session_id = ?").get(sessionId);
    if (row === null) return null;
    const state: MigrationStateRecord = {
      schemaVersion: Number(row.schema_version) as MigrationStateRecord["schemaVersion"],
      sessionId: requiredString(row, "session_id", "migration"), updatedAt: requiredString(row, "updated_at", "migration"),
      runtime: this.jsonRuntime(row.runtime_json, "migration.runtime_json"),
    };
    assertSupportedSchemaVersion(state.schemaVersion);
    if (row.recovery_json !== null && row.recovery_json !== undefined) {
      const recovery = parseJson(row.recovery_json, "migration.recovery_json");
      if (!isRecovery(recovery)) throw new UnsupportedSchemaError("migration.recovery_json is invalid");
      state.recovery = recovery as NonNullable<MigrationStateRecord["recovery"]>;
    }
    return state;
  }

  private saveMigrationStateNow(state: MigrationStateRecord): void {
    this.requireSession(state.sessionId);
    assertSupportedSchemaVersion(state.schemaVersion);
    if (!isRuntime(state.runtime)) throw new Error("Invalid migration runtime metadata");
    if (state.recovery !== undefined && !isRecovery(state.recovery)) {
      throw new Error("Invalid turn recovery state");
    }
    if (state.recovery?.checkpointId !== undefined &&
        this.getCheckpointNow(state.sessionId, state.recovery.checkpointId) === null) {
      throw new Error(`Recovery references unknown checkpoint: ${state.recovery.checkpointId}`);
    }
    this.run(
      `INSERT INTO migration (session_id, schema_version, updated_at, runtime_json, recovery_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET schema_version = excluded.schema_version,
       updated_at = excluded.updated_at, runtime_json = excluded.runtime_json,
       recovery_json = excluded.recovery_json`,
      state.sessionId, state.schemaVersion, state.updatedAt, json(state.runtime),
      state.recovery === undefined ? null : json(state.recovery),
    );
  }

  private saveCheckpointNow(checkpoint: CheckpointRecord): void {
    this.requireSession(checkpoint.sessionId);
    assertSupportedSchemaVersion(checkpoint.schemaVersion);
    if (checkpoint.id.length === 0 || Number.isNaN(Date.parse(checkpoint.createdAt))) {
      throw new Error("Invalid checkpoint metadata");
    }
    if (!isRuntime(checkpoint.runtime)) throw new Error("Invalid checkpoint runtime metadata");
    if (!isJsonObject(checkpoint.snapshot)) throw new Error("Invalid checkpoint snapshot");
    if (!Number.isSafeInteger(checkpoint.messageSequence) || checkpoint.messageSequence < 0 ||
        (checkpoint.reason !== "manual" && checkpoint.reason !== "turn" &&
         checkpoint.reason !== "before-tool" && checkpoint.reason !== "migration")) {
      throw new Error("Invalid checkpoint");
    }
    if (checkpoint.formatVersion !== undefined &&
        checkpoint.formatVersion !== CHECKPOINT_FORMAT_VERSION) {
      throw new Error("Invalid checkpoint format version");
    }
    if (checkpoint.messageSequence > this.listMessagesNow(checkpoint.sessionId).length) {
      throw new Error("Checkpoint references a future message sequence");
    }
    this.run(
      `INSERT INTO checkpoints
        (id, session_id, schema_version, message_sequence, created_at, reason, runtime_json, snapshot_json,
         format_version, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id,
       schema_version = excluded.schema_version, message_sequence = excluded.message_sequence,
       created_at = excluded.created_at, reason = excluded.reason, runtime_json = excluded.runtime_json,
       snapshot_json = excluded.snapshot_json, format_version = excluded.format_version,
       label = excluded.label`,
      checkpoint.id, checkpoint.sessionId, checkpoint.schemaVersion, checkpoint.messageSequence,
      checkpoint.createdAt, checkpoint.reason, json(checkpoint.runtime), json(checkpoint.snapshot),
      checkpoint.formatVersion ?? CHECKPOINT_FORMAT_VERSION, checkpoint.label ?? null,
    );
  }

  private beginTransaction(): void {
    this.db.exec("BEGIN IMMEDIATE");
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.transaction(async (transaction) => {
      assertSupportedSchemaVersion(session.schemaVersion);
      if (!isRuntime(session.runtime)) throw new Error("Invalid session runtime metadata");
      this.run(
        `INSERT INTO sessions
          (id, schema_version, workspace_id, status, created_at, updated_at, runtime_json, title, model, provider, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        session.id, session.schemaVersion, session.workspaceId, session.status, session.createdAt,
        session.updatedAt, json(session.runtime), session.title ?? null, session.model ?? null,
        session.provider ?? null, optionalJson(session.metadata),
      );
      await transaction.getSession(session.id);
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.runExclusive(() => this.getSessionNow(sessionId));
  }

  async appendMessages(sessionId: string, messages: readonly SessionMessageDraft[], options?: AppendMessagesOptions): Promise<AppendMessagesResult> {
    return this.transaction((transaction) => transaction.appendMessages(sessionId, messages, options));
  }

  async listMessages(sessionId: string): Promise<readonly SessionMessage[]> {
    return this.runExclusive(() => this.listMessagesNow(sessionId));
  }

  async listToolCalls(sessionId: string): Promise<readonly ToolCallRecord[]> {
    return this.runExclusive(() => this.listToolCallsNow(sessionId));
  }

  async listToolResults(sessionId: string): Promise<readonly ToolResultRecord[]> {
    return this.runExclusive(() => this.listToolResultsNow(sessionId));
  }

  async listUsage(sessionId: string): Promise<readonly UsageRecord[]> {
    return this.runExclusive(() => this.listUsageNow(sessionId));
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    await this.transaction(async (transaction) => transaction.recordUsage(usage));
  }

  async getMigrationState(sessionId: string): Promise<MigrationStateRecord | null> {
    return this.runExclusive(() => this.getMigrationStateNow(sessionId));
  }

  async saveMigrationState(state: MigrationStateRecord): Promise<void> {
    await this.transaction(async (transaction) => transaction.saveMigrationState(state));
  }

  async saveCheckpoint(checkpoint: CheckpointRecord): Promise<void> {
    await this.transaction(async (transaction) => transaction.saveCheckpoint(checkpoint));
  }

  async commitTurn(write: AtomicTurnWrite): Promise<AppendMessagesResult> {
    return this.transaction((transaction) => transaction.commitTurn(write));
  }

  async claimIdempotency(claim: IdempotencyClaim): Promise<IdempotencyClaimResult> {
    return this.transaction((transaction) => transaction.claimIdempotency(claim));
  }

  async replayIdempotency(scope: string, key: string, requestHash: string): Promise<IdempotencyLookup> {
    return this.runExclusive(() => this.replayIdempotencyNow(scope, key, requestHash));
  }

  async completeIdempotency(completion: IdempotencyCompletion): Promise<void> {
    await this.transaction((transaction) => transaction.completeIdempotency(completion));
  }

  async upsertTurn(turn: TurnRecord): Promise<void> {
    await this.transaction((transaction) => transaction.upsertTurn(turn));
  }

  async recordTerminal(terminal: TurnTerminalRecord): Promise<TerminalWriteResult> {
    return this.transaction((transaction) => transaction.recordTerminal(terminal));
  }

  async listIncompleteTurns(sessionId?: string): Promise<readonly TurnRecord[]> {
    return this.runExclusive(() => this.listIncompleteTurnsNow(sessionId));
  }

  private getCheckpointNow(sessionId: string, checkpointId: string): CheckpointRecord | null {
    const row = this.query<SqlRow>(
      "SELECT * FROM checkpoints WHERE session_id = ? AND id = ?",
    ).get(sessionId, checkpointId);
    if (row === null) return null;
    const snapshot = parseJson(row.snapshot_json, "checkpoints.snapshot_json");
    if (!isJsonObject(snapshot)) throw new UnsupportedSchemaError("checkpoints.snapshot_json is invalid");
    const checkpoint: CheckpointRecord = {
      schemaVersion: Number(row.schema_version) as CheckpointRecord["schemaVersion"],
      id: requiredString(row, "id", "checkpoints"), sessionId: requiredString(row, "session_id", "checkpoints"),
      messageSequence: Number(row.message_sequence), createdAt: requiredString(row, "created_at", "checkpoints"),
      reason: requiredString(row, "reason", "checkpoints") as CheckpointRecord["reason"],
      runtime: this.jsonRuntime(row.runtime_json, "checkpoints.runtime_json"), snapshot,
    };
    assertSupportedSchemaVersion(checkpoint.schemaVersion);
    if (!Number.isSafeInteger(checkpoint.messageSequence) || checkpoint.messageSequence < 0) {
      throw new UnsupportedSchemaError("checkpoints.message_sequence is invalid");
    }
    if (Number.isNaN(Date.parse(checkpoint.createdAt)) ||
        checkpoint.messageSequence > this.listMessagesNow(sessionId).length) {
      throw new UnsupportedSchemaError("checkpoints metadata is invalid");
    }
    if (!isCheckpointReason(checkpoint.reason)) {
      throw new UnsupportedSchemaError("checkpoints.reason is invalid");
    }
    const formatVersion = Number(row.format_version);
    if (formatVersion !== CHECKPOINT_FORMAT_VERSION) {
      throw new UnsupportedSchemaError("checkpoints.format_version is invalid");
    }
    checkpoint.formatVersion = formatVersion;
    const label = optionalString(row, "label", "checkpoints");
    if (label !== undefined) checkpoint.label = label;
    return checkpoint;
  }

  async getCheckpoint(sessionId: string, checkpointId: string): Promise<CheckpointRecord | null> {
    return this.runExclusive(() => this.getCheckpointNow(sessionId, checkpointId));
  }

  async listCheckpoints(sessionId: string): Promise<readonly CheckpointRecord[]> {
    return this.runExclusive(() => {
      const rows = this.query<SqlRow>(
        "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at ASC, id ASC",
      ).all(sessionId);
      return rows.map((row) => {
        const id = requiredString(row, "id", "checkpoints");
        const checkpoint = this.getCheckpointNow(sessionId, id);
        if (checkpoint === null) throw new UnsupportedSchemaError("checkpoint disappeared during read");
        return checkpoint;
      });
    });
  }

  async transaction<T>(operation: (transaction: PersistenceRepositoryTransaction) => Promise<T>): Promise<T> {
    return this.runExclusive(async () => {
      this.beginTransaction();
      try {
        const result = await operation(this.transactionFor());
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Preserve original operation error; SQLite remains usable after rollback failure only rarely.
        }
        throw error;
      }
    });
  }
}

export { SQLiteSessionRepository as SqliteSessionRepository };
