import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  clearPinnedRuntime,
  createGateway,
  executeRequest,
  normalizeGatewayRequest,
  type GatewaySessionRepository
} from "../src/index.ts";
import {
  createGatewayEventMapper,
  type GatewayProtocolEvent
} from "../src/client.ts";
import type { ProviderRequest } from "chat-provider-interface";
import type { HarnessAtomicTurnWrite } from "harness";

const completion = {
  message: { role: "assistant" as const, content: "safe" },
  usage: { inputTokens: 1, outputTokens: 1 }
};

function fakeRepository(initialMessages: readonly Record<string, unknown>[] = []) {
  const messages = new Map<string, Record<string, unknown>[]>([["restart-session", [...initialMessages]]]);
  const writes: HarnessAtomicTurnWrite[] = [];
  const runtimes = new Map<string, "harness" | "python">();
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
  return { repository, messages, writes, runtimes };
}

test("gateway preserves legacy ChatMessage and policy snapshot inputs", async () => {
  const result = await executeRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "shell.exec", policy: "deny" }]
  }, {
    async complete(request) {
      assert.equal(request.model, "fake");
      assert.deepEqual(request.messages, [{ role: "user", content: "hello" }]);
      assert.deepEqual(request.tools, []);
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
});

test("gateway validates and normalizes request boundaries", () => {
  assert.throws(() => normalizeGatewayRequest({
    model: " ",
    messages: [],
    toolPolicies: []
  }), /model must be a non-empty string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: 42 } as never],
    toolPolicies: []
  }), /content must be a string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "x", policy: "invalid" } as never]
  }), /toolPolicies\[0\] is invalid/);
});

