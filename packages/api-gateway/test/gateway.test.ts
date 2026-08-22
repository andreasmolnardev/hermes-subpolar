import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

import {
  createGateway,
  executeRequest,
  normalizeGatewayRequest,
  GatewayTurnLeaseError,
  GatewayTurnLeaseManager,
  type GatewaySessionRepository
} from "../src/index.ts";
import {
  createGatewayEventMapper,
  createTransportEventMapper,
  type GatewayProtocolEvent
} from "../src/client.ts";
import type { ProviderRequest, ProviderResult } from "chat-provider-interface";
import { HarnessProviderError, type HarnessAtomicTurnWrite } from "harness";
import { createToolHandle } from "tool-resolver";
import { SQLiteSessionRepository, type SessionRecord } from "data-layer";
import { createGatewayPersistenceAdapter } from "../src/persistence.ts";

const completion: ProviderResult = {
  message: { role: "assistant", content: "safe" },
  usage: { inputTokens: 1, outputTokens: 1 }
};

function fakeRepository(initialMessages: readonly Record<string, unknown>[] = []) {
  const messages = new Map<string, Record<string, unknown>[]>([["restart-session", [...initialMessages]]]);
  const writes: HarnessAtomicTurnWrite[] = [];
  const repository: GatewaySessionRepository = {
    async listMessages(sessionId) {
      return messages.get(sessionId) ?? [];
    },
    async commitTurn(write) {
      const current = messages.get(write.sessionId) ?? [];
      assert.equal(write.expectedNextSequence, current.length);
      writes.push(write);
      messages.set(write.sessionId, [...current, ...write.messages]);
    }
  };
  return { repository, messages, writes };
}

test("gateway validates request boundaries and rejects removed runtime fields", () => {
  assert.throws(() => normalizeGatewayRequest({
    model: " ",
    messages: [],
    toolPolicies: []
  }), /model must be a non-empty string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: 42 } as never],
    toolPolicies: []
  }), /must be a string or content parts/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [],
    toolPolicies: [],
    runtime: "unsupported"
  } as never), /field is unsupported: runtime/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [],
    toolPolicies: [],
    runtimeFallback: {}
  } as never), /field is unsupported: runtimeFallback/);
  assert.throws(() => createGateway({ runtimeConfig: {} } as never), /field is unsupported: runtimeConfig/);
});

test("gateway can route a normalized request through the staged Pi executor seam", async () => {
  let piCalls = 0;
  let providerCalls = 0;
  let seenModel: string | undefined;
  const result = await createGateway({
    piExecutor: async (request) => {
      piCalls += 1;
      seenModel = request.model;
      return completion;
    }
  }).executeRequest({
    model: "pi-model",
    sessionId: "pi-session",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: []
  }, {
    async complete() {
      providerCalls += 1;
      throw new Error("legacy provider should not be called");
    }
  });

  assert.equal(result.message.content, "safe");
  assert.equal(piCalls, 1);
  assert.equal(providerCalls, 0);
  assert.equal(seenModel, "pi-model");
});

test("unsupported executable references fail before provider effects", async () => {
  let providerCalls = 0;
  await assert.rejects(() => createGateway().executeRequest({
    model: "fake",
    messages: [{ role: "user", content: "lookup" }],
    toolPolicies: [{
      name: "lookup",
      description: "lookup",
      inputSchema: { type: "object" },
      source: "plugin",
      executable: { reference: "plugin:lookup" },
      policy: "allow"
    }]
  }, {
    async complete() {
      providerCalls += 1;
      return completion;
    }
  }), /executable reference is unsupported/);
  assert.equal(providerCalls, 0);
});

