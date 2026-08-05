export type ChatRole = "system" | "user" | "assistant" | "tool";

/** Legacy provider message. Keep string content for provider-interface compatibility. */
export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type TextContentPart = {
  type: "text";
  text: string;
};

export type ImageContentPart = {
  type: "image";
  url: string;
  mimeType?: string;
  alt?: string;
};

export type ImageUrlContentPart = {
  type: "image_url";
  imageUrl: string | { url: string; detail?: "auto" | "low" | "high" };
};

export type FileContentPart = {
  type: "file";
  url: string;
  mimeType?: string;
  name?: string;
};

export type AudioContentPart = {
  type: "audio";
  url: string;
  mimeType?: string;
};

export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | ImageUrlContentPart
  | FileContentPart
  | AudioContentPart;

export type MessageContent = string | readonly ContentPart[];
export type StructuredContent = MessageContent;
export type MessagePart = ContentPart;

export type ToolCall = {
  id: string;
  name: string;
  arguments: JsonObject | string;
};

export type ToolResult = {
  toolCallId: string;
  content: MessageContent;
  isError: boolean;
  toolName?: string;
};

export type ToolCallRecord = ToolCall & {
  schemaVersion: PersistenceSchemaVersion;
  sessionId: string;
  messageId: string;
  sequence: number;
  createdAt: string;
};

export type ToolResultRecord = ToolResult & {
  schemaVersion: PersistenceSchemaVersion;
  sessionId: string;
  messageId: string;
  sequence: number;
  createdAt: string;
};

export type TransportMessage = {
  role: ChatRole;
  content: MessageContent;
  name?: string;
  toolCalls?: readonly ToolCall[];
  toolCallId?: string;
  toolResult?: ToolResult;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
};

export type ToolPolicy = "allow" | "ask" | "auto" | "deny";

export type ToolPolicySnapshot = {
  toolName: string;
  policy: ToolPolicy;
};

export const PERSISTENCE_SCHEMA_VERSION = 1 as const;
export const CURRENT_SCHEMA_VERSION = PERSISTENCE_SCHEMA_VERSION;
export type PersistenceSchemaVersion = typeof PERSISTENCE_SCHEMA_VERSION;
export type SchemaVersion = PersistenceSchemaVersion;
export const CHECKPOINT_FORMAT_VERSION = 1 as const;

export type RuntimeMigrationMetadata = {
  runtimeVersion: string;
  schemaVersion: PersistenceSchemaVersion;
  migratedFromSchemaVersion?: number;
  migrationId?: string;
  migratedAt?: string;
};

export type SessionStatus = "active" | "completed" | "failed" | "cancelled";

