import type {
  AppendMessagesResult,
  AtomicTurnWrite,
  CheckpointRecord,
  JsonObject,
  MigrationStateRecord,
  SessionMessage,
  SessionMessageDraft,
  SessionRepository,
  SessionRepositoryTransaction,
  ToolCallRecord,
  ToolResultRecord,
} from "data-layer";
import type {
  HarnessAtomicTurnWrite,
  HarnessMessage,
  HarnessMigrationStateMetadata,
  HarnessPersistedMessageDraft,
  HarnessPersistencePort,
  HarnessRecoveredToolCall,
  HarnessRuntimeMetadata,
  HarnessSessionRepository,
  HarnessSessionSetup,
  HarnessToolCheckpoint,
} from "harness";
import type { ProviderMessage } from "chat-provider-interface";

const RUNTIME: HarnessRuntimeMetadata = { runtimeVersion: "api-gateway", schemaVersion: 1 };

function asHarnessMessage(message: SessionMessage): HarnessMessage {
  return message as unknown as HarnessMessage;
}

function asDataDraft(message: HarnessPersistedMessageDraft): SessionMessageDraft {
  return message as unknown as SessionMessageDraft;
}

function asDataWrite(write: AtomicTurnWrite): AtomicTurnWrite {
  return write;
}

function dataRuntime(runtime: HarnessRuntimeMetadata): MigrationStateRecord["runtime"] {
  return runtime as MigrationStateRecord["runtime"];
}

function completedToolCalls(
  calls: readonly ToolCallRecord[],
  results: readonly ToolResultRecord[],
): readonly HarnessRecoveredToolCall[] {
  const callsById = new Map(calls.map(call => [call.id, call]));
  return results.map(result => {
    const call = callsById.get(result.toolCallId);
    if (call === undefined) throw new Error(`Recovery references unknown tool result: ${result.toolCallId}`);
    return {
      call: {
        id: call.id,
        name: call.name,
        arguments: typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments),
      },
      result: {
        content: result.content,
        isError: result.isError,
      },
    };
  });
}

function checkpointSnapshot(checkpoint: HarnessToolCheckpoint): JsonObject {
  return {
    turnId: checkpoint.turnId,
    callId: checkpoint.call.id,
    phase: checkpoint.phase,
    pendingToolCallIds: [...checkpoint.pendingToolCallIds],
    completedToolCallIds: checkpoint.completedToolCalls.map(completed => completed.call.id),
  };
}

function toolResultDraft(checkpoint: HarnessToolCheckpoint): SessionMessageDraft | undefined {
  if (checkpoint.phase !== "tool-completed" || checkpoint.result === undefined) return undefined;
  const result = checkpoint.result;
  return {
    id: `${checkpoint.turnId}:tool-result:${checkpoint.call.id}`,
    role: "tool",
    content: result.content as SessionMessageDraft["content"],
    createdAt: checkpoint.at,
    name: checkpoint.call.name,
    toolCallId: checkpoint.call.id,
    toolResult: {
      toolCallId: checkpoint.call.id,
      content: result.content as SessionMessageDraft["content"],
      isError: result.isError === true,
      toolName: checkpoint.call.name,
    },
    ...(result.truncated === undefined ? {} : { metadata: { truncated: result.truncated } }),
  };
}

