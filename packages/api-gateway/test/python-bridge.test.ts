import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
  PythonToolBridge,
  PythonToolBridgeError,
  createAllowlistedEnvironment,
  createPythonToolBridgeExecutor,
  createPythonToolBridgeSubprocessTransport,
  type PythonToolBridgeRequest,
  type PythonToolBridgeProcess
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
