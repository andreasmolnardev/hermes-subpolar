import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type OpenApiToolOptions = {
  readonly serviceName: string;
  readonly document: unknown;
  readonly baseUrl: string;
  readonly allowedOperationIds: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  readonly maxResponseBytes?: number;
};

type Operation = {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly parameters: readonly unknown[];
  readonly requestBody?: { readonly schema: JsonSchema; readonly required: boolean };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operationList(document: unknown, allowed: ReadonlySet<string>): readonly Operation[] {
  validateDocument(document);
  if (!isRecord(document) || !isRecord(document.paths)) throw new TypeError("OpenAPI document has no paths");
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith("/") || !isRecord(item)) continue;
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const definition = item[method];
      if (!isRecord(definition) || typeof definition.operationId !== "string" || !allowed.has(definition.operationId)) continue;
      const parameters = [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(definition.parameters) ? definition.parameters : [])];
      let requestBody: Operation["requestBody"];
      if (definition.requestBody !== undefined) {
        if (!isRecord(definition.requestBody) || !isRecord(definition.requestBody.content) ||
            !isRecord(definition.requestBody.content["application/json"]) ||
            definition.requestBody.content["application/json"].schema === undefined) {
          throw new TypeError(`OpenAPI operation ${definition.operationId} must declare an application/json body`);
        }
        requestBody = {
          schema: validateJsonSchema(definition.requestBody.content["application/json"].schema, definition.operationId),
          required: definition.requestBody.required === true,
        };
      }
      operations.push({ id: definition.operationId, method: method.toUpperCase(), path, parameters,
        ...(requestBody === undefined ? {} : { requestBody }) });
    }
  }
  return operations;
}

function validateDocument(document: unknown): void {
  if (!isRecord(document) || document.openapi !== "3.1.0" || !isRecord(document.paths)) {
    throw new TypeError("OpenAPI document must be OpenAPI 3.1.0 with paths");
  }
  if (document.servers !== undefined) throw new TypeError("OpenAPI server overrides are not supported");
  const refs: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!isRecord(value)) return;
    if (typeof value.$ref === "string") refs.push(value.$ref);
    for (const item of Object.values(value)) visit(item);
  };
  visit(document);
  if (refs.some(ref => !ref.startsWith("#"))) throw new TypeError("OpenAPI external references are not supported");
}

function parameterSchema(operation: Operation): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const parameter of operation.parameters) {
    if (!isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string" || !isRecord(parameter.schema)) {
      throw new TypeError(`OpenAPI operation ${operation.id} has an unsupported parameter`);
    }
    if (!["path", "query", "header"].includes(parameter.in)) throw new TypeError(`OpenAPI operation ${operation.id} has an unsupported parameter location`);
    if (parameter.in === "header" && /^(?:authorization|cookie|proxy-authorization|set-cookie|x-api-key)$/i.test(parameter.name)) {
      throw new TypeError(`OpenAPI operation ${operation.id} declares a credential header`);
    }
    properties[parameter.name] = validateJsonSchema(parameter.schema, `${operation.id}.${parameter.name}`);
    if (parameter.required === true) required.push(parameter.name);
  }
  if (operation.requestBody !== undefined) {
    properties.body = operation.requestBody.schema;
    if (operation.requestBody.required) required.push("body");
  }
  return { type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("OpenAPI tool arguments must be an object");
  return value;
}

async function responseBytes(response: Response, maxBytes: number): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
  if (response.body === null) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - size;
      if (remaining <= 0) { truncated = true; await reader.cancel(); break; }
      if (next.value.byteLength > remaining) {
        chunks.push(next.value.slice(0, remaining));
        size += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, truncated };
}

async function callOperation(operation: Operation, inputValue: unknown, options: OpenApiToolOptions): Promise<Record<string, unknown>> {
  const input = inputObject(inputValue);
  if (operation.requestBody?.required && input.body === undefined) throw new TypeError("OpenAPI request body is required");
  const declared = new Set(operation.parameters.flatMap(parameter => isRecord(parameter) && typeof parameter.name === "string" ? [parameter.name] : []));
  if (operation.requestBody !== undefined) declared.add("body");
  if (Object.keys(input).some(key => !declared.has(key))) throw new TypeError("OpenAPI arguments contain an undocumented field");
  let path = operation.path;
  if (path.includes("//") || path.split("/").includes("..")) throw new TypeError("OpenAPI operation path is unsafe");
  const url = new URL(options.baseUrl);
  for (const parameter of operation.parameters) {
    if (!isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string") continue;
    const value = input[parameter.name];
    if (value === undefined) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new TypeError(`OpenAPI parameter ${parameter.name} must be scalar`);
    const text = String(value);
     if (parameter.in === "path") {
       const marker = `{${parameter.name}}`;
       if (!path.includes(marker)) throw new TypeError(`OpenAPI path parameter ${parameter.name} is not declared in the path`);
       path = path.replace(marker, encodeURIComponent(text));
     }
    else if (parameter.in === "query") url.searchParams.set(parameter.name, text);
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  const headers = new Headers(options.headers);
  for (const parameter of operation.parameters) {
    if (isRecord(parameter) && parameter.in === "header" && typeof parameter.name === "string" && input[parameter.name] !== undefined) {
      const value = String(input[parameter.name]);
      if (/[\r\n]/.test(value)) throw new TypeError(`OpenAPI header ${parameter.name} is invalid`);
      headers.set(parameter.name, value);
    }
  }
  const init: RequestInit = { method: operation.method, headers, redirect: "error" };
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(input.body);
  }
  const response = await (options.fetch ?? fetch)(url, init);
  const maxBytes = options.maxResponseBytes ?? 65536;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxResponseBytes must be positive");
  const result = await responseBytes(response, maxBytes);
  return { status: response.status, ok: response.ok, body: new TextDecoder().decode(result.bytes), truncated: result.truncated };
}

export function createOpenApiToolDefinitions(options: OpenApiToolOptions): readonly ToolDefinition[] {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:") throw new TypeError("OpenAPI base URL must use HTTPS");
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new TypeError("OpenAPI base URL must not contain credentials or query state");
  if (options.allowedOperationIds.length === 0 || new Set(options.allowedOperationIds).size !== options.allowedOperationIds.length) {
    throw new TypeError("OpenAPI operation allowlist must be non-empty and unique");
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new TypeError("OpenAPI fixed headers are invalid");
  }
  const allowed = new Set(options.allowedOperationIds);
  const operations = operationList(options.document, allowed);
  if (operations.length !== allowed.size) throw new TypeError("OpenAPI operation allowlist contains an unknown operation");
  return operations.map(operation => ({
    name: `openapi__${options.serviceName.replace(/[^a-zA-Z0-9_.-]/g, "_")}__${operation.id.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
    description: `Call ${operation.method} ${operation.path}`,
    inputSchema: parameterSchema(operation),
    source: `tool-runtime:openapi:${options.serviceName}`,
    capabilities: ["network"],
    executable: { handle: createToolHandle(input => callOperation(operation, input, options)) },
    policy: options.policy ?? "ask"
  }));
}