async function commitTurnInTransaction(
  transaction: SessionRepositoryTransaction,
  write: HarnessAtomicTurnWrite,
): Promise<AppendMessagesResult> {
  const existing = await transaction.listMessages(write.sessionId);
  const callIds = new Set(existing.flatMap(message => message.toolCalls?.map(call => call.id) ?? []));
  const resultIds = new Set(existing.flatMap(message => message.toolResult === undefined ? [] : [message.toolResult.toolCallId]));
  const messages = write.messages.flatMap(message => {
    if (message.role === "assistant" && message.toolCalls !== undefined) {
      const remainingCalls = message.toolCalls.filter(call => !callIds.has(call.id));
      if (remainingCalls.length === 0) return [];
      return [{ ...message, toolCalls: remainingCalls }];
    }
    if (message.role === "tool" && message.toolCallId !== undefined && resultIds.has(message.toolCallId)) return [];
    return [message];
  });
  const currentNextSequence = existing.length;
  const checkpoint = write.checkpoint === undefined ? undefined : {
    ...write.checkpoint,
    messageSequence: currentNextSequence + messages.length,
    runtime: dataRuntime(write.checkpoint.runtime),
  } satisfies CheckpointRecord;
  const migrationState = write.migrationState === undefined ? undefined : {
    ...write.migrationState,
    runtime: dataRuntime(write.migrationState.runtime),
  } satisfies MigrationStateRecord;
  return transaction.commitTurn(asDataWrite({
    sessionId: write.sessionId,
    messages: messages.map(asDataDraft),
    expectedNextSequence: currentNextSequence,
    ...(write.usage === undefined ? {} : { usage: write.usage }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
    ...(migrationState === undefined ? {} : { migrationState }),
  }));
}

export type GatewayPersistenceAdapter = HarnessPersistencePort & HarnessSessionRepository;

export type GatewayInboundPreparer = {
  prepareInbound(sessionId: string, requestId: string, model: string, messages: readonly ProviderMessage[]): Promise<void>;
};

export function createGatewayPersistenceAdapter(repository: SessionRepository): GatewayPersistenceAdapter & GatewayInboundPreparer {
  const adapter: GatewayPersistenceAdapter & GatewayInboundPreparer = {
    async ensureSession(sessionId: string, setup?: HarnessSessionSetup): Promise<void> {
      if (await repository.getSession(sessionId) !== null) return;
      const createdAt = setup?.createdAt ?? new Date().toISOString();
      await repository.createSession({
        schemaVersion: 1,
        id: sessionId,
        workspaceId: setup?.workspaceId ?? "default",
        status: "active",
        createdAt,
        updatedAt: createdAt,
        runtime: setup?.runtime === undefined ? RUNTIME : dataRuntime(setup.runtime),
        ...(setup?.model === undefined ? {} : { model: setup.model }),
      });
    },

    async listMessages(sessionId: string): Promise<readonly HarnessMessage[]> {
      return (await repository.listMessages(sessionId)).map(asHarnessMessage);
    },

    async prepareInbound(sessionId: string, requestId: string, model: string, messages: readonly ProviderMessage[]): Promise<void> {
      const inbound = [...messages].reverse().find(message => message.role === "user");
      if (inbound === undefined) return;
      await adapter.ensureSession!(sessionId, { sessionId, model, runtime: RUNTIME, createdAt: new Date().toISOString() });
      await repository.transaction(async transaction => {
        const existing = await transaction.listMessages(sessionId);
        const last = existing.at(-1);
        if (last?.role === "user" && JSON.stringify(last.content) === JSON.stringify(inbound.content)) return;
        await transaction.commitTurn({
          sessionId,
          messages: [{
            id: `${requestId}:inbound`,
            role: "user",
            content: inbound.content as SessionMessageDraft["content"],
            createdAt: new Date().toISOString(),
          }],
          expectedNextSequence: existing.length,
        });
      });
    },

    async recover(sessionId: string) {
      const state = await repository.getMigrationState(sessionId);
      if (state?.recovery === undefined) return undefined;
      const calls = await repository.listToolCalls(sessionId);
      const results = await repository.listToolResults(sessionId);
      const completed = completedToolCalls(calls, results);
      const completedIds = new Set(results.map(result => result.toolCallId));
      const pending = state.recovery.pendingToolCallIds ?? [];
      if (pending.some(callId => !completedIds.has(callId))) {
        throw new Error("Recovery has an unresolved tool call; operator recovery is required");
      }
      return {
        ...state.recovery,
        completedToolCallIds: [...completedIds],
        completedToolCalls: completed,
      };
    },

    async checkpoint(checkpoint: HarnessToolCheckpoint): Promise<void> {
      await repository.transaction(async transaction => {
        const existing = await transaction.listMessages(checkpoint.sessionId);
        const hasCall = existing.some(message => message.toolCalls?.some(call => call.id === checkpoint.call.id));
        const hasResult = existing.some(message => message.toolResult?.toolCallId === checkpoint.call.id);
        const drafts: SessionMessageDraft[] = [];
        if (!hasCall) {
          drafts.push({
            id: `${checkpoint.turnId}:tool-call:${checkpoint.call.id}`,
            role: "assistant",
            content: "",
            createdAt: checkpoint.at,
            toolCalls: [checkpoint.call],
          });
        }
        const result = toolResultDraft(checkpoint);
        if (!hasResult && result !== undefined) drafts.push(result);
        const previous = await transaction.getMigrationState(checkpoint.sessionId);
        const recovery = {
          turnId: checkpoint.turnId,
          status: "running" as const,
          startedAt: previous?.recovery?.startedAt ?? checkpoint.at,
          updatedAt: checkpoint.at,
          checkpointId: `${checkpoint.turnId}:checkpoint:${checkpoint.call.id}:${checkpoint.phase}`,
          pendingToolCallIds: [...checkpoint.pendingToolCallIds],
        };
        const persistedCheckpoint: CheckpointRecord = {
          schemaVersion: 1,
          id: recovery.checkpointId,
          sessionId: checkpoint.sessionId,
          messageSequence: existing.length + drafts.length,
          createdAt: checkpoint.at,
          reason: "before-tool",
          runtime: RUNTIME,
          snapshot: checkpointSnapshot(checkpoint),
        };
        await transaction.commitTurn({
          sessionId: checkpoint.sessionId,
          messages: drafts,
          expectedNextSequence: existing.length,
          checkpoint: persistedCheckpoint,
          migrationState: {
            schemaVersion: 1,
            sessionId: checkpoint.sessionId,
            updatedAt: checkpoint.at,
            runtime: RUNTIME,
            recovery,
          },
        });
      });
    },

    async commitTurn(write: HarnessAtomicTurnWrite): Promise<unknown> {
      return repository.transaction(transaction => commitTurnInTransaction(transaction, write));
    },

    async transaction<T>(operation: (transaction: Pick<HarnessSessionRepository, "commitTurn">) => Promise<T>): Promise<T> {
      return repository.transaction(async transaction => operation({
        commitTurn: write => commitTurnInTransaction(transaction, write),
      }));
    },
  };
  return adapter;
}
