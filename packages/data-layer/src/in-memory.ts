import {
  CHECKPOINT_FORMAT_VERSION,
  PERSISTENCE_SCHEMA_VERSION,
  assertSupportedSchemaVersion,
  assertValidSessionMessages,
} from "./contracts.js";
import type {
  AppendMessagesOptions,
  AppendMessagesResult,
  CheckpointRecord,
  AtomicTurnWrite,
  MigrationStateRecord,
  SessionMessage,
  SessionMessageDraft,
  SessionRecord,
  SessionRepository,
  SessionRepositoryTransaction,
  ToolCallRecord,
  ToolResultRecord,
  UsageRecord,
} from "./contracts.js";

type RepositoryState = {
  sessions: Map<string, SessionRecord>;
  messages: Map<string, SessionMessage[]>;
  toolCalls: Map<string, ToolCallRecord[]>;
  toolResults: Map<string, ToolResultRecord[]>;
  usages: Map<string, UsageRecord[]>;
  migrationStates: Map<string, MigrationStateRecord>;
  checkpoints: Map<string, CheckpointRecord[]>;
};

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copy(item)) as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = copy(item);
    return result as T;
  }
  return value;
}

function emptyState(): RepositoryState {
  return {
    sessions: new Map(),
    messages: new Map(),
    toolCalls: new Map(),
    toolResults: new Map(),
    usages: new Map(),
    migrationStates: new Map(),
    checkpoints: new Map(),
  };
}

function copyArrayMap<T>(source: Map<string, T[]>): Map<string, T[]> {
  return new Map([...source].map(([key, value]) => [key, copy(value)] as const));
}

function copyState(source: RepositoryState): RepositoryState {
  return {
    sessions: new Map([...source.sessions].map(([key, value]) => [key, copy(value)] as const)),
    messages: copyArrayMap(source.messages),
    toolCalls: copyArrayMap(source.toolCalls),
    toolResults: copyArrayMap(source.toolResults),
    usages: copyArrayMap(source.usages),
    migrationStates: new Map(
      [...source.migrationStates].map(([key, value]) => [key, copy(value)] as const),
    ),
    checkpoints: copyArrayMap(source.checkpoints),
  };
}

