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
  JsonObject,
  JsonValue,
  MessageContent,
  MigrationStateRecord,
  RuntimeMigrationMetadata,
  SessionMessage,
  SessionMessageDraft,
  SessionRecord,
  SessionRepository,
  SessionRepositoryTransaction,
  ToolCall,
  ToolCallRecord,
  ToolResult,
  ToolResultRecord,
  Usage,
  UsageRecord,
} from "./contracts.js";

type SqlValue = string | number | null | undefined;
type SqlBinding = string | number | null;
type SqlRow = Record<string, SqlValue>;

const LEGACY_PYTHON_SCHEMA_VERSION = 25;

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

function timestamp(value: SqlValue, label: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const result = new Date(value * 1000);
    if (!Number.isNaN(result.valueOf())) return result.toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  throw new UnsupportedSchemaError(`${label} must be a timestamp`);
}

function legacyJson(value: SqlValue): unknown {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function legacyContent(row: SqlRow): MessageContent {
  const raw = row.content ?? row.api_content;
  if (typeof raw !== "string") return "";
  const decoded = legacyJson(raw);
  return decoded !== undefined && isMessageContent(decoded) ? decoded : raw;
}

function legacyMessageContent(value: SqlValue): MessageContent | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = legacyJson(value);
  return decoded !== undefined && isMessageContent(decoded) ? decoded : value;
}

function legacyJsonObject(value: SqlValue): JsonObject | undefined {
  const decoded = legacyJson(value);
  return isJsonObject(decoded) ? decoded : undefined;
}

function legacyJsonValue(value: SqlValue): JsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const decoded = legacyJson(value);
  return decoded !== undefined && isJsonValue(decoded) ? decoded :
    (typeof value === "string" ? value : undefined);
}

function legacyBoolean(value: SqlValue): boolean | undefined {
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  return undefined;
}

function legacyToolCalls(row: SqlRow): readonly ToolCall[] | undefined {
  const decoded = legacyJson(row.tool_calls);
  if (!Array.isArray(decoded)) return undefined;
  const calls = decoded.map((value): ToolCall | null => {
    if (isToolCall(value)) return value;
    if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 ||
        !isRecord(value.function) || typeof value.function.name !== "string" ||
        value.function.name.length === 0 ||
        (typeof value.function.arguments !== "string" && !isJsonObject(value.function.arguments))) {
      return null;
    }
    return {
      id: value.id,
      name: value.function.name,
      arguments: value.function.arguments,
    };
  });
  return calls.every((call): call is ToolCall => call !== null) ? calls : undefined;
}

function isCheckpointReason(value: unknown): value is CheckpointRecord["reason"] {
  return value === "manual" || value === "turn" || value === "before-tool" || value === "migration";
}

