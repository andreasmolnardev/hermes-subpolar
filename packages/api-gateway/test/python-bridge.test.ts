import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "bun:test";

import {
  PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
  PythonToolBridge,
  PythonToolBridgeError,
  PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
  PythonRuntimeBridge,
  PythonRuntimeBridgeError,
  createAllowlistedEnvironment,
  createPythonToolBridgeExecutor,
  createPythonToolBridgeSubprocessTransport,
  createPythonRuntimeBridgeSubprocessTransport,
  type PythonToolBridgeRequest,
  type PythonToolBridgeProcess,
  type PythonRuntimeBridgeEvent,
  type PythonRuntimeBridgeProcess,
  type PythonRuntimeBridgeRequest
} from "../src/index.ts";

const call = {
  requestId: "request-1",
  toolCallId: "call-1",
  tool: { name: "safe.tool", reference: "python:safe.tool" },
  arguments: { query: "hello" },
  cwd: "/workspace",
  env: { PATH: "/bin" },
  deadline: Date.now() + 2_000
} as const;

test("bridge sends a versioned request and returns only structured tool output", async () => {
  let sent: PythonToolBridgeRequest | undefined;
  const bridge = new PythonToolBridge({
    async send(request) {
      sent = request;
      return {
        protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
        type: "tool.result",
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        content: "result"
      };
    }
  });

  assert.deepEqual(await bridge.execute(call), { content: "result" });
  assert.deepEqual(sent, { protocolVersion: 1, type: "tool.call", ...call });
});

test("bridge rejects mismatched IDs and does not leak worker diagnostics", async () => {
  const secret = "super-secret-tool-argument";
  const bridge = new PythonToolBridge({
    async send() {
      return {
        protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
        type: "error",
        requestId: "other-request",
        toolCallId: "other-call",
        error: { code: "worker_error", message: secret }
      };
    }
  });

  await assert.rejects(bridge.execute({ ...call, arguments: { secret } }), error => {
    assert(error instanceof PythonToolBridgeError);
    assert.equal(error.code, "invalid_response");
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test("bridge aborts a worker at the request deadline", async () => {
  let aborted = false;
  const bridge = new PythonToolBridge({
    send(_request, { signal }) {
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("worker had a secret diagnostic"));
        }, { once: true });
      });
    }
  });

  await assert.rejects(bridge.execute({ ...call, deadline: Date.now() + 10 }), error => {
    assert(error instanceof PythonToolBridgeError);
    assert.equal(error.code, "deadline_exceeded");
    return true;
  });
  assert.equal(aborted, true);
});

test("bridge propagates caller cancellation without exposing transport errors", async () => {
  const controller = new AbortController();
  const bridge = new PythonToolBridge({
    send(_request, { signal }) {
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("private worker failure")), { once: true });
      });
    }
  });
  const pending = bridge.execute({ ...call, deadline: Date.now() + 10_000 }, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => {
    assert(error instanceof PythonToolBridgeError);
    assert.equal(error.code, "cancelled");
    assert.equal(error.message.includes("private worker failure"), false);
    return true;
  });
});

test("subprocess transport uses only the supplied cwd and environment and kills the process", async () => {
  let received = "";
  let killed = false;
  const process: PythonToolBridgeProcess = {
    stdin: {
      write(chunk) {
        received = chunk;
        return chunk.length;
      },
      end() {
        return undefined;
      }
    },
    stdout: {
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({
          protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
          type: "tool.result",
          requestId: "request-1",
          toolCallId: "call-1",
          content: "ok"
        }) + "\n";
      }
    },
    kill() {
      killed = true;
    }
  };
  let spawnOptions: { cwd: string; env: Readonly<Record<string, string>> } | undefined;
  const transport = createPythonToolBridgeSubprocessTransport((command, options) => {
    assert.deepEqual(command, ["python", "worker.py"]);
    spawnOptions = options;
    return process;
  }, ["python", "worker.py"]);

  const bridge = new PythonToolBridge(transport);
  assert.deepEqual(await bridge.execute(call), { content: "ok" });
  assert.deepEqual(spawnOptions, { cwd: "/workspace", env: { PATH: "/bin" } });
  assert.equal(JSON.parse(received).env.HOME, undefined);
  assert.equal(killed, true);
});