export type SessionRecord = {
  schemaVersion: PersistenceSchemaVersion;
  id: string;
  workspaceId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  runtime: RuntimeMigrationMetadata;
  title?: string;
  model?: string;
  provider?: string;
  metadata?: JsonObject;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type UsageRecord = {
  schemaVersion: PersistenceSchemaVersion;
  sessionId: string;
  recordedAt: string;
  usage: Usage;
  messageId?: string;
};

export type MigrationStateRecord = {
  schemaVersion: PersistenceSchemaVersion;
  sessionId: string;
  updatedAt: string;
  runtime: RuntimeMigrationMetadata;
  recovery?: TurnRecoveryState;
};

export type TurnRecoveryStatus = "running" | "interrupted" | "recoverable";

/** Durable evidence used to avoid replaying an interrupted tool blindly. */
export type TurnRecoveryState = {
  turnId: string;
  status: TurnRecoveryStatus;
  startedAt: string;
  updatedAt: string;
  checkpointId?: string;
  pendingToolCallIds?: readonly string[];
};

export type SessionMessage = {
  schemaVersion: PersistenceSchemaVersion;
  id: string;
  sessionId: string;
  sequence: number;
  role: ChatRole;
  content: MessageContent;
  createdAt: string;
  name?: string;
  toolCalls?: readonly ToolCall[];
  toolCallId?: string;
  toolResult?: ToolResult;
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  usage?: Usage;
};

export type SessionMessageDraft = Omit<
  SessionMessage,
  "schemaVersion" | "id" | "sessionId" | "sequence"
> & { id?: string };

export type CheckpointReason = "manual" | "turn" | "before-tool" | "migration";

export type CheckpointRecord = {
  schemaVersion: PersistenceSchemaVersion;
  id: string;
  sessionId: string;
  messageSequence: number;
  createdAt: string;
  reason: CheckpointReason;
  runtime: RuntimeMigrationMetadata;
  snapshot: JsonObject;
  /** Optional on input for compatibility; new writes persist the current format. */
  formatVersion?: number;
  label?: string;
};

export type AppendMessagesOptions = {
  /** Reject append when current next sequence differs. */
  expectedNextSequence?: number;
};

export type AppendMessagesResult = {
  messages: readonly SessionMessage[];
  firstSequence: number | null;
  lastSequence: number | null;
};

export type AtomicTurnWrite = {
  sessionId: string;
  messages: readonly SessionMessageDraft[];
  expectedNextSequence?: number;
  usage?: UsageRecord | readonly UsageRecord[];
  checkpoint?: CheckpointRecord;
  migrationState?: MigrationStateRecord;
};

/** Implementations must commit all messages, or commit none of them. */
export interface SessionRepositoryTransaction {
  appendMessages(
    sessionId: string,
    messages: readonly SessionMessageDraft[],
    options?: AppendMessagesOptions,
  ): Promise<AppendMessagesResult>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listMessages(sessionId: string): Promise<readonly SessionMessage[]>;
  listToolCalls(sessionId: string): Promise<readonly ToolCallRecord[]>;
  listToolResults(sessionId: string): Promise<readonly ToolResultRecord[]>;
  listUsage(sessionId: string): Promise<readonly UsageRecord[]>;
  recordUsage(usage: UsageRecord): Promise<void>;
  getMigrationState(sessionId: string): Promise<MigrationStateRecord | null>;
  saveMigrationState(state: MigrationStateRecord): Promise<void>;
  saveCheckpoint(checkpoint: CheckpointRecord): Promise<void>;
  commitTurn(write: AtomicTurnWrite): Promise<AppendMessagesResult>;
}

export interface SessionRepository extends SessionRepositoryTransaction {
  createSession(session: SessionRecord): Promise<void>;
  getCheckpoint(sessionId: string, checkpointId: string): Promise<CheckpointRecord | null>;
  listCheckpoints(sessionId: string): Promise<readonly CheckpointRecord[]>;
  transaction<T>(
    operation: (transaction: SessionRepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}

export type PersistenceRepository = SessionRepository;

export type TransportEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "message.started"; sessionId: string; messageId: string; role: ChatRole }
  | { type: "message.delta"; sessionId: string; delta: string }
  | { type: "message.completed"; sessionId: string; message: TransportMessage }
  | { type: "tool.call"; sessionId: string; messageId: string; call: ToolCall }
  | { type: "tool.result"; sessionId: string; messageId: string; result: ToolResult }
  | { type: "checkpoint.created"; sessionId: string; checkpoint: CheckpointRecord }
  | { type: "usage.updated"; sessionId: string; usage: Usage }
  | { type: "error"; code: string; message: string };

export type HarnessEvent = TransportEvent;
export type SessionEvent = TransportEvent;

export type ContractValidation =
  | { valid: true }
  | { valid: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function isChatRole(value: unknown): value is ChatRole {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function isContentPart(value: unknown): value is ContentPart {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "text") return typeof value.text === "string";
  if (value.type === "image" || value.type === "file") {
    return typeof value.url === "string" &&
      (value.mimeType === undefined || typeof value.mimeType === "string") &&
      (value.alt === undefined || typeof value.alt === "string") &&
      (value.name === undefined || typeof value.name === "string");
  }
  if (value.type === "audio") {
    return typeof value.url === "string" &&
      (value.mimeType === undefined || typeof value.mimeType === "string");
  }
  if (value.type === "image_url") {
    if (typeof value.imageUrl === "string") return true;
    return isRecord(value.imageUrl) && typeof value.imageUrl.url === "string" &&
      (value.imageUrl.detail === undefined ||
        value.imageUrl.detail === "auto" || value.imageUrl.detail === "low" ||
        value.imageUrl.detail === "high");
  }
  return false;
}

export function isMessageContent(value: unknown): value is MessageContent {
  return typeof value === "string" || (Array.isArray(value) && value.every(isContentPart));
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

function isTransportMessage(value: unknown): value is TransportMessage {
  return isRecord(value) && isChatRole(value.role) && isMessageContent(value.content) &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.toolCallId === undefined || typeof value.toolCallId === "string") &&
    (value.toolCalls === undefined ||
      (Array.isArray(value.toolCalls) && value.toolCalls.every(isToolCall))) &&
    (value.toolResult === undefined || isToolResult(value.toolResult));
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isUsage(value: unknown): value is Usage {
  return isRecord(value) && isNonNegativeNumber(value.inputTokens) &&
    isNonNegativeNumber(value.outputTokens) &&
    (value.totalTokens === undefined || isNonNegativeNumber(value.totalTokens)) &&
    (value.cachedInputTokens === undefined || isNonNegativeNumber(value.cachedInputTokens)) &&
    (value.reasoningTokens === undefined || isNonNegativeNumber(value.reasoningTokens));
}

function isRuntimeMigrationMetadata(value: unknown): value is RuntimeMigrationMetadata {
  const migratedFrom = isRecord(value) ? value.migratedFromSchemaVersion : undefined;
  return isRecord(value) && typeof value.runtimeVersion === "string" &&
    isSchemaVersion(value.schemaVersion) &&
    (migratedFrom === undefined ||
      (typeof migratedFrom === "number" && Number.isSafeInteger(migratedFrom) && migratedFrom >= 0)) &&
    (value.migrationId === undefined || typeof value.migrationId === "string") &&
    (value.migratedAt === undefined || typeof value.migratedAt === "string");
}

function isCheckpointReason(value: unknown): value is CheckpointReason {
  return value === "manual" || value === "turn" || value === "before-tool" || value === "migration";
}

function isCheckpointRecord(value: unknown): value is CheckpointRecord {
  const messageSequence = isRecord(value) ? value.messageSequence : undefined;
  return isRecord(value) && isSchemaVersion(value.schemaVersion) &&
    typeof value.id === "string" && typeof value.sessionId === "string" &&
    typeof messageSequence === "number" && Number.isSafeInteger(messageSequence) && messageSequence >= 0 &&
    typeof value.createdAt === "string" && isCheckpointReason(value.reason) &&
    isRuntimeMigrationMetadata(value.runtime) && isJsonObject(value.snapshot) &&
    (value.formatVersion === undefined ||
      value.formatVersion === CHECKPOINT_FORMAT_VERSION) &&
    (value.label === undefined || typeof value.label === "string");
}

export function isSchemaVersion(value: unknown): value is PersistenceSchemaVersion {
  return value === PERSISTENCE_SCHEMA_VERSION;
}

export const isSupportedSchemaVersion = isSchemaVersion;

export function validateSchemaVersion(value: unknown): value is PersistenceSchemaVersion {
  return isSchemaVersion(value);
}

export function assertSupportedSchemaVersion(value: unknown): asserts value is PersistenceSchemaVersion {
  if (!isSchemaVersion(value)) {
    throw new Error(`Unsupported persistence schema version: ${String(value)}`);
  }
}

function validatePersistedMessage(value: unknown): ContractValidation {
  if (!isRecord(value)) return { valid: false, reason: "message must be an object" };
  if (!isSchemaVersion(value.schemaVersion)) return { valid: false, reason: "unsupported message schema" };
  if (typeof value.id !== "string" || value.id.length === 0) {
    return { valid: false, reason: "message id must be a non-empty string" };
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    return { valid: false, reason: "message session id must be a non-empty string" };
  }
  if (typeof value.sequence !== "number" ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    return { valid: false, reason: "message sequence must be a non-negative integer" };
  }
  if (!isChatRole(value.role)) return { valid: false, reason: "invalid message role" };
  if (!isMessageContent(value.content)) return { valid: false, reason: "invalid message content" };
  if (!isTimestamp(value.createdAt)) return { valid: false, reason: "message timestamp must be valid" };
  if (value.name !== undefined && typeof value.name !== "string") {
    return { valid: false, reason: "message name must be a string" };
  }
  if (value.toolCalls !== undefined &&
      (!Array.isArray(value.toolCalls) || !value.toolCalls.every(isToolCall))) {
    return { valid: false, reason: "invalid tool calls" };
  }
  if (value.toolCallId !== undefined &&
      (typeof value.toolCallId !== "string" || value.toolCallId.length === 0)) {
    return { valid: false, reason: "tool call id must be a non-empty string" };
  }
  if (value.toolResult !== undefined && !isToolResult(value.toolResult)) {
    return { valid: false, reason: "invalid tool result" };
  }
  if (value.finishReason !== undefined &&
      (value.finishReason !== "stop" && value.finishReason !== "length" &&
       value.finishReason !== "tool_calls" && value.finishReason !== "content_filter" &&
       value.finishReason !== "error")) {
    return { valid: false, reason: "invalid finish reason" };
  }
  if (value.usage !== undefined && !isUsage(value.usage)) {
    return { valid: false, reason: "invalid usage" };
  }
  return { valid: true };
}

export function isSessionMessage(value: unknown): value is SessionMessage {
  return validatePersistedMessage(value).valid;
}

export function validateMessageOrdering(
  messages: readonly SessionMessage[],
  expectedSessionId?: string,
): ContractValidation {
  if (!Array.isArray(messages)) return { valid: false, reason: "messages must be an array" };
  let previousSequence: number | undefined;
  const ids = new Set<string>();
  for (const message of messages) {
    const shape = validatePersistedMessage(message);
    if (!shape.valid) return shape;
    if (expectedSessionId !== undefined && message.sessionId !== expectedSessionId) {
      return { valid: false, reason: "message session mismatch" };
    }
    if (!Number.isSafeInteger(message.sequence) || message.sequence < 0) {
      return { valid: false, reason: "message sequence must be a non-negative integer" };
    }
    if (ids.has(message.id)) return { valid: false, reason: "duplicate message id" };
    if (previousSequence !== undefined && message.sequence !== previousSequence + 1) {
      return { valid: false, reason: "message sequences must be contiguous and ordered" };
    }
    ids.add(message.id);
    previousSequence = message.sequence;
  }
  return { valid: true };
}

export function validateToolCorrelations(messages: readonly SessionMessage[]): ContractValidation {
  if (!Array.isArray(messages)) return { valid: false, reason: "messages must be an array" };
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of messages) {
    const shape = validatePersistedMessage(message);
    if (!shape.valid) return shape;
    for (const call of message.toolCalls ?? []) {
      if (calls.has(call.id)) return { valid: false, reason: "duplicate tool call id" };
      calls.add(call.id);
    }
    if (message.toolResult !== undefined) {
      const id = message.toolResult.toolCallId;
      if (!calls.has(id)) return { valid: false, reason: "tool result has no preceding tool call" };
      if (results.has(id)) return { valid: false, reason: "duplicate tool result" };
      results.add(id);
    }
    if (message.toolCallId !== undefined) {
      if (message.toolResult !== undefined) {
        if (message.toolResult.toolCallId !== message.toolCallId) {
          return { valid: false, reason: "tool result correlation mismatch" };
        }
      } else {
        if (!calls.has(message.toolCallId)) {
          return { valid: false, reason: "tool message has no preceding tool call" };
        }
        if (results.has(message.toolCallId)) return { valid: false, reason: "duplicate tool result" };
        results.add(message.toolCallId);
      }
    }
  }
  return { valid: true };
}

export function validateSessionMessages(
  messages: readonly SessionMessage[],
  expectedSessionId?: string,
): ContractValidation {
  const ordering = validateMessageOrdering(messages, expectedSessionId);
  return ordering.valid ? validateToolCorrelations(messages) : ordering;
}

export function assertValidSessionMessages(
  messages: readonly SessionMessage[],
  expectedSessionId?: string,
): void {
  const result = validateSessionMessages(messages, expectedSessionId);
  if (!result.valid) throw new Error(`Invalid session messages: ${result.reason}`);
}

export function parseTransportEvent(value: unknown): TransportEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "session.started" && typeof value.sessionId === "string") {
    return { type: "session.started", sessionId: value.sessionId };
  }
  if (value.type === "message.started" && typeof value.sessionId === "string" &&
      typeof value.messageId === "string" && isChatRole(value.role)) {
    return { type: "message.started", sessionId: value.sessionId, messageId: value.messageId, role: value.role };
  }
  if (value.type === "message.delta" && typeof value.sessionId === "string" && typeof value.delta === "string") {
    return { type: "message.delta", sessionId: value.sessionId, delta: value.delta };
  }
  if (value.type === "message.completed" && typeof value.sessionId === "string" && isTransportMessage(value.message)) {
    return { type: "message.completed", sessionId: value.sessionId, message: value.message };
  }
  if (value.type === "tool.call" && typeof value.sessionId === "string" &&
      typeof value.messageId === "string" && isToolCall(value.call)) {
    return { type: "tool.call", sessionId: value.sessionId, messageId: value.messageId, call: value.call };
  }
  if (value.type === "tool.result" && typeof value.sessionId === "string" &&
      typeof value.messageId === "string" && isToolResult(value.result)) {
    return { type: "tool.result", sessionId: value.sessionId, messageId: value.messageId, result: value.result };
  }
  if (value.type === "checkpoint.created" && typeof value.sessionId === "string" &&
      isCheckpointRecord(value.checkpoint) && value.checkpoint.sessionId === value.sessionId) {
    return { type: "checkpoint.created", sessionId: value.sessionId, checkpoint: value.checkpoint };
  }
  if (value.type === "usage.updated" && typeof value.sessionId === "string" && isUsage(value.usage)) {
    return { type: "usage.updated", sessionId: value.sessionId, usage: value.usage };
  }
  if (value.type === "error" && typeof value.code === "string" && typeof value.message === "string") {
    return { type: "error", code: value.code, message: value.message };
  }
  return null;
}
