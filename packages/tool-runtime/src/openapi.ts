import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type OpenApiToolOptions = {
  readonly serviceName: string;
  readonly document: unknown;
  readonly baseUrl: string;
  readonly allowedOperationIds: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  readonly maxResponseBytes?: number;
  readonly maxRequestBytes?: number;
  readonly allowPrivateNetwork?: boolean;
  readonly lookup?: (hostname: string) => Promise<readonly string[]>;
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

function resolveLocalReferences(value: unknown, document: unknown, parents: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map(item => resolveLocalReferences(item, document, parents));
  if (!isRecord(value)) return value;
  if (typeof value.$ref === "string") {
    if (!value.$ref.startsWith("#/") || parents.includes(value.$ref)) {
      throw new TypeError("OpenAPI local reference is invalid or cyclic");
    }
    const target = value.$ref.slice(2).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce<unknown>((current, part) => isRecord(current) ? current[part] : undefined, document);
    if (target === undefined) throw new TypeError("OpenAPI local reference cannot be resolved");
    const resolved = resolveLocalReferences(target, document, [...parents, value.$ref]);
    const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$ref"));
    return resolveLocalReferences(isRecord(resolved) ? { ...resolved, ...siblings } : siblings, document, parents);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveLocalReferences(item, document, parents)]));
}

function operationList(document: unknown, allowed: ReadonlySet<string>): readonly Operation[] {
  validateDocument(document);
  if (!isRecord(document) || !isRecord(document.paths)) throw new TypeError("OpenAPI document has no paths");
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith("/") || !isRecord(item)) continue;
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const rawDefinition = item[method];
      const definition = resolveLocalReferences(rawDefinition, document);
      if (!isRecord(definition) || typeof definition.operationId !== "string" || !allowed.has(definition.operationId)) continue;
      if (Array.isArray(definition.security) && definition.security.length > 0) {
        throw new TypeError("OpenAPI security requirements are not supported");
      }
      const parameters = [
        ...(Array.isArray(item.parameters) ? item.parameters.map(parameter => resolveLocalReferences(parameter, document)) : []),
        ...(Array.isArray(definition.parameters) ? definition.parameters.map(parameter => resolveLocalReferences(parameter, document)) : [])
      ];
      let requestBody: Operation["requestBody"];
      if (definition.requestBody !== undefined) {
        const body = resolveLocalReferences(definition.requestBody, document);
        if (!isRecord(body) || !isRecord(body.content) || !isRecord(body.content["application/json"]) ||
            body.content["application/json"].schema === undefined) {
          throw new TypeError(`OpenAPI operation ${definition.operationId} must declare an application/json body`);
        }
        requestBody = {
          schema: validateJsonSchema(resolveLocalReferences(body.content["application/json"].schema, document), definition.operationId),
          required: body.required === true,
        };
      }
       const operation: Operation = { id: definition.operationId, method: method.toUpperCase(), path, parameters,
        ...(requestBody === undefined ? {} : { requestBody }) };
      parameterSchema(operation);
      if (parameters.some(parameter => !isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string")) {
        throw new TypeError(`OpenAPI operation ${definition.operationId} has an unsupported parameter`);
      }
       const pathParameters = new Set(parameters.filter(parameter => isRecord(parameter) && parameter.in === "path" && typeof parameter.name === "string")
        .map(parameter => (parameter as Record<string, unknown>).name as string));
      for (const marker of path.matchAll(/\{([^}]+)\}/g)) {
        if (!pathParameters.has(marker[1] ?? "")) throw new TypeError(`OpenAPI path parameter ${marker[1] ?? ""} is not declared`);
      }
      if ([...pathParameters].some(name => !path.includes(`{${name}}`))) {
        throw new TypeError(`OpenAPI operation ${definition.operationId} has an unused path parameter`);
      }
      operations.push(operation);
    }
  }
  return operations;
}

function validateDocument(document: unknown): void {
  if (!isRecord(document) || document.openapi !== "3.1.0" || !isRecord(document.paths)) {
    throw new TypeError("OpenAPI document must be OpenAPI 3.1.0 with paths");
  }
  if (document.servers !== undefined) throw new TypeError("OpenAPI server overrides are not supported");
  if (isRecord(document.components) && document.components.securitySchemes !== undefined &&
      (!isRecord(document.components.securitySchemes) || Object.keys(document.components.securitySchemes).length > 0)) {
    throw new TypeError("OpenAPI security schemes are not supported");
  }
  if (Array.isArray(document.security) && document.security.length > 0) {
    throw new TypeError("OpenAPI security requirements are not supported");
  }
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

function equalJson(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  if (schema === true) return true;
  if (schema === false || !isRecord(schema)) return false;
  if (schema.const !== undefined && !equalJson(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(item => equalJson(value, item))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(item => matchesSchema(value, item as JsonSchema))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter(item => matchesSchema(value, item as JsonSchema)).length !== 1) return false;
  if (Array.isArray(schema.allOf) && schema.allOf.some(item => !matchesSchema(value, item as JsonSchema))) return false;
  const types = Array.isArray(schema.type) ? schema.type : typeof schema.type === "string" ? [schema.type] : [];
  if (types.length > 0 && !types.some(type => {
    if (type === "null") return value === null;
    if (type === "object") return isRecord(value);
    if (type === "array") return Array.isArray(value);
    if (type === "string") return typeof value === "string";
    if (type === "boolean") return typeof value === "boolean";
    if (type === "integer") return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return false;
  })) return false;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === "string") {
      try { if (!new RegExp(schema.pattern).test(value)) return false; } catch { return false; }
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.items !== undefined && !value.every(item => matchesSchema(item, schema.items as JsonSchema))) return false;
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required) && schema.required.some(name => typeof name !== "string" || value[name] === undefined)) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !(key in properties))) return false;
    for (const [key, item] of Object.entries(value)) {
      if (properties[key] !== undefined && !matchesSchema(item, properties[key] as JsonSchema)) return false;
    }
  }
  return true;
}