test("executor allowlists tool references, environment, cwd, IDs, and deadline", async () => {
  let request: PythonToolBridgeRequest | undefined;
  const deadline = Date.now() + 2_000;
  const executor = createPythonToolBridgeExecutor({
    bridge: new PythonToolBridge({
      async send(value) {
        request = value;
        return {
          protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
          type: "tool.result",
          requestId: value.requestId,
          toolCallId: value.toolCallId,
          content: "done"
        };
      }
    }),
    tools: [{ name: "safe.tool", reference: "python:safe.tool" }],
    cwd: "/workspace",
    environment: { PATH: "/bin", SECRET: "must-not-pass" },
    environmentAllowlist: ["PATH"],
    deadline
  });

  const result = await executor({
    requestId: "request-2",
    sessionId: "session-2",
    call: { id: "call-2", name: "safe.tool", arguments: "{}" },
    arguments: { value: true },
    signal: new AbortController().signal
  });
  assert.deepEqual(result, { content: "done" });
  assert.equal(request?.tool.reference, "python:safe.tool");
  assert.equal(request?.cwd, "/workspace");
  assert.deepEqual(request?.env, { PATH: "/bin" });
  assert.equal(request?.deadline, deadline);
  assert.equal(request?.requestId, "request-2");
  assert.equal(request?.toolCallId, "call-2");
});

test("environment helper copies only allowlisted variables", () => {
  assert.deepEqual(
    createAllowlistedEnvironment({ PATH: "/bin", TOKEN: "secret" }, ["PATH"]),
    { PATH: "/bin" }
  );
});

const runtimeResult = {
  message: { role: "assistant" as const, content: "python result" },
  usage: { inputTokens: 2, outputTokens: 3 }
};

test("runtime bridge carries a whole structured turn and validates event correlation", async () => {
  let sent: PythonRuntimeBridgeRequest | undefined;
  const events: PythonRuntimeBridgeEvent[] = [];
  const bridge = new PythonRuntimeBridge({
    async send(request, options) {
      sent = request;
      await options.onEvent?.({
        protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
        type: "runtime.event",
        requestId: request.requestId,
        sessionId: request.sessionId,
        event: { type: "text.delta", text: "hello" }
      });
      return {
        protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
        type: "runtime.result",
        requestId: request.requestId,
        sessionId: request.sessionId,
        result: runtimeResult
      };
    }
  });

  assert.deepEqual(await bridge.execute({
    requestId: "request-runtime",
    sessionId: "session-runtime",
    model: "model",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "search", executable: { reference: "python:search" } }],
    policies: [{ toolName: "search", policy: "allow" }],
    cwd: "/workspace",
    environment: { PATH: "/bin" },
    credentialHandles: ["credential:provider"],
    deadline: Date.now() + 2_000,
    cancellation: { requested: false }
  }, undefined, event => { events.push(event); }), runtimeResult);
  assert.equal(sent?.protocolVersion, 1);
  assert.equal(sent?.type, "runtime.turn");
  assert.deepEqual(sent?.credentialHandles, ["credential:provider"]);
  assert.deepEqual(events.map(event => event.event), [{ type: "text.delta", text: "hello" }]);
});

test("runtime bridge rejects a correlated response with a private worker diagnostic", async () => {
  const bridge = new PythonRuntimeBridge({
    async send(request) {
      return {
        protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
        type: "error",
        requestId: request.requestId,
        sessionId: request.sessionId,
        error: { code: "worker_error", message: "private credential diagnostic" }
      };
    }
  });
  await assert.rejects(bridge.execute({
    requestId: "request-runtime-error",
    sessionId: "session-runtime-error",
    model: "model",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    policies: [],
    cwd: "/workspace",
    environment: {},
    credentialHandles: [],
    deadline: Date.now() + 2_000,
    cancellation: { requested: false }
  }), error => {
    assert(error instanceof PythonRuntimeBridgeError);
    assert.equal(error.code, "worker_error");
    assert.equal(error.message.includes("private credential"), false);
    return true;
  });
});