function requireSession(state: RepositoryState, sessionId: string): void {
  if (!state.sessions.has(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`);
  }
}

function validateRuntimeSchema(runtime: { schemaVersion: number }): void {
  assertSupportedSchemaVersion(runtime.schemaVersion);
}

function validateCheckpointFormat(checkpoint: CheckpointRecord): void {
  if (!Number.isSafeInteger(checkpoint.messageSequence) || checkpoint.messageSequence < 0 ||
      (checkpoint.reason !== "manual" && checkpoint.reason !== "turn" &&
       checkpoint.reason !== "before-tool" && checkpoint.reason !== "migration")) {
    throw new Error("Invalid checkpoint");
  }
  if (checkpoint.formatVersion !== undefined &&
      checkpoint.formatVersion !== CHECKPOINT_FORMAT_VERSION) {
    throw new Error("Invalid checkpoint format version");
  }
}

function validateRecoveryState(recovery: NonNullable<MigrationStateRecord["recovery"]>): void {
  if (recovery.turnId.length === 0 ||
      (recovery.status !== "running" && recovery.status !== "interrupted" && recovery.status !== "recoverable") ||
      Number.isNaN(Date.parse(recovery.startedAt)) || Number.isNaN(Date.parse(recovery.updatedAt)) ||
      (recovery.checkpointId !== undefined && recovery.checkpointId.length === 0) ||
      (recovery.pendingToolCallIds !== undefined &&
       recovery.pendingToolCallIds.some((id) => id.length === 0))) {
    throw new Error("Invalid turn recovery state");
  }
  if (recovery.status !== "running" && recovery.checkpointId === undefined) {
    throw new Error("Interrupted recovery state requires a checkpoint");
  }
}

function usageRecords(value: AtomicTurnWrite["usage"]): readonly UsageRecord[] {
  if (value === undefined) return [];
  if (isUsageRecord(value)) return [value];
  return value;
}

function isUsageRecord(value: AtomicTurnWrite["usage"]): value is UsageRecord {
  return value !== undefined && !Array.isArray(value);
}

export class InMemorySessionRepository implements SessionRepository {
  private state = emptyState();
  private queue = Promise.resolve();

  private runExclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(operation).finally(release);
  }

  private transactionFor(state: RepositoryState): SessionRepositoryTransaction {
    return {
      appendMessages: async (sessionId, messages, options) =>
        this.appendToState(state, sessionId, messages, options),
      getSession: async (sessionId) => {
        const session = state.sessions.get(sessionId);
        return session === undefined ? null : copy(session);
      },
      listMessages: async (sessionId) => copy(state.messages.get(sessionId) ?? []),
      listToolCalls: async (sessionId) => copy(state.toolCalls.get(sessionId) ?? []),
      listToolResults: async (sessionId) => copy(state.toolResults.get(sessionId) ?? []),
      listUsage: async (sessionId) => copy(state.usages.get(sessionId) ?? []),
      recordUsage: async (usage) => {
        requireSession(state, usage.sessionId);
        assertSupportedSchemaVersion(usage.schemaVersion);
        if (usage.usage.inputTokens < 0 || usage.usage.outputTokens < 0) {
          throw new Error("Invalid usage record");
        }
        const records = state.usages.get(usage.sessionId) ?? [];
        records.push(copy(usage));
        state.usages.set(usage.sessionId, records);
      },
      getMigrationState: async (sessionId) => {
        const migration = state.migrationStates.get(sessionId);
        return migration === undefined ? null : copy(migration);
      },
      saveMigrationState: async (migration) => {
        requireSession(state, migration.sessionId);
        assertSupportedSchemaVersion(migration.schemaVersion);
        validateRuntimeSchema(migration.runtime);
        if (migration.recovery !== undefined) validateRecoveryState(migration.recovery);
        state.migrationStates.set(migration.sessionId, copy(migration));
      },
      saveCheckpoint: async (checkpoint) => {
        requireSession(state, checkpoint.sessionId);
        assertSupportedSchemaVersion(checkpoint.schemaVersion);
        validateRuntimeSchema(checkpoint.runtime);
        validateCheckpointFormat(checkpoint);
        if (checkpoint.messageSequence > (state.messages.get(checkpoint.sessionId) ?? []).length) {
          throw new Error("Checkpoint references a future message sequence");
        }
        const stored = copy({
          ...checkpoint,
          formatVersion: checkpoint.formatVersion ?? CHECKPOINT_FORMAT_VERSION,
        });
        const checkpoints = state.checkpoints.get(checkpoint.sessionId) ?? [];
        const index = checkpoints.findIndex(({ id }) => id === checkpoint.id);
        if (index === -1) checkpoints.push(stored);
        else checkpoints[index] = stored;
        state.checkpoints.set(checkpoint.sessionId, checkpoints);
      },
      commitTurn: async (write) => {
        if (write.sessionId.length === 0) throw new Error("Turn session id must not be empty");
        const usages = usageRecords(write.usage);
        const result = await this.appendToState(
          state,
          write.sessionId,
          write.messages,
          write.expectedNextSequence === undefined ? undefined : {
            expectedNextSequence: write.expectedNextSequence,
          },
        );
        for (const usage of usages) await this.transactionFor(state).recordUsage(usage);
        if (write.checkpoint !== undefined) {
          if (write.checkpoint.sessionId !== write.sessionId) {
            throw new Error("Checkpoint session mismatch");
          }
          await this.transactionFor(state).saveCheckpoint(write.checkpoint);
        }
        if (write.migrationState !== undefined) {
          if (write.migrationState.sessionId !== write.sessionId) {
            throw new Error("Migration state session mismatch");
          }
          const recovery = write.migrationState.recovery;
          if (recovery !== undefined) validateRecoveryState(recovery);
          if (recovery?.checkpointId !== undefined && write.checkpoint !== undefined &&
              recovery.checkpointId !== write.checkpoint.id) {
            throw new Error("Recovery checkpoint mismatch");
          }
          if (recovery?.pendingToolCallIds !== undefined) {
            const calls = new Set((state.toolCalls.get(write.sessionId) ?? []).map(({ id }) => id));
            const results = new Set((state.toolResults.get(write.sessionId) ?? []).map(({ toolCallId }) => toolCallId));
            for (const id of recovery.pendingToolCallIds) {
              if (!calls.has(id)) throw new Error(`Recovery references unknown tool call: ${id}`);
              if (results.has(id)) throw new Error(`Recovery references completed tool call: ${id}`);
            }
          }
          await this.transactionFor(state).saveMigrationState(write.migrationState);
        }
        return result;
      },
    };
  }

  private appendToState(
    state: RepositoryState,
    sessionId: string,
    drafts: readonly SessionMessageDraft[],
    options?: AppendMessagesOptions,
  ): AppendMessagesResult {
    requireSession(state, sessionId);
    const existing = state.messages.get(sessionId) ?? [];
    const nextSequence = existing.length;
    if (options?.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(
        `Expected next sequence ${options.expectedNextSequence}, actual ${nextSequence}`,
      );
    }
    if (drafts.length === 0) {
      return { messages: [], firstSequence: null, lastSequence: null };
    }

    const ids = new Set(existing.map(({ id }) => id));
    const appended: SessionMessage[] = drafts.map((draft, offset) => {
      const sequence = nextSequence + offset;
      const id = draft.id ?? `${sessionId}:message:${sequence}`;
      if (id.length === 0) throw new Error("Message id must not be empty");
      if (ids.has(id)) throw new Error(`Duplicate message id: ${id}`);
      ids.add(id);
      return copy({
        ...draft,
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        id,
        sessionId,
        sequence,
      });
    });

    const combined = [...existing, ...appended];
    assertValidSessionMessages(combined, sessionId);

    const calls = state.toolCalls.get(sessionId) ?? [];
    const results = state.toolResults.get(sessionId) ?? [];
    const callIds = new Set(calls.map(({ id }) => id));
    const resultIds = new Set(results.map(({ toolCallId }) => toolCallId));
    for (const message of appended) {
      for (const call of message.toolCalls ?? []) {
        if (callIds.has(call.id)) throw new Error(`Duplicate tool call id: ${call.id}`);
        callIds.add(call.id);
        calls.push(copy({
          ...call,
          schemaVersion: PERSISTENCE_SCHEMA_VERSION,
          sessionId,
          messageId: message.id,
          sequence: message.sequence,
          createdAt: message.createdAt,
        }));
      }
      if (message.toolResult !== undefined) {
        const result = message.toolResult;
        if (resultIds.has(result.toolCallId)) {
          throw new Error(`Duplicate tool result: ${result.toolCallId}`);
        }
        resultIds.add(result.toolCallId);
        results.push(copy({
          ...result,
          schemaVersion: PERSISTENCE_SCHEMA_VERSION,
          sessionId,
          messageId: message.id,
          sequence: message.sequence,
          createdAt: message.createdAt,
        }));
      }
    }

    state.messages.set(sessionId, [...existing, ...appended]);
    state.toolCalls.set(sessionId, calls);
    state.toolResults.set(sessionId, results);
    return {
      messages: copy(appended),
      firstSequence: appended[0]?.sequence ?? null,
      lastSequence: appended[appended.length - 1]?.sequence ?? null,
    };
  }

  async createSession(session: SessionRecord): Promise<void> {
    const value = copy(session);
    await this.runExclusive(() => {
      assertSupportedSchemaVersion(value.schemaVersion);
      validateRuntimeSchema(value.runtime);
      if (this.state.sessions.has(value.id)) throw new Error(`Session already exists: ${value.id}`);
      const next = copyState(this.state);
      next.sessions.set(value.id, copy(value));
      this.state = next;
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.runExclusive(() => {
      const session = this.state.sessions.get(sessionId);
      return session === undefined ? null : copy(session);
    });
  }

  async appendMessages(
    sessionId: string,
    messages: readonly SessionMessageDraft[],
    options?: AppendMessagesOptions,
  ): Promise<AppendMessagesResult> {
    const value = copy(messages);
    return this.transaction((transaction) => transaction.appendMessages(sessionId, value, options));
  }

  async listMessages(sessionId: string): Promise<readonly SessionMessage[]> {
    return this.runExclusive(() => copy(this.state.messages.get(sessionId) ?? []));
  }

  async listToolCalls(sessionId: string): Promise<readonly ToolCallRecord[]> {
    return this.runExclusive(() => copy(this.state.toolCalls.get(sessionId) ?? []));
  }

  async listToolResults(sessionId: string): Promise<readonly ToolResultRecord[]> {
    return this.runExclusive(() => copy(this.state.toolResults.get(sessionId) ?? []));
  }

  async listUsage(sessionId: string): Promise<readonly UsageRecord[]> {
    return this.runExclusive(() => copy(this.state.usages.get(sessionId) ?? []));
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    const value = copy(usage);
    await this.transaction((transaction) => transaction.recordUsage(value));
  }

  async getMigrationState(sessionId: string): Promise<MigrationStateRecord | null> {
    return this.runExclusive(() => {
      const migration = this.state.migrationStates.get(sessionId);
      return migration === undefined ? null : copy(migration);
    });
  }

  async saveMigrationState(state: MigrationStateRecord): Promise<void> {
    const value = copy(state);
    await this.transaction((transaction) => transaction.saveMigrationState(value));
  }

  async saveCheckpoint(checkpoint: CheckpointRecord): Promise<void> {
    const value = copy(checkpoint);
    await this.transaction((transaction) => transaction.saveCheckpoint(value));
  }

  async commitTurn(write: AtomicTurnWrite): Promise<AppendMessagesResult> {
    const value = copy(write);
    return this.transaction((transaction) => transaction.commitTurn(value));
  }

  async getCheckpoint(sessionId: string, checkpointId: string): Promise<CheckpointRecord | null> {
    return this.runExclusive(() => {
      const checkpoint = this.state.checkpoints.get(sessionId)?.find(({ id }) => id === checkpointId);
      return checkpoint === undefined ? null : copy(checkpoint);
    });
  }

  async listCheckpoints(sessionId: string): Promise<readonly CheckpointRecord[]> {
    return this.runExclusive(() => copy(this.state.checkpoints.get(sessionId) ?? []));
  }

  async transaction<T>(
    operation: (transaction: SessionRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.runExclusive(async () => {
      const next = copyState(this.state);
      const result = await operation(this.transactionFor(next));
      this.state = next;
      return result;
    });
  }
}