test("descriptor handles receive the harness tool AbortSignal", async () => {
  let seenSignal: AbortSignal | undefined;
  let providerCalls = 0;
  const result = await createGateway().executeRequest({
    model: "fake",
    requestId: "handle-request",
    sessionId: "handle-session",
    messages: [{ role: "user", content: "lookup" }],
    toolPolicies: [{
      name: "lookup",
      description: "lookup",
      inputSchema: { type: "object", properties: {} },
      source: "plugin",
      executable: { handle: createToolHandle(async (_args: unknown, signal: AbortSignal) => {
        seenSignal = signal;
        return "found";
      }) },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "lookup-call", name: "lookup", arguments: "{}" }]
          },
          usage: { inputTokens: 1, outputTokens: 1 }
        };
      }
      assert.equal(request.messages.at(-1)?.role, "tool");
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
  assert.equal(seenSignal instanceof AbortSignal, true);
  assert.equal(seenSignal?.aborted, false);
});

test("injected session repository resumes persisted history", async () => {
  const fake = fakeRepository([{ role: "user", content: "start" }]);
  let providerCalls = 0;
  const provider = {
    async complete(request: ProviderRequest) {
      providerCalls += 1;
      if (request.messages.some(message => message.role === "tool")) return completion;
      return {
        message: {
          role: "assistant" as const,
          content: "",
          toolCalls: [{ id: "once", name: "once", arguments: "{}" }]
        },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  };
  let toolEffects = 0;
  const request = {
    model: "fake",
    sessionId: "restart-session",
    messages: [{ role: "user" as const, content: "start" }],
    toolPolicies: [{ toolName: "once", policy: "allow" as const }],
    toolExecutor: async () => {
      toolEffects += 1;
      return { content: "done" };
    },
    sessionRepository: fake.repository
  };

  await createGateway().executeRequest(request, provider);
  await createGateway().executeRequest({ ...request, messages: [{ role: "user", content: "resume" }] }, provider);

  assert.equal(toolEffects, 1);
  assert.equal(providerCalls, 3);
  assert.equal(fake.writes.length, 3);
  assert.deepEqual(fake.writes[0]?.messages.map(message => message.role), ["assistant", "tool"]);
});

test("SQLite persistence adapter records tool checkpoints and fails closed on interruption", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-persistence-"));
  const repository = new SQLiteSessionRepository(join(directory, "state.db"));
  const session: SessionRecord = {
    schemaVersion: 1,
    id: "durable-session",
    workspaceId: "default",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime: { runtimeVersion: "api-gateway", schemaVersion: 1 },
  };
  await repository.createSession(session);
  const adapter = createGatewayPersistenceAdapter(repository);
  await adapter.prepareInbound(session.id, "turn-1", "test", [{ role: "user", content: "charge" }]);
  const call = { id: "non-idempotent-call", name: "charge", arguments: "{}" };
  const beforeTool = {
    requestId: "turn-1",
    sessionId: session.id,
    turnId: "turn-1",
    call,
    phase: "before-tool" as const,
    pendingToolCallIds: [call.id],
    completedToolCalls: [],
    at: "2026-01-01T00:00:01.000Z",
  };
  await adapter.checkpoint(beforeTool);
  assert.deepEqual((await repository.listMessages(session.id)).map(message => message.role), ["user", "assistant"]);
  assert.equal((await repository.listToolCalls(session.id)).length, 1);
  await assert.rejects(() => adapter.recover(session.id), /unresolved tool call/);

  await adapter.checkpoint({
    ...beforeTool,
    phase: "tool-completed",
    pendingToolCallIds: [],
    completedToolCalls: [{ call, result: { content: "charged", isError: false } }],
    result: { content: "charged", isError: false },
    at: "2026-01-01T00:00:02.000Z",
  });
  const recovery = await adapter.recover(session.id);
  assert.equal(recovery?.completedToolCallIds?.includes(call.id), true);
  assert.equal((await repository.listToolResults(session.id)).length, 1);
  repository.close();
});

test("harness provider request preserves signal and provider fidelity", async () => {
  const controller = new AbortController();
  const options = { temperature: 0.25, maxOutputTokens: 128, reasoningEffort: "high" as const };
  let seen: ProviderRequest | undefined;
  const result = await executeRequest({
    model: "fidelity-model",
    sessionId: "fidelity-session",
    requestId: "fidelity-request",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    signal: controller.signal,
    options
  }, {
    async complete(request) {
      seen = request;
      return completion;
    }
  });

  assert.equal(seen?.signal !== undefined, true);
  assert.equal(seen?.signal, seen?.cancellation);
  assert.deepEqual(seen?.options, options);
  assert.deepEqual(result, completion);
});

test("mapped events stay ordered and deduplicate terminal output", async () => {
  const events: GatewayProtocolEvent[] = [];
  await executeRequest({
    model: "fake",
    sessionId: "events-session",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    eventSink: event => events.push(event)
  }, { async complete() { return completion; } });
  assert.deepEqual(events.map(event => event.type), ["message.start", "status.update", "status.update", "message.complete"]);

  const mapped: GatewayProtocolEvent[] = [];
  const map = createGatewayEventMapper(event => mapped.push(event));
  const terminal = { id: "one", requestId: "request", sessionId: "session", at: 1, type: "terminal" as const, outcome: "provider_failure" as const, message: "secret" };
  await map(terminal);
  await map({ ...terminal, id: "two" });
  assert.equal(mapped.length, 1);
  assert.equal(JSON.stringify(mapped).includes("secret"), false);

  const transport = [] as unknown[];
  const transportMap = createTransportEventMapper(event => transport.push(event));
  await transportMap({ ...terminal, outcome: "provider_failure" });
  await transportMap({ ...terminal, id: "three" });
  assert.equal(transport.length, 1);
});

test("gateway serializes concurrent turns for one session", async () => {
  const gateway = createGateway({ turnLease: { defaultWaitTimeoutMs: 1_000 } });
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  const provider = {
    async complete() {
      if (releaseFirst === undefined) {
        firstStarted();
        await new Promise<void>(resolve => { releaseFirst = resolve; });
      }
      return completion;
    }
  };
  const request = (message: string) => ({
    model: "fake",
    sessionId: "serialized-session",
    messages: [{ role: "user" as const, content: message }],
    toolPolicies: []
  });
  const first = gateway.executeRequest(request("one"), provider);
  await started;
  const second = gateway.executeRequest(request("two"), provider);
  await new Promise(resolve => setTimeout(resolve, 0));
  releaseFirst();
  await Promise.all([first, second]);
});

test("gateway reports bounded lease cancellation", async () => {
  const gateway = createGateway({ turnLease: { defaultWaitTimeoutMs: 1_000 } });
  let release!: () => void;
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const provider = {
    async complete() {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return completion;
    }
  };
  const request = (signal?: AbortSignal) => ({
    model: "fake",
    sessionId: "lease-session",
    messages: [{ role: "user" as const, content: "hello" }],
    toolPolicies: [],
    ...(signal === undefined ? {} : { signal })
  });
  const first = gateway.executeRequest(request(), provider);
  await firstStarted;
  const controller = new AbortController();
  const cancelled = gateway.executeRequest(request(controller.signal), provider);
  controller.abort();
  await assert.rejects(cancelled, error => error instanceof GatewayTurnLeaseError && error.code === "cancelled");
  release();
  await first;
});

test("turn lease release is generation-safe", async () => {
  const manager = new GatewayTurnLeaseManager({ defaultWaitTimeoutMs: 10 });
  const first = await manager.acquire("generation-session");
  const secondPending = manager.acquire("generation-session");
  assert.equal(first.release(), true);
  const second = await secondPending;
  assert.equal(manager.release("generation-session", first.generation), false);
  await assert.rejects(manager.acquire("generation-session", { waitTimeoutMs: 1 }), error => {
    assert(error instanceof GatewayTurnLeaseError);
    return error.code === "wait_timeout";
  });
  assert.equal(second.release(), true);
});

test("gateway retries transient provider failures through the harness", async () => {
  let calls = 0;
  await executeRequest({
    model: "retry-model",
    sessionId: "retry-session",
    messages: [{ role: "user", content: "retry" }],
    toolPolicies: [],
    retryPolicy: { maxAttempts: 2 }
  }, {
    async complete() {
      calls += 1;
      if (calls === 1) throw new HarnessProviderError("busy", { category: "overloaded" });
      return completion;
    }
  });
  assert.equal(calls, 2);
});
