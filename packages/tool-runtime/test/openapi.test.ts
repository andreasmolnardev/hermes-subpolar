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
