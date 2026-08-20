import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createOpenApiToolDefinitions } from "../src/index.ts";

const document = {
  openapi: "3.1.0",
  paths: {
    "/records/{id}": {
      get: {
        operationId: "getRecord",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "verbose", in: "query", schema: { type: "boolean" } }
        ]
      }
    }
  }
};

test("OpenAPI tools use the configured origin and declared parameters", async () => {
  let request: Request | undefined;
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test/v1",
    allowedOperationIds: ["getRecord"],
    fetch: async input => {
      request = input instanceof Request ? input : new Request(input);
      return new Response('{"id":"a/b"}', { status: 200 });
    }
  });

  assert.ok(tool && "handle" in tool.executable);
  const result = await tool!.executable.handle.execute({ id: "a/b", verbose: true });
  assert.deepEqual(result, { status: 200, ok: true, body: '{"id":"a/b"}', truncated: false });
  assert.equal(request?.url, "https://api.example.test/v1/records/a%2Fb?verbose=true");
});

test("OpenAPI tools reject non-HTTPS origins", () => {
  assert.throws(() => createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "http://api.example.test",
    allowedOperationIds: ["getRecord"]
  }), /HTTPS/);
});

test("OpenAPI tools reject untrusted documents and credential-controlled headers", () => {
  assert.throws(() => createOpenApiToolDefinitions({
    serviceName: "records",
    document: { ...document, servers: [{ url: "https://attacker.example" }] },
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["getRecord"],
  }), /server overrides/);
  assert.throws(() => createOpenApiToolDefinitions({
    serviceName: "records",
    document: {
      openapi: "3.1.0",
      paths: { "/records": { get: { operationId: "list", parameters: [{ name: "Authorization", in: "header", schema: { type: "string" } }] } } },
    },
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["list"],
  }), /credential header/);
});

test("OpenAPI responses are bounded before conversion to text", async () => {
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["getRecord"],
    maxResponseBytes: 4,
    fetch: async () => new Response("123456789"),
  });
  assert.ok(tool && "handle" in tool.executable);
  assert.deepEqual(await tool.executable.handle.execute({ id: "record" }), {
    status: 200,
    ok: true,
    body: "1234",
    truncated: true,
  });
});

test("OpenAPI validates arguments before the injected fetch port", async () => {
  let requests = 0;
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test/v1",
    allowedOperationIds: ["getRecord"],
    fetch: async () => { requests += 1; return new Response("ok"); }
  });
  assert.ok(tool && "handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ id: "ok", verbose: "yes" }), /wrong type/);
  await assert.rejects(tool.executable.handle.execute({ id: "ok", extra: true }), /undocumented/);
  assert.equal(requests, 0);
});

test("OpenAPI rejects private resolved origins", async () => {
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test/v1",
    allowedOperationIds: ["getRecord"],
    resolveHostname: async () => ["192.168.1.10"],
    fetch: async () => new Response("not reached")
  });
  assert.ok(tool && "handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ id: "ok" }), error => {
    assert.equal((error as { code: string }).code, "PRIVATE_ADDRESS");
    return true;
  });
});

test("OpenAPI redacts injected fetch failures and cancels on timeout", async () => {
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test/v1",
    allowedOperationIds: ["getRecord"],
    timeoutMs: 10,
    fetch: async () => { throw new Error("secret authorization token"); }
  });
  assert.ok(tool && "handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ id: "ok" }), error => {
    assert.equal((error as { code: string }).code, "REQUEST_FAILED");
    assert.doesNotMatch((error as Error).message, /secret/);
    return true;
  });

  const [timeoutTool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test/v1",
    allowedOperationIds: ["getRecord"],
    timeoutMs: 5,
    fetch: async (_input, init) => await new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }))
  });
  assert.ok(timeoutTool && "handle" in timeoutTool.executable);
  await assert.rejects(timeoutTool.executable.handle.execute({ id: "ok" }), error => {
    assert.equal((error as { code: string }).code, "TIMEOUT");
    return true;
  });
});
