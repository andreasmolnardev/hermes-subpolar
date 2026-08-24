import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database, type Statement } from "bun:sqlite";
import {
  CHECKPOINT_FORMAT_VERSION,
  PERSISTENCE_SCHEMA_VERSION,
  IdempotencyConflictError,
  assertSupportedSchemaVersion,
  assertValidSessionMessages,
  isMessageContent,
} from "./contracts.js";
import type {
  AppendMessagesOptions,
  AppendMessagesResult,
  AtomicTurnWrite,
  CheckpointRecord,
  ApprovalDecision,
  IdempotencyClaim,
  IdempotencyRecord,
  JsonObject,
  JsonValue,
  MigrationStateRecord,
  PendingApprovalRecord,
  RetentionPruneResult,
  RuntimeMigrationMetadata,
  SessionMessage,
  SessionMessageDraft,
  SessionRecord,
  SessionStatus,
  SessionRepository,
  SessionRepositoryTransaction,
  ToolCall,
  ToolCallRecord,
  ToolResult,
  ToolResultRecord,
  Usage,
  UsageRecord,
} from "./contracts.js";
import {
  normalizePersistenceRedactionPolicy,
  redactCheckpoint,
  redactJsonValue,
  redactPendingApproval,
  redactSessionMessage,
  type PersistenceRedactionPolicy,
  type PersistenceRedactionPolicyInput,
} from "./redaction.js";

type SqlValue = string | number | null | undefined;
type SqlBinding = string | number | null;
type SqlRow = Record<string, SqlValue>;