test("runtime subprocess transport always kills the one-turn worker", async () => {
  let killed = false;
  let received = "";
  const process: PythonRuntimeBridgeProcess = {
    stdin: {
      write(chunk) {
        received = chunk;
        return chunk.length;
      },
      end() { return undefined; }
    },
    stdout: {
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({
          protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
          type: "runtime.result",
          requestId: "request-runtime-process",
          sessionId: "session-runtime-process",
          result: runtimeResult
        }) + "\n";
      }
    },
    kill() { killed = true; }
  };
  const transport = createPythonRuntimeBridgeSubprocessTransport((command, options) => {
    assert.deepEqual(command, ["python", "runtime.py"]);
    assert.equal(options.cwd, "/workspace");
    assert.deepEqual(options.env, { PATH: "/bin" });
    return process;
  }, ["python", "runtime.py"]);
  const bridge = new PythonRuntimeBridge(transport);
  await bridge.execute({
    requestId: "request-runtime-process",
    sessionId: "session-runtime-process",
    model: "model",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    policies: [],
    cwd: "/workspace",
    environment: { PATH: "/bin" },
    credentialHandles: [],
    deadline: Date.now() + 2_000,
    cancellation: { requested: false }
  });
  assert.equal(JSON.parse(received).credentialHandles.length, 0);
  assert.equal(killed, true);
});

test("runtime subprocess transport integrates with the Python worker", async () => {
  const home = mkdtempSync(join(tmpdir(), "hermes-runtime-bridge-"));
  const workspace = join(home, "workspace");
  const previousHome = process.env.HERMES_HOME;
  const python = Bun.which("python3");
  assert(python !== null, "a system Python executable is required");
  mkdirSync(workspace);
  process.env.HERMES_HOME = home;

  try {
    const transport = createPythonRuntimeBridgeSubprocessTransport((command, options) => {
      const child = Bun.spawn([...command], {
        cwd: options.cwd,
        env: options.env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore"
      });
      if (child.stdin === null || typeof child.stdin === "number" || child.stdout === null) {
        throw new Error("Python worker pipes were not created");
      }
      return {
        stdin: child.stdin,
        stdout: child.stdout,
        kill() { child.kill(); }
      };
    }, [python, resolve(import.meta.dir, "../../../hermes_cli/migration/python_runtime_bridge_worker.py")]);
    const bridge = new PythonRuntimeBridge(transport);
    const call = {
      requestId: "runtime-subprocess-request",
      sessionId: "runtime-subprocess-session",
      messages: [{ role: "user" as const, content: "hello" }],
      tools: [],
      policies: [],
      cwd: workspace,
      environment: {},
      credentialHandles: [],
      deadline: Date.now() + 10_000,
      cancellation: { requested: false as const }
    };

    assert.deepEqual(await bridge.execute({ ...call, model: "test:deterministic" }), {
      message: { role: "assistant", content: "deterministic test response" },
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: "stop"
    });

    const productionModel = "production-model-must-not-leak";
    await assert.rejects(bridge.execute({
      ...call,
      requestId: "runtime-production-request",
      sessionId: "runtime-production-session",
      model: productionModel,
      deadline: Date.now() + 10_000
    }), error => {
      assert(error instanceof PythonRuntimeBridgeError);
      assert.equal(error.code, "worker_error");
      assert.equal(error.requestId, "runtime-production-request");
      assert.equal(error.sessionId, "runtime-production-session");
      assert.equal(error.message.includes(productionModel), false);
      return true;
    });
  } finally {
    if (previousHome === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});