function assertMatchesSchema(value: unknown, schema: JsonSchema, label: string): void {
  if (!matchesSchema(value, schema)) throw new TypeError(`OpenAPI ${label} does not match its declared schema`);
}

const MODEL_CONTROLLED_HEADERS = /^(?:authorization|cookie|proxy-authorization|set-cookie|x-api-key|host|:authority|origin|connection|content-length|transfer-encoding|upgrade|proxy-)/i;

function parameterSchema(operation: Operation): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const names = new Set<string>();
  for (const parameter of operation.parameters) {
    if (!isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string" ||
        (parameter.schema !== true && parameter.schema !== false && !isRecord(parameter.schema))) {
      throw new TypeError(`OpenAPI operation ${operation.id} has an unsupported parameter`);
    }
    if (!["path", "query", "header"].includes(parameter.in)) throw new TypeError(`OpenAPI operation ${operation.id} has an unsupported parameter location`);
    if (parameter.in === "path" && parameter.required !== true) throw new TypeError(`OpenAPI path parameters must be required`);
    if (names.has(parameter.name)) throw new TypeError(`OpenAPI operation ${operation.id} declares duplicate parameters`);
    names.add(parameter.name);
    if (parameter.in === "header" && MODEL_CONTROLLED_HEADERS.test(parameter.name)) {
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

async function responseBytes(response: Response, maxBytes: number, signal?: AbortSignal): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
  if (response.body === null) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const abort = () => { void reader.cancel(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
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
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, truncated };
}

function ipv4Private(value: string): boolean {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some(item => !Number.isInteger(item) || item < 0 || item > 255)) return true;
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 0) return true;
  if (isIP(address) === 4) return ipv4Private(address);
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:") || normalized.startsWith("2001:db8");
}

function assertDeterministicOriginPolicy(url: URL, allowPrivateNetwork: boolean | undefined): void {
  if (allowPrivateNetwork) return;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
      hostname === "metadata.google.internal" || hostname === "metadata" || (isIP(hostname) !== 0 && privateAddress(hostname))) {
    throw new TypeError("OpenAPI origin resolves to a private network");
  }
}

async function verifyOrigin(url: URL, options: OpenApiToolOptions): Promise<void> {
  assertDeterministicOriginPolicy(url, options.allowPrivateNetwork);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (options.allowPrivateNetwork || (options.lookup === undefined && options.fetch !== undefined) || isIP(hostname) !== 0) return;
  const addresses = options.lookup === undefined
    ? (await dnsLookup(hostname, { all: true, verbatim: true })).map(item => item.address)
    : await options.lookup(hostname);
  if (addresses.length === 0 || addresses.some(address => privateAddress(address))) {
    throw new TypeError("OpenAPI origin resolves to a private network");
  }
}

async function callOperation(operation: Operation, inputValue: unknown, options: OpenApiToolOptions, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const input = inputObject(inputValue);
  assertMatchesSchema(input, parameterSchema(operation), "arguments");
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
     assertMatchesSchema(value, validateJsonSchema(parameter.schema, `${operation.id}.${parameter.name}`), `parameter ${parameter.name}`);
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
   const init: RequestInit = { method: operation.method, headers, redirect: "error", ...(signal === undefined ? {} : { signal }) };
   if (input.body !== undefined) {
     assertMatchesSchema(input.body, operation.requestBody?.schema ?? false, "request body");
     headers.set("content-type", "application/json");
     init.body = JSON.stringify(input.body);
   }
   const maxRequestBytes = options.maxRequestBytes ?? 65536;
   if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 1) throw new TypeError("maxRequestBytes must be positive");
   if (typeof init.body === "string" && new TextEncoder().encode(init.body).byteLength > maxRequestBytes) {
     throw new TypeError("OpenAPI request body exceeds the configured limit");
   }
   signal?.throwIfAborted();
   await verifyOrigin(url, options);
   const response = await (options.fetch ?? fetch)(url, init);
   if (response.redirected || (response.status >= 300 && response.status < 400) ||
       (response.url !== "" && new URL(response.url).origin !== new URL(options.baseUrl).origin)) {
     throw new Error("OpenAPI redirects are not allowed");
   }
  const maxBytes = options.maxResponseBytes ?? 65536;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxResponseBytes must be positive");
   const result = await responseBytes(response, maxBytes, signal);
  return { status: response.status, ok: response.ok, body: new TextDecoder().decode(result.bytes), truncated: result.truncated };
}

export function createOpenApiToolDefinitions(options: OpenApiToolOptions): readonly ToolDefinition[] {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:") throw new TypeError("OpenAPI base URL must use HTTPS");
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new TypeError("OpenAPI base URL must not contain credentials or query state");
  assertDeterministicOriginPolicy(baseUrl, options.allowPrivateNetwork);
  for (const [label, value] of [["maxResponseBytes", options.maxResponseBytes], ["maxRequestBytes", options.maxRequestBytes]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw new TypeError(`${label} must be positive`);
  }
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
    capabilityId: `openapi:${options.serviceName}:${operation.id}`,
    description: `Call ${operation.method} ${operation.path}`,
    inputSchema: parameterSchema(operation),
    source: `tool-runtime:openapi:${options.serviceName}`,
    capabilities: { network: true, mutating: operation.method !== "GET" },
     executable: { handle: createToolHandle((input, signal) => callOperation(operation, input, options, signal instanceof AbortSignal ? signal : undefined)) },
    policy: options.policy ?? "ask"
  }));
}