export type SQLiteSessionRepositoryOptions = {
  path: string;
  runtimeVersion?: string;
  idempotencyRetentionMs?: number;
  approvalRetentionMs?: number;
  maxIdempotencyRecords?: number;
  maxApprovalRecords?: number;
  redactionPolicy?: PersistenceRedactionPolicyInput;
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

function isCheckpointReason(value: unknown): value is CheckpointRecord["reason"] {
  return value === "manual" || value === "turn" || value === "before-tool" || value === "migration";
}

function parseFinishReason(value: SqlValue): SessionMessage["finishReason"] | undefined {
  return value === "stop" || value === "length" || value === "tool_calls" ||
    value === "content_filter" || value === "error" ? value : undefined;
}

const CORE_SCHEMA = `
CREATE TABLE data_layer_schema (
  marker TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
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
CREATE TABLE messages (
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
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  arguments_json TEXT NOT NULL
);
CREATE TABLE tool_results (
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
CREATE TABLE usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  message_id TEXT
);
CREATE TABLE migration (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  runtime_json TEXT NOT NULL,
  recovery_json TEXT
);
CREATE TABLE checkpoints (
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
CREATE TABLE idempotency_records (
  request_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  terminal_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK ((status = 'pending' AND terminal_payload_json IS NULL AND completed_at IS NULL) OR
         (status = 'completed' AND terminal_payload_json IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX idx_data_layer_idempotency_updated
  ON idempotency_records(updated_at);
CREATE TABLE pending_approvals (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'allowed', 'denied')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(session_id, call_id),
  CHECK ((status = 'pending' AND resolved_at IS NULL) OR
         (status IN ('allowed', 'denied') AND resolved_at IS NOT NULL))
);
CREATE INDEX idx_data_layer_approvals_session_status
  ON pending_approvals(session_id, status, updated_at);
`;

export class SQLiteSessionRepository implements SessionRepository {
  private readonly db: Database;
  private readonly runtimeVersion: string;
  private readonly idempotencyRetentionMs: number;
  private readonly approvalRetentionMs: number;
  private readonly maxIdempotencyRecords: number;
  private readonly maxApprovalRecords: number;
  private readonly redactionPolicy: PersistenceRedactionPolicy;
  private queue = Promise.resolve();

  constructor(path: string);
  constructor(options: SQLiteSessionRepositoryOptions);
  constructor(pathOrOptions: string | SQLiteSessionRepositoryOptions) {
    const path = typeof pathOrOptions === "string" ? pathOrOptions : pathOrOptions.path;
    this.runtimeVersion = typeof pathOrOptions === "string" ? "typescript" :
      (pathOrOptions.runtimeVersion ?? "typescript");
    const options: Partial<SQLiteSessionRepositoryOptions> = typeof pathOrOptions === "string" ? {} : pathOrOptions;
    this.idempotencyRetentionMs = this.positiveOption(options.idempotencyRetentionMs ?? 7 * 24 * 60 * 60 * 1000, "idempotencyRetentionMs");
    this.approvalRetentionMs = this.positiveOption(options.approvalRetentionMs ?? 7 * 24 * 60 * 60 * 1000, "approvalRetentionMs");
    this.maxIdempotencyRecords = this.positiveIntegerOption(options.maxIdempotencyRecords ?? 10_000, "maxIdempotencyRecords");
    this.maxApprovalRecords = this.positiveIntegerOption(options.maxApprovalRecords ?? 10_000, "maxApprovalRecords");
    this.redactionPolicy = normalizePersistenceRedactionPolicy(options.redactionPolicy);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    try {
      this.assertOwnedOrFreshDatabase();
      this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
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

  private positiveOption(value: number, label: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be positive`);
    return value;
  }

  private positiveIntegerOption(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer`);
    return value;
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

  private assertOwnedOrFreshDatabase(): void {
    const tables = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all();
    if (!this.tableExists("data_layer_schema")) {
      if (tables.length > 0) {
        throw new UnsupportedSchemaError("database has no TypeScript data-layer schema marker");
      }
      return;
    }
    const rows = this.query<{ marker: string; version: number; owner: string }>(
      "SELECT marker, version, owner FROM data_layer_schema",
    ).all();
    if (rows.length !== 1 || rows[0]?.marker !== "hermes.data-layer.typescript" ||
        rows[0]?.owner !== "typescript" || rows[0]?.version !== PERSISTENCE_SCHEMA_VERSION) {
      throw new UnsupportedSchemaError("invalid TypeScript data-layer schema marker");
    }
    const required: readonly [string, readonly string[]][] = [
      ["sessions", ["id", "schema_version", "workspace_id", "status", "created_at", "updated_at", "runtime_json"]],
      ["messages", ["id", "session_id", "schema_version", "sequence", "role", "content_json", "created_at"]],
      ["tool_calls", ["id", "schema_version", "session_id", "message_id", "sequence", "created_at", "name", "arguments_json"]],
      ["tool_results", ["tool_call_id", "schema_version", "session_id", "message_id", "sequence", "created_at", "content_json", "is_error"]],
      ["usages", ["id", "schema_version", "session_id", "recorded_at", "usage_json"]],
      ["migration", ["session_id", "schema_version", "updated_at", "runtime_json"]],
      ["checkpoints", ["id", "session_id", "schema_version", "message_sequence", "created_at", "reason", "runtime_json", "snapshot_json", "format_version"]],
      ["idempotency_records", ["request_key", "request_fingerprint", "status", "terminal_payload_json", "created_at", "updated_at", "completed_at"]],
      ["pending_approvals", ["request_id", "session_id", "call_id", "tool_name", "arguments_json", "status", "created_at", "updated_at", "resolved_at"]],
    ];
    for (const [table, columns] of required) {
      if (!this.tableExists(table) || !columns.every((column) => this.columns(table).has(column))) {
        throw new UnsupportedSchemaError(`TypeScript data-layer table ${table} is incomplete`);
      }
    }
  }

  private initializeSchema(): void {
    if (this.tableExists("data_layer_schema")) return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(CORE_SCHEMA);
      this.db.exec(AUXILIARY_SCHEMA);
      this.run(
        "INSERT INTO data_layer_schema (marker, version, owner, created_at) VALUES (?, ?, ?, ?)",
        "hermes.data-layer.typescript", PERSISTENCE_SCHEMA_VERSION, "typescript", new Date().toISOString(),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* preserve schema creation error */ }
      throw error;
    }
  }

  private runExclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  private requireSession(sessionId: string): void {
    const row = this.query<{ id: string }>("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    if (row === null) throw new Error(`Session not found: ${sessionId}`);
  }

  private validateSessionUpdate(patch: { status?: SessionStatus; updatedAt: string }): void {
    if (patch === null || typeof patch !== "object") throw new TypeError("Invalid session patch");
    if (patch.status !== undefined && patch.status !== "active" && patch.status !== "completed" &&
        patch.status !== "failed" && patch.status !== "cancelled") {
      throw new TypeError("Invalid session status");
    }
    if (typeof patch.updatedAt !== "string" || patch.updatedAt.length === 0 ||
        !Number.isFinite(Date.parse(patch.updatedAt))) {
      throw new TypeError("Invalid session timestamp");
    }
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
      const value = parseFinishReason(finishReason);
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

  private transactionFor(): SessionRepositoryTransaction {
    return {
      appendMessages: async (sessionId, messages, options) => this.appendToDatabase(sessionId, messages, options),
      getSession: async (sessionId) => this.getSessionNow(sessionId),
      updateSession: async (sessionId, patch) => this.updateSessionNow(sessionId, patch),
      listMessages: async (sessionId) => this.listMessagesNow(sessionId),
      listToolCalls: async (sessionId) => this.listToolCallsNow(sessionId),
      listToolResults: async (sessionId) => this.listToolResultsNow(sessionId),
      listUsage: async (sessionId) => this.listUsageNow(sessionId),
      recordUsage: async (usage) => this.recordUsageNow(usage),
      getMigrationState: async (sessionId) => this.getMigrationStateNow(sessionId),
      saveMigrationState: async (state) => this.saveMigrationStateNow(state),
      saveCheckpoint: async (checkpoint) => this.saveCheckpointNow(checkpoint),
      claimIdempotency: async (requestKey, requestFingerprint) =>
        this.claimIdempotencyNow(requestKey, requestFingerprint),
      completeIdempotency: async (requestKey, requestFingerprint, terminalPayload) =>
        this.completeIdempotencyNow(requestKey, requestFingerprint, terminalPayload),
      getIdempotency: async (requestKey) => this.getIdempotencyNow(requestKey),
      savePendingApproval: async (approval) => this.savePendingApprovalNow(approval),
      getPendingApproval: async (requestId) => this.getPendingApprovalNow(requestId),
      listPendingApprovals: async (sessionId) => this.listPendingApprovalsNow(sessionId),
      resolvePendingApproval: async (requestId, decision, resolvedAt) =>
        this.resolvePendingApprovalNow(requestId, decision, resolvedAt),
      commitTurn: async (write) => this.commitTurnNow(write),
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
      return copy({ ...redactSessionMessage(draft, this.redactionPolicy), schemaVersion: PERSISTENCE_SCHEMA_VERSION, id, sessionId,
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

  private updateSessionNow(
    sessionId: string,
    patch: { status?: SessionStatus; updatedAt: string },
  ): SessionRecord {
    this.validateSessionUpdate(patch);
    this.requireSession(sessionId);
    if (patch.status === undefined) {
      this.run("UPDATE sessions SET updated_at = ? WHERE id = ?", patch.updatedAt, sessionId);
    } else {
      this.run(
        "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
        patch.status, patch.updatedAt, sessionId,
      );
    }
    const session = this.getSessionNow(sessionId);
    if (session === null) throw new Error(`Session not found: ${sessionId}`);
    return session;
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

  private requestPart(value: string, label: string): string {
    if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be non-empty`);
    return value;
  }

  private idempotencyFromRow(row: SqlRow): IdempotencyRecord {
    const status = requiredString(row, "status", "idempotency_records");
    if (status !== "pending" && status !== "completed") {
      throw new UnsupportedSchemaError("idempotency_records.status is invalid");
    }
    const record: IdempotencyRecord = {
      requestKey: requiredString(row, "request_key", "idempotency_records"),
      requestFingerprint: requiredString(row, "request_fingerprint", "idempotency_records"),
      status,
      createdAt: requiredString(row, "created_at", "idempotency_records"),
      updatedAt: requiredString(row, "updated_at", "idempotency_records"),
    };
    if (row.terminal_payload_json !== null && row.terminal_payload_json !== undefined) {
      const payload = parseJson(row.terminal_payload_json, "idempotency_records.terminal_payload_json");
      if (!isJsonValue(payload)) throw new UnsupportedSchemaError("idempotency terminal payload is invalid");
      record.terminalPayload = payload;
    }
    const completedAt = optionalString(row, "completed_at", "idempotency_records");
    if (completedAt !== undefined) record.completedAt = completedAt;
    if ((status === "pending" && (record.terminalPayload !== undefined || completedAt !== undefined)) ||
        (status === "completed" && (record.terminalPayload === undefined || completedAt === undefined))) {
      throw new UnsupportedSchemaError("idempotency record state is inconsistent");
    }
    return record;
  }

  private getIdempotencyNow(requestKey: string): IdempotencyRecord | null {
    this.requestPart(requestKey, "Idempotency request key");
    const row = this.query<SqlRow>("SELECT * FROM idempotency_records WHERE request_key = ?").get(requestKey);
    return row === null ? null : this.idempotencyFromRow(row);
  }

  private claimIdempotencyNow(requestKey: string, requestFingerprint: string): IdempotencyClaim {
    this.requestPart(requestKey, "Idempotency request key");
    this.requestPart(requestFingerprint, "Idempotency request fingerprint");
    this.pruneRetentionNow(new Date().toISOString());
    const existing = this.getIdempotencyNow(requestKey);
    if (existing !== null) {
      if (existing.requestFingerprint !== requestFingerprint) throw new IdempotencyConflictError();
      if (existing.status === "completed" && existing.terminalPayload !== undefined) {
        return { status: "replay", record: copy(existing), terminalPayload: copy(existing.terminalPayload) };
      }
      return { status: "pending", record: copy(existing) };
    }
    const at = new Date().toISOString();
    this.run(
      `INSERT INTO idempotency_records
        (request_key, request_fingerprint, status, terminal_payload_json, created_at, updated_at, completed_at)
       VALUES (?, ?, 'pending', NULL, ?, ?, NULL)`,
      requestKey, requestFingerprint, at, at,
    );
    const record = this.getIdempotencyNow(requestKey);
    if (record === null) throw new UnsupportedSchemaError("idempotency claim disappeared during write");
    return { status: "claimed", record: copy(record) };
  }

  private completeIdempotencyNow(
    requestKey: string,
    requestFingerprint: string,
    terminalPayload: JsonValue,
  ): void {
    this.requestPart(requestKey, "Idempotency request key");
    this.requestPart(requestFingerprint, "Idempotency request fingerprint");
    if (!isJsonValue(terminalPayload)) throw new TypeError("Idempotency terminal payload must be JSON");
    const existing = this.getIdempotencyNow(requestKey);
    if (existing === null) throw new Error(`Idempotency key has not been claimed: ${requestKey}`);
    if (existing.requestFingerprint !== requestFingerprint) throw new IdempotencyConflictError();
    const redactedPayload = redactJsonValue(terminalPayload, this.redactionPolicy);
    const payload = json(redactedPayload);
    if (existing.status === "completed") {
      if (existing.terminalPayload === undefined || json(existing.terminalPayload) !== payload) {
        throw new Error("Idempotency key already has a different terminal payload");
      }
      return;
    }
    const completedAt = new Date().toISOString();
    this.run(
      `UPDATE idempotency_records
       SET status = 'completed', terminal_payload_json = ?, updated_at = ?, completed_at = ?
       WHERE request_key = ? AND request_fingerprint = ? AND status = 'pending'`,
      payload, completedAt, completedAt, requestKey, requestFingerprint,
    );
  }

  private approvalFromRow(row: SqlRow): PendingApprovalRecord {
    const status = requiredString(row, "status", "pending_approvals");
    if (status !== "pending" && status !== "allowed" && status !== "denied") {
      throw new UnsupportedSchemaError("pending_approvals.status is invalid");
    }
    const argumentsValue = parseJson(row.arguments_json, "pending_approvals.arguments_json");
    if (!isJsonObject(argumentsValue)) throw new UnsupportedSchemaError("pending approval arguments are invalid");
    const approval: PendingApprovalRecord = {
      requestId: requiredString(row, "request_id", "pending_approvals"),
      sessionId: requiredString(row, "session_id", "pending_approvals"),
      callId: requiredString(row, "call_id", "pending_approvals"),
      toolName: requiredString(row, "tool_name", "pending_approvals"),
      arguments: argumentsValue,
      status,
      createdAt: requiredString(row, "created_at", "pending_approvals"),
      updatedAt: requiredString(row, "updated_at", "pending_approvals"),
    };
    const resolvedAt = optionalString(row, "resolved_at", "pending_approvals");
    if (resolvedAt !== undefined) approval.resolvedAt = resolvedAt;
    if ((status === "pending" && resolvedAt !== undefined) ||
        (status !== "pending" && resolvedAt === undefined)) {
      throw new UnsupportedSchemaError("pending approval state is inconsistent");
    }
    return approval;
  }

  private getPendingApprovalNow(requestId: string): PendingApprovalRecord | null {
    this.requestPart(requestId, "Approval request id");
    const row = this.query<SqlRow>("SELECT * FROM pending_approvals WHERE request_id = ?").get(requestId);
    return row === null ? null : this.approvalFromRow(row);
  }

  private savePendingApprovalNow(approval: PendingApprovalRecord): void {
    for (const [value, label] of [[approval.requestId, "Approval request id"], [approval.sessionId, "Approval session id"], [approval.callId, "Approval call id"], [approval.toolName, "Approval tool name"]] as const) {
      this.requestPart(value, label);
    }
    if (!isJsonObject(approval.arguments) || approval.status !== "pending") {
      throw new TypeError("Pending approval must contain JSON arguments and have pending status");
    }
    const redactedApproval = redactPendingApproval(approval, this.redactionPolicy);
    const existing = this.getPendingApprovalNow(approval.requestId);
    if (existing !== null) {
      if (existing.sessionId !== redactedApproval.sessionId || existing.callId !== redactedApproval.callId ||
          existing.toolName !== redactedApproval.toolName || json(existing.arguments) !== json(redactedApproval.arguments)) {
        throw new Error(`Approval request already exists: ${approval.requestId}`);
      }
      return;
    }
    this.pruneRetentionNow(new Date().toISOString());
    this.run(
      `INSERT INTO pending_approvals
        (request_id, session_id, call_id, tool_name, arguments_json, status, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
      redactedApproval.requestId, redactedApproval.sessionId, redactedApproval.callId,
      redactedApproval.toolName, json(redactedApproval.arguments), redactedApproval.createdAt,
      redactedApproval.updatedAt,
    );
  }

  private listPendingApprovalsNow(sessionId?: string): readonly PendingApprovalRecord[] {
    const rows = sessionId === undefined
      ? this.query<SqlRow>("SELECT * FROM pending_approvals WHERE status = 'pending' ORDER BY created_at, request_id").all()
      : this.query<SqlRow>("SELECT * FROM pending_approvals WHERE status = 'pending' AND session_id = ? ORDER BY created_at, request_id").all(sessionId);
    return rows.map((row) => this.approvalFromRow(row));
  }

  private resolvePendingApprovalNow(
    requestId: string,
    decision: ApprovalDecision,
    resolvedAt = new Date().toISOString(),
  ): PendingApprovalRecord {
    this.requestPart(requestId, "Approval request id");
    if (decision !== "allow" && decision !== "deny") throw new TypeError("Approval decision is invalid");
    const existing = this.getPendingApprovalNow(requestId);
    if (existing === null) throw new Error(`Approval request not found: ${requestId}`);
    const status = decision === "allow" ? "allowed" : "denied";
    if (existing.status !== "pending") {
      if (existing.status !== status) throw new Error(`Approval request already resolved: ${requestId}`);
      return copy(existing);
    }
    this.run(
      "UPDATE pending_approvals SET status = ?, updated_at = ?, resolved_at = ? WHERE request_id = ? AND status = 'pending'",
      status, resolvedAt, resolvedAt, requestId,
    );
    const result = this.getPendingApprovalNow(requestId);
    if (result === null) throw new UnsupportedSchemaError("approval resolution disappeared during write");
    return result;
  }

  private pruneRetentionNow(now: string): RetentionPruneResult {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new TypeError("Retention timestamp is invalid");
    const idempotencyCutoff = new Date(nowMs - this.idempotencyRetentionMs).toISOString();
    const approvalCutoff = new Date(nowMs - this.approvalRetentionMs).toISOString();
    this.run("DELETE FROM idempotency_records WHERE updated_at < ?", idempotencyCutoff);
    this.run(
      `DELETE FROM idempotency_records WHERE request_key IN
       (SELECT request_key FROM idempotency_records ORDER BY updated_at, request_key LIMIT -1 OFFSET ?)`,
      this.maxIdempotencyRecords,
    );
    this.run("DELETE FROM pending_approvals WHERE updated_at < ?", approvalCutoff);
    this.run(
      `DELETE FROM pending_approvals WHERE request_id IN
       (SELECT request_id FROM pending_approvals ORDER BY updated_at, request_id LIMIT -1 OFFSET ?)`,
      this.maxApprovalRecords,
    );
    return {
      idempotencyRecords: this.query<{ count: number }>("SELECT COUNT(*) AS count FROM idempotency_records").get()?.count ?? 0,
      approvalRecords: this.query<{ count: number }>("SELECT COUNT(*) AS count FROM pending_approvals").get()?.count ?? 0,
    };
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
      checkpoint.createdAt, checkpoint.reason, json(checkpoint.runtime),
      json(redactCheckpoint(checkpoint, this.redactionPolicy).snapshot),
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
        session.provider ?? null, session.metadata === undefined ? null : optionalJson(redactJsonValue(session.metadata, this.redactionPolicy)),
      );
      await transaction.getSession(session.id);
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.runExclusive(() => this.getSessionNow(sessionId));
  }

  async updateSession(
    sessionId: string,
    patch: { status?: SessionStatus; updatedAt: string },
  ): Promise<SessionRecord> {
    return this.transaction((transaction) => transaction.updateSession(sessionId, patch));
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

  async claimIdempotency(requestKey: string, requestFingerprint: string): Promise<IdempotencyClaim> {
    return this.transaction((transaction) => transaction.claimIdempotency(requestKey, requestFingerprint));
  }

  async completeIdempotency(
    requestKey: string,
    requestFingerprint: string,
    terminalPayload: JsonValue,
  ): Promise<void> {
    await this.transaction((transaction) =>
      transaction.completeIdempotency(requestKey, requestFingerprint, terminalPayload));
  }

  async getIdempotency(requestKey: string): Promise<IdempotencyRecord | null> {
    return this.runExclusive(() => this.getIdempotencyNow(requestKey));
  }

  async savePendingApproval(approval: PendingApprovalRecord): Promise<void> {
    await this.transaction((transaction) => transaction.savePendingApproval(approval));
  }

  async getPendingApproval(requestId: string): Promise<PendingApprovalRecord | null> {
    return this.runExclusive(() => this.getPendingApprovalNow(requestId));
  }

  async listPendingApprovals(sessionId?: string): Promise<readonly PendingApprovalRecord[]> {
    return this.runExclusive(() => this.listPendingApprovalsNow(sessionId));
  }

  async resolvePendingApproval(
    requestId: string,
    decision: ApprovalDecision,
    resolvedAt?: string,
  ): Promise<PendingApprovalRecord> {
    return this.transaction((transaction) =>
      transaction.resolvePendingApproval(requestId, decision, resolvedAt));
  }

  async prune(now = new Date().toISOString()): Promise<RetentionPruneResult> {
    return this.transaction(async () => this.pruneRetentionNow(now));
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