function legacyFinishReason(value: SqlValue): SessionMessage["finishReason"] | undefined {
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
CREATE INDEX IF NOT EXISTS idx_data_layer_tool_calls_session_sequence
  ON tool_calls(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_data_layer_tool_results_session_sequence
  ON tool_results(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_data_layer_usages_session_recorded
  ON usages(session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_data_layer_checkpoints_session_created
  ON checkpoints(session_id, created_at);
`;

type StorageMode = "canonical" | "legacy";

export class SQLiteSessionRepository implements SessionRepository {
  private readonly db: Database;
  private readonly runtimeVersion: string;
  private readonly mode: StorageMode;
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
    this.mode = this.initializeSchema();
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

  private tableExists(table: "sessions" | "messages" | "schema_version"): boolean {
    const row = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table);
    return row !== null;
  }

  private columns(table: "sessions" | "messages"): Set<string> {
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

  private initializeSchema(): StorageMode {
    const hasSessions = this.tableExists("sessions");
    const hasMessages = this.tableExists("messages");
    if (!hasSessions && !hasMessages) {
      this.db.exec(CORE_SCHEMA);
      this.db.exec(AUXILIARY_SCHEMA);
      this.run("INSERT INTO schema_version (version) VALUES (?)", PERSISTENCE_SCHEMA_VERSION);
      return "canonical";
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
      this.ensureCanonicalColumns();
      this.db.exec(AUXILIARY_SCHEMA);
      this.ensureAuxiliaryColumns();
      if (version === null) {
        this.db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
        this.run("INSERT INTO schema_version (version) VALUES (?)", PERSISTENCE_SCHEMA_VERSION);
      }
      return "canonical";
    }

    const legacy = ["id", "role", "session_id", "timestamp"].every((column) =>
      sessionColumns.has(column) || messageColumns.has(column));
    if (!legacy || !messageColumns.has("session_id") || !messageColumns.has("role") ||
        !messageColumns.has("timestamp") || !sessionColumns.has("id") ||
        !sessionColumns.has("started_at")) {
      throw new UnsupportedSchemaError(
        "sessions/messages are neither contract-native nor a supported Python shape",
      );
    }
    const version = this.schemaVersion();
    if (version !== null && (version < 0 || version > LEGACY_PYTHON_SCHEMA_VERSION)) {
      throw new UnsupportedSchemaError(`legacy Python schema version ${String(version)}`);
    }
    // Never alter legacy sessions/messages. These tables are read-only compatibility input.
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
    this.db.exec(AUXILIARY_SCHEMA);
    this.ensureAuxiliaryColumns();
    return "legacy";
  }

  private runExclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  private assertWritable(): void {
    if (this.mode === "legacy") {
      throw new UnsupportedSchemaError(
        "Python sessions/messages are readable only; contract-native writes require a migrated database",
      );
    }
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
      const value = legacyFinishReason(finishReason);
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

  private legacySession(row: SqlRow): SessionRecord {
    const id = requiredString(row, "id", "sessions");
    const endedAt = row.ended_at;
    const endReason = optionalString(row, "end_reason", "sessions");
    let status: SessionRecord["status"] = endedAt === null || endedAt === undefined ? "active" : "completed";
    if (endReason === "cancelled") status = "cancelled";
    else if (endReason === "failed" || endReason === "error") status = "failed";
    const createdAt = timestamp(row.started_at, "sessions.started_at");
    const updatedAt = timestamp(row.last_activity_at ?? endedAt ?? row.started_at, "sessions.updated_at");
    const runtime: RuntimeMigrationMetadata = {
      runtimeVersion: "python-legacy",
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    };
    const legacyVersion = this.schemaVersion();
    if (legacyVersion !== null) runtime.migratedFromSchemaVersion = legacyVersion;
    const workspaceId = optionalString(row, "workspace_id", "sessions") ??
      optionalString(row, "source", "sessions") ?? "legacy";
    const session: SessionRecord = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id,
      workspaceId,
      status,
      createdAt,
      updatedAt,
      runtime,
    };
    const title = optionalString(row, "title", "sessions");
    const model = optionalString(row, "model", "sessions");
    const provider = optionalString(row, "billing_provider", "sessions");
    if (title !== undefined) session.title = title;
    if (model !== undefined) session.model = model;
    if (provider !== undefined) session.provider = provider;
    const metadata = legacyJson(row.origin_json);
    if (isJsonObject(metadata)) session.metadata = metadata;
    return session;
  }

  private legacyMessage(row: SqlRow, sessionId: string, sequence: number): SessionMessage | null {
    const role = row.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return null;
    const id = row.id;
    if (typeof id !== "string" && typeof id !== "number") return null;
    const toolCallId = typeof row.tool_call_id === "string" && row.tool_call_id.length > 0
      ? row.tool_call_id : undefined;
    const message: SessionMessage = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: String(id),
      sessionId,
      sequence,
      role,
      content: legacyContent(row),
      createdAt: timestamp(row.timestamp, "messages.timestamp"),
    };
    const apiContent = legacyMessageContent(row.api_content);
    if (apiContent !== undefined && row.content !== null && row.content !== undefined) {
      message.apiContent = apiContent;
    }
    const displayKind = optionalString(row, "display_kind", "messages");
    if (displayKind !== undefined) message.displayKind = displayKind;
    const displayMetadata = legacyJsonObject(row.display_metadata);
    if (displayMetadata !== undefined) message.displayMetadata = displayMetadata;
    const synthetic = legacyBoolean(row.synthetic);
    if (synthetic !== undefined) message.synthetic = synthetic;
    const context = legacyJsonValue(row.context);
    if (context !== undefined) message.context = context;
    if (toolCallId !== undefined) {
      message.toolCallId = toolCallId;
      const toolResult: ToolResult = {
        toolCallId,
        content: legacyContent(row),
        isError: row.effect_disposition === "error",
      };
      if (typeof row.tool_name === "string") toolResult.toolName = row.tool_name;
      message.toolResult = toolResult;
    }
    const calls = legacyToolCalls(row);
    if (calls !== undefined) message.toolCalls = calls;
    const name = typeof row.tool_name === "string" ? row.tool_name : undefined;
    if (name !== undefined && role !== "tool") message.name = name;
    const finishReason = legacyFinishReason(row.finish_reason);
    if (finishReason !== undefined) message.finishReason = finishReason;
    return message;
  }

  private transactionFor(): SessionRepositoryTransaction {
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
    };
  }

  private appendToDatabase(
    sessionId: string,
    drafts: readonly SessionMessageDraft[],
    options?: AppendMessagesOptions,
  ): AppendMessagesResult {
    if (drafts.length > 0) this.assertWritable();
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
    if (this.mode === "legacy") {
      const row = this.query<SqlRow>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
      return row === null ? null : this.legacySession(row);
    }
    const row = this.query<SqlRow>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    return row === null ? null : this.canonicalSession(row);
  }

  private listMessagesNow(sessionId: string): readonly SessionMessage[] {
    if (this.mode === "legacy") {
      const rows = this.query<SqlRow>(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC",
      ).all(sessionId);
      const messages = rows.map((row, index) => this.legacyMessage(row, sessionId, index))
        .filter((message): message is SessionMessage => message !== null);
      assertValidSessionMessages(messages, sessionId);
      return messages;
    }
    const rows = this.query<SqlRow>(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY sequence ASC",
    ).all(sessionId);
    const messages = rows.map((row) => this.canonicalMessage(row));
    assertValidSessionMessages(messages, sessionId);
    return messages;
  }

  private listToolCallsNow(sessionId: string): readonly ToolCallRecord[] {
    if (this.mode === "legacy") {
      return this.listMessagesNow(sessionId).flatMap((message) => (message.toolCalls ?? []).map((call) => ({
        ...call, schemaVersion: PERSISTENCE_SCHEMA_VERSION, sessionId, messageId: message.id,
        sequence: message.sequence, createdAt: message.createdAt,
      })));
    }
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
    if (this.mode === "legacy") {
      return this.listMessagesNow(sessionId).flatMap((message) => message.toolResult === undefined ? [] : [{
        ...message.toolResult, schemaVersion: PERSISTENCE_SCHEMA_VERSION, sessionId,
        messageId: message.id, sequence: message.sequence, createdAt: message.createdAt,
      }]);
    }
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
      this.assertWritable();
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

  async transaction<T>(operation: (transaction: SessionRepositoryTransaction) => Promise<T>): Promise<T> {
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