test("descriptor path preserves schema and metadata through harness adapter", async () => {
  clearPinnedRuntime("descriptor-session");
  const schema = { type: "object", properties: { query: { type: "string" } } } as const;
  const result = await executeRequest({
    model: "fake",
    sessionId: "descriptor-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "search",
      description: "Search safely",
      inputSchema: schema,
      source: "plugin.search",
      capabilities: { network: true },
      executable: { reference: "plugin.search" },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      const tool = request.tools[0] as unknown as Record<string, unknown>;
      assert.deepEqual(tool.parameters, schema);
      assert.deepEqual(tool.inputSchema, schema);
      assert.equal(tool.source, "plugin.search");
      assert.deepEqual(tool.capabilities, { network: true });
      assert.equal(tool.description, "Search safely");
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
});

test("mapped harness events stay ordered, deduplicate terminal, and redact diagnostics", async () => {
  clearPinnedRuntime("events-session");
  const events: GatewayProtocolEvent[] = [];
  await executeRequest({
    model: "fake",
    sessionId: "events-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    eventSink: event => events.push(event)
  }, { async complete() { return completion; } });

  assert.deepEqual(events.map(event => event.type), [
    "message.start",
    "status.update",
    "status.update",
    "message.complete"
  ]);

  const sinkEvents: GatewayProtocolEvent[] = [];
  const map = createGatewayEventMapper(event => sinkEvents.push(event));
  const terminal = {
    id: "event-1",
    requestId: "request-1",
    sessionId: "session-1",
    at: 1,
    type: "terminal" as const,
    outcome: "provider_failure" as const,
    message: "secret provider diagnostics"
  };
  await map(terminal);
  await map({ ...terminal, id: "event-2", at: 2 });
  assert.equal(sinkEvents.length, 1);
  assert.deepEqual(sinkEvents[0], {
    type: "error",
    session_id: "session-1",
    payload: { code: "harness.provider_failure", message: "Request failed" }
  });
  assert.equal(JSON.stringify(sinkEvents).includes("secret provider diagnostics"), false);
});

test("runtime selection remains pinned for session", async () => {
  clearPinnedRuntime("pinned-session");
  const requestShapes: Array<{ signal: boolean; cancellation: boolean }> = [];
  const provider = {
    async complete(request: ProviderRequest) {
      requestShapes.push({ signal: request.signal !== undefined, cancellation: request.cancellation !== undefined });
      return completion;
    }
  };

  await executeRequest({
    model: "fake",
    sessionId: "pinned-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await executeRequest({
    model: "fake",
    sessionId: "pinned-session",
    runtime: "python",
    messages: [{ role: "user", content: "two" }],
    toolPolicies: []
  }, provider);

  assert.deepEqual(requestShapes, [
    { signal: true, cancellation: true },
    { signal: true, cancellation: true }
  ]);
});

test("unsupported harness descriptor retains explicit Python fallback without duplicate call", async () => {
  clearPinnedRuntime("fallback-session");
  let calls = 0;
  const result = await executeRequest({
    model: "fake",
    sessionId: "fallback-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "boolean-schema",
      description: "legacy",
      inputSchema: true,
      source: "python",
      executable: { reference: "python:boolean-schema" },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      calls += 1;
      const tool = request.tools[0] as unknown as Record<string, unknown>;
      assert.equal(tool.inputSchema, true);
      assert.equal(request.signal, undefined);
      return completion;
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.message.content, "safe");
});

test("gateway instances reload runtime selection from a shared store", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const firstGateway = createGateway({ runtimeSelectionStore: store });
  const reloadedGateway = createGateway({ runtimeSelectionStore: store });
  const requestShapes: boolean[] = [];
  const provider = {
    async complete(request: ProviderRequest) {
      requestShapes.push(request.signal !== undefined);
      return completion;
    }
  };

  await firstGateway.executeRequest({
    model: "fake",
    sessionId: "shared-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await reloadedGateway.executeRequest({
    model: "fake",
    sessionId: "shared-session",
    runtime: "python",
    messages: [{ role: "user", content: "two" }],
    toolPolicies: []
  }, provider);

  assert.equal(selections.get("shared-session"), "harness");
  assert.deepEqual(requestShapes, [true, true]);
});

test("runtime selection is immutable while a turn is executing", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const gateway = createGateway({ runtimeSelectionStore: store });
  let releaseProvider: (() => void) | undefined;
  const provider = {
    async complete(request: ProviderRequest) {
      assert.equal(request.signal !== undefined, true);
      await new Promise<void>(resolve => { releaseProvider = resolve; });
      return completion;
    }
  };

  const turn = gateway.executeRequest({
    model: "fake",
    sessionId: "immutable-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await new Promise(resolve => setTimeout(resolve, 0));
  await store.save("immutable-session", "python");
  releaseProvider?.();
  await turn;

  assert.equal(selections.get("immutable-session"), "python");
});

test("injected gateway uses explicit fallback once when selected runtime is unsupported", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const gateway = createGateway({ runtimeSelectionStore: store });
  let calls = 0;
  await gateway.executeRequest({
    model: "fake",
    sessionId: "injected-fallback-session",
    runtime: "harness",
    runtimeFallback: {
      runtime: "python",
      supports: () => true,
      async execute(request, provider) {
        calls += 1;
        return await provider.complete({
          model: request.model,
          messages: request.messages.map(message => ({ role: message.role, content: message.content as string })),
          tools: []
        });
      }
    },
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "boolean-schema",
      description: "legacy",
      inputSchema: true,
      source: "python",
      executable: { reference: "python:boolean-schema" },
      policy: "allow"
    }]
  }, { async complete() { return completion; } });

  assert.equal(calls, 1);
  assert.equal(selections.get("injected-fallback-session"), "python");
});

test("injected session repository resumes persisted history after gateway restart", async () => {
  const fake = fakeRepository([{ role: "user", content: "start" }]);
  const runtimeSelectionStore = {
    load: (sessionId: string) => fake.runtimes.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => fake.runtimes.set(sessionId, runtime)
  };
  let providerCalls = 0;
  let toolEffects = 0;
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
  const request = {
    model: "fake",
    sessionId: "restart-session",
    runtime: "harness" as const,
    messages: [{ role: "user" as const, content: "start" }],
    toolPolicies: [{ toolName: "once", policy: "allow" as const }],
    toolExecutor: async () => {
      toolEffects += 1;
      return { content: "done" };
    },
    sessionRepository: fake.repository
  };

  await createGateway({ runtimeSelectionStore }).executeRequest(request, provider);
  await createGateway({ runtimeSelectionStore }).executeRequest({
    ...request,
    runtime: "python",
    messages: [{ role: "user", content: "resume" }]
  }, provider);

  assert.equal(fake.runtimes.get("restart-session"), "harness");
  assert.equal(toolEffects, 1);
  assert.equal(providerCalls, 3);
  assert.equal(fake.writes.length, 3);
  assert.deepEqual(fake.writes[0]?.messages.map(message => message.role), ["assistant", "tool"]);
  assert.equal(fake.messages.get("restart-session")?.some(message => message.role === "tool"), true);
});

test("normalized requests retain the injected session repository for harness execution", () => {
  const fake = fakeRepository();
  const normalized = normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    sessionRepository: fake.repository
  });

  assert.equal(normalized.sessionRepository, fake.repository);
});
