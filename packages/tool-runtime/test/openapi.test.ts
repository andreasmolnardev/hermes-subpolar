import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createOpenApiToolDefinitions, discoverOpenApiOperations } from "../src/index.ts";

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

test("OpenAPI discovery keeps operation IDs stable when display summaries change", () => {
  const first = discoverOpenApiOperations({ openapi: "3.1.0", paths: { "/records": { get: { operationId: "listRecords", summary: "Records" } } } });
  const second = discoverOpenApiOperations({ openapi: "3.1.0", paths: { "/records": { get: { operationId: "listRecords", summary: "All records" } } } });
  assert.equal(first[0]?.operationId, second[0]?.operationId);
  assert.notEqual(first[0]?.label, second[0]?.label);
});

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

test("OpenAPI validates local body references before making a request", async () => {
  let requests = 0;
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document: {
      openapi: "3.1.0",
      components: { schemas: { Create: { type: "object", required: ["name"], properties: { name: { type: "string" } }, additionalProperties: false } } },
      paths: { "/records": { post: {
        operationId: "createRecord",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Create" } } } }
      } } }
    },
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["createRecord"],
    fetch: async () => { requests++; return new Response("ok"); }
  });
  assert.ok(tool && "handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ body: { extra: true } }), /does not match/);
  assert.equal(requests, 0);
  await tool.executable.handle.execute({ body: { name: "record" } });
  assert.equal(requests, 1);
});

test("OpenAPI rejects private DNS results and redirects", async () => {
  const [tool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["getRecord"],
    lookup: async () => ["192.168.1.10"],
    fetch: async () => new Response("should not run")
  });
  assert.ok(tool && "handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ id: "record" }), /private network/);

  const [redirectTool] = createOpenApiToolDefinitions({
    serviceName: "records",
    document,
    baseUrl: "https://api.example.test",
    allowedOperationIds: ["getRecord"],
    fetch: async () => new Response(null, { status: 302 })
  });
  assert.ok(redirectTool && "handle" in redirectTool.executable);
  await assert.rejects(redirectTool.executable.handle.execute({ id: "record" }), /redirects/);
});
