import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type OpenApiAddressPolicy = "deny-private" | "allow-private";

export type OpenApiToolOptions = {
  readonly serviceName: string;
  readonly document: unknown;
  readonly baseUrl: string;
  readonly allowedOperationIds: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  readonly addressPolicy?: OpenApiAddressPolicy;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
};

export type OpenApiRuntimeErrorCategory = "validation" | "authorization" | "cancellation" | "timeout" | "bounds" | "execution";

export class OpenApiRuntimeError extends Error {
  readonly category: OpenApiRuntimeErrorCategory;
  readonly code: string;
  readonly auditCategory: string;

  constructor(category: OpenApiRuntimeErrorCategory, code: string, message: string) {
    super(message);
    this.name = category === "cancellation" ? "AbortError" : "OpenApiRuntimeError";
    this.category = category;
    this.code = code;
    this.auditCategory = `openapi.${category}`;
  }
}

type Operation = {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly parameters: readonly Record<string, unknown>[];
  readonly requestBody?: { readonly schema: JsonSchema; readonly required: boolean };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointer(document: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/") || ref.includes("#", 1)) throw new OpenApiRuntimeError("validation", "INVALID_REF", "OpenAPI local references are invalid");
  let value: unknown = document;
  for (const segment of ref.slice(2).split("/")) {
    if (!isRecord(value) || !Object.hasOwn(value, segment.replace(/~1/g, "/").replace(/~0/g, "~"))) {
      throw new OpenApiRuntimeError("validation", "INVALID_REF", "OpenAPI local reference target is missing");
    }
    value = value[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return value;
}

function validateReferences(document: Record<string, unknown>): void {
  const visit = (value: unknown, stack: readonly string[] = []): void => {
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, stack));
      return;
    }
    if (!isRecord(value)) return;
    if (Object.hasOwn(value, "$ref") && typeof value.$ref !== "string") throw new OpenApiRuntimeError("validation", "INVALID_REF", "OpenAPI local references are invalid");
    if (typeof value.$ref === "string") {
      if (!value.$ref.startsWith("#/") || stack.includes(value.$ref)) {
        if (!value.$ref.startsWith("#/")) throw new OpenApiRuntimeError("validation", "EXTERNAL_REF", "OpenAPI external references are not supported");
        throw new OpenApiRuntimeError("validation", "REF_CYCLE", "OpenAPI local reference cycle is not supported");
      }
      const target = pointer(document, value.$ref);
      visit(target, [...stack, value.$ref]);
    }
    for (const [key, item] of Object.entries(value)) if (key !== "$ref") visit(item, stack);
  };
  visit(document);
}

function validateDocument(document: unknown): asserts document is Record<string, unknown> {
  if (!isRecord(document) || document.openapi !== "3.1.0" || !isRecord(document.paths)) {
    throw new OpenApiRuntimeError("validation", "INVALID_DOCUMENT", "OpenAPI document must be OpenAPI 3.1.0 with paths");
  }
  if (document.servers !== undefined) throw new OpenApiRuntimeError("authorization", "SERVER_OVERRIDE", "OpenAPI server overrides are not supported");
  if (document.security !== undefined || (isRecord(document.components) && isRecord(document.components.securitySchemes))) {
    throw new OpenApiRuntimeError("authorization", "SECURITY_UNSUPPORTED", "OpenAPI security declarations are not supported");
  }
  validateReferences(document);
}

function resolveLocal(document: Record<string, unknown>, value: unknown): unknown {
  let result = value;
  const seen = new Set<string>();
  while (isRecord(result) && typeof result.$ref === "string") {
    if (seen.has(result.$ref)) throw new OpenApiRuntimeError("validation", "REF_CYCLE", "OpenAPI local reference cycle is not supported");
    seen.add(result.$ref);
    result = pointer(document, result.$ref);
  }
  return result;
}

function resolveSchema(document: Record<string, unknown>, value: unknown, stack: readonly string[] = []): unknown {
  const resolved = resolveLocal(document, value);
  if (isRecord(resolved) && typeof resolved.$ref === "string") {
    if (stack.includes(resolved.$ref)) throw new OpenApiRuntimeError("validation", "REF_CYCLE", "OpenAPI local reference cycle is not supported");
    return resolveSchema(document, resolved, [...stack, resolved.$ref]);
  }
  if (Array.isArray(resolved)) return resolved.map(item => resolveSchema(document, item, stack));
  if (!isRecord(resolved)) return resolved;
  return Object.fromEntries(Object.entries(resolved as Record<string, unknown>).map(([key, item]) => [key, resolveSchema(document, item, stack)]));
}

function operationList(document: unknown, allowed: ReadonlySet<string>): readonly Operation[] {
  validateDocument(document);
  const operations: Operation[] = [];
  const paths = document.paths as Record<string, unknown>;
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = resolveLocal(document, rawItem);
    if (!path.startsWith("/") || !isRecord(item)) continue;
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const rawDefinition = item[method];
      const definition = resolveLocal(document, rawDefinition);
      if (!isRecord(definition) || typeof definition.operationId !== "string" || !allowed.has(definition.operationId)) continue;
      if (definition.security !== undefined) throw new OpenApiRuntimeError("authorization", "SECURITY_UNSUPPORTED", "OpenAPI operation security is not supported");
      const rawParameters = [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(definition.parameters) ? definition.parameters : [])];
      const parameters = rawParameters.map(parameter => resolveLocal(document, parameter)).map(parameter => {
        if (!isRecord(parameter)) throw new OpenApiRuntimeError("validation", "UNSUPPORTED_PARAMETER", `OpenAPI operation ${definition.operationId} has an unsupported parameter`);
        if (parameter.schema !== undefined) return { ...parameter, schema: resolveSchema(document, parameter.schema) };
        return parameter;
      });
      let requestBody: Operation["requestBody"];
      if (definition.requestBody !== undefined) {
        const body = resolveLocal(document, definition.requestBody);
        if (!isRecord(body) || body.security !== undefined || !isRecord(body.content) || !isRecord(body.content["application/json"]) || body.content["application/json"].schema === undefined) {
          throw new OpenApiRuntimeError("validation", "UNSUPPORTED_BODY", `OpenAPI operation ${definition.operationId} must declare an application/json body`);
        }
        requestBody = { schema: validateJsonSchema(resolveSchema(document, body.content["application/json"].schema), definition.operationId), required: body.required === true };
      }
      operations.push({ id: definition.operationId, method: method.toUpperCase(), path, parameters, ...(requestBody === undefined ? {} : { requestBody }) });
    }
  }
  return operations;
}

const CREDENTIAL_HEADER = /^(?:authorization|cookie|proxy-authorization|set-cookie|x-api-key|x-auth-token)$/i;
const UNSUPPORTED_HEADER = /^(?:host|content-length|transfer-encoding|connection|upgrade|proxy-)/i;

function parameterSchema(operation: Operation): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const seen = new Set<string>();
  for (const parameter of operation.parameters) {
    if (typeof parameter.name !== "string" || !parameter.name || typeof parameter.in !== "string" || !isRecord(parameter.schema)) {
      throw new OpenApiRuntimeError("validation", "UNSUPPORTED_PARAMETER", `OpenAPI operation ${operation.id} has an unsupported parameter`);
    }
    if (seen.has(parameter.name)) throw new OpenApiRuntimeError("validation", "DUPLICATE_PARAMETER", `OpenAPI operation ${operation.id} has duplicate parameters`);
    seen.add(parameter.name);
    if (!["path", "query", "header"].includes(parameter.in)) throw new OpenApiRuntimeError("validation", "UNSUPPORTED_PARAMETER_LOCATION", `OpenAPI operation ${operation.id} has an unsupported parameter location`);
    if (parameter.in === "header" && CREDENTIAL_HEADER.test(parameter.name)) throw new OpenApiRuntimeError("authorization", "CREDENTIAL_HEADER", "OpenAPI credential headers are not supported");
    if (parameter.in === "header" && UNSUPPORTED_HEADER.test(parameter.name)) throw new OpenApiRuntimeError("authorization", "UNSUPPORTED_HEADER", "OpenAPI transport headers are not supported");
    const schema = validateJsonSchema(parameter.schema, `${operation.id}.${parameter.name}`);
    if (typeof schema !== "boolean" && schema.type !== undefined && !(schema.type === "string" || schema.type === "number" || schema.type === "integer" || schema.type === "boolean")) {
      throw new OpenApiRuntimeError("validation", "UNSUPPORTED_PARAMETER_SCHEMA", `OpenAPI parameter ${parameter.name} must be scalar`);
    }
    properties[parameter.name] = schema;
    if (parameter.in === "path" && parameter.required !== true) throw new OpenApiRuntimeError("validation", "PATH_PARAMETER_REQUIRED", "OpenAPI path parameters must be required");
    if (parameter.in === "path" && !operation.path.includes(`{${parameter.name}}`)) throw new OpenApiRuntimeError("validation", "PATH_PARAMETER_MISSING", "OpenAPI path parameter is not declared in the path");
    if (parameter.required === true) required.push(parameter.name);
  }
  if (operation.requestBody !== undefined) {
    properties.body = operation.requestBody.schema;
    if (operation.requestBody.required) required.push("body");
  }
  return { type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
}

function schemaTypeMatches(value: unknown, type: string): boolean {
  return type === "null" ? value === null : type === "array" ? Array.isArray(value) : type === "object" ? isRecord(value) : type === "integer" ? typeof value === "number" && Number.isInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type;
}

function validateValue(value: unknown, schema: JsonSchema, path: string): void {
  if (schema === true) return;
  if (schema === false) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
  if (schema.enum !== undefined && Array.isArray(schema.enum) && !schema.enum.some(item => Object.is(item, value))) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
  if (typeof schema.type === "string" && !schemaTypeMatches(value, schema.type)) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} has the wrong type`);
  if (Array.isArray(schema.type) && !schema.type.some(type => typeof type === "string" && schemaTypeMatches(value, type))) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} has the wrong type`);
  if (schema.const !== undefined && !Object.is(schema.const, value)) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
  for (const child of [schema.allOf, schema.anyOf, schema.oneOf] as const) {
    if (!Array.isArray(child)) continue;
    const matches = child.filter(candidate => {
      try { validateValue(value, candidate as JsonSchema, path); return true; } catch { return false; }
    }).length;
    if (child === schema.allOf && matches !== child.length) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
    if (child === schema.anyOf && matches === 0) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
    if (child === schema.oneOf && matches !== 1) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is not accepted`);
  }
  if (isRecord(value)) {
    if (Array.isArray(schema.required) && schema.required.some(key => typeof key === "string" && value[key] === undefined)) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is missing a required field`);
    if (isRecord(schema.properties)) {
      if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties as object, key))) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} has an undocumented field`);
      for (const [key, child] of Object.entries(schema.properties)) if (value[key] !== undefined) validateValue(value[key], child as JsonSchema, `${path}.${key}`);
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) for (const [index, item] of value.entries()) validateValue(item, schema.items as JsonSchema, `${path}[${index}]`);
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} has too few items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} has too many items`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is too short`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) throw new OpenApiRuntimeError("validation", "SCHEMA_REJECTED", `OpenAPI value at ${path} is too long`);
  }
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new OpenApiRuntimeError("validation", "INVALID_ARGUMENTS", "OpenAPI tool arguments must be an object");
  return value;
}

async function responseBytes(response: Response, maxBytes: number, signal: AbortSignal): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number.isSafeInteger(Number(declaredLength)) && Number(declaredLength) > maxBytes) {
    await response.body?.cancel();
    return { bytes: new Uint8Array(), truncated: true };
  }
  if (response.body === null) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      if (signal.aborted) throw new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled");
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - size;
      if (remaining <= 0) { truncated = true; await reader.cancel(); break; }
      if (next.value.byteLength > remaining) { chunks.push(next.value.slice(0, remaining)); size += remaining; truncated = true; await reader.cancel(); break; }
      chunks.push(next.value); size += next.value.byteLength;
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, truncated };
}

function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "localhost" || lower === "localhost.") return true;
  if (lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  const octets = lower.split(".").map(Number);
  if (octets.length !== 4 || octets.some(item => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  const [first, second] = octets;
  if (first === undefined || second === undefined) return false;
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

async function assertAddressPolicy(url: URL, options: OpenApiToolOptions, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled");
  if (options.addressPolicy === "allow-private") return;
  if (isPrivateAddress(url.hostname)) throw new OpenApiRuntimeError("authorization", "PRIVATE_ADDRESS", "OpenAPI origin resolves to a private address");
  if (options.resolveHostname !== undefined) {
    let addresses: readonly string[];
    try { addresses = await options.resolveHostname(url.hostname); } catch (error) {
      if (signal?.aborted) throw new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled");
      if (error instanceof OpenApiRuntimeError) throw error;
      throw new OpenApiRuntimeError("authorization", "ADDRESS_LOOKUP_FAILED", "OpenAPI origin address could not be verified");
    }
    if (addresses.some(isPrivateAddress)) throw new OpenApiRuntimeError("authorization", "PRIVATE_ADDRESS", "OpenAPI origin resolves to a private address");
  }
}

async function callOperation(operation: Operation, inputValue: unknown, options: OpenApiToolOptions, baseUrl: URL, maxRequestBytes: number, maxResponseBytes: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const input = inputObject(inputValue);
  const schema = parameterSchema(operation);
  validateValue(input, schema, "arguments");
  if (signal?.aborted) throw new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled");
  let path = operation.path;
  if (path.includes("//") || path.split("/").includes("..")) throw new OpenApiRuntimeError("validation", "UNSAFE_PATH", "OpenAPI operation path is unsafe");
  const url = new URL(baseUrl.toString());
  for (const parameter of operation.parameters) {
    const value = input[parameter.name as string];
    if (value === undefined) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new OpenApiRuntimeError("validation", "NON_SCALAR_PARAMETER", "OpenAPI parameters must be scalar");
    const text = String(value);
    if (parameter.in === "path") {
      const marker = `{${parameter.name as string}}`;
      if (!path.includes(marker)) throw new OpenApiRuntimeError("validation", "PATH_PARAMETER_MISSING", "OpenAPI path parameter is not declared in the path");
      path = path.replace(marker, encodeURIComponent(text));
    } else if (parameter.in === "query") url.searchParams.set(parameter.name as string, text);
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  if (url.origin !== baseUrl.origin) throw new OpenApiRuntimeError("authorization", "ORIGIN_CHANGED", "OpenAPI request origin changed");
  const headers = new Headers(options.headers);
  for (const parameter of operation.parameters) if (parameter.in === "header" && input[parameter.name as string] !== undefined) {
    const value = String(input[parameter.name as string]);
    if (/[\r\n]/.test(value)) throw new OpenApiRuntimeError("validation", "INVALID_HEADER", "OpenAPI header value is invalid");
    headers.set(parameter.name as string, value);
  }
  const init: RequestInit = { method: operation.method, headers, redirect: "error", ...(signal === undefined ? {} : { signal }) };
  let body: string | undefined;
  if (input.body !== undefined) {
    try { body = JSON.stringify(input.body); } catch { throw new OpenApiRuntimeError("validation", "INVALID_BODY", "OpenAPI request body is not valid JSON"); }
    if (body === undefined) throw new OpenApiRuntimeError("validation", "INVALID_BODY", "OpenAPI request body is not valid JSON");
    if (new TextEncoder().encode(body).byteLength > maxRequestBytes) throw new OpenApiRuntimeError("bounds", "REQUEST_LIMIT", "OpenAPI request body exceeds the configured limit");
    headers.set("content-type", "application/json");
    init.body = body;
  }
  const requestBytes = new TextEncoder().encode(`${url.toString()}${[...headers].map(([key, value]) => `${key}:${value}`).join("\n")}${body ?? ""}`).byteLength;
  if (requestBytes > maxRequestBytes) throw new OpenApiRuntimeError("bounds", "REQUEST_LIMIT", "OpenAPI request exceeds the configured limit");
  let response: Response;
  try { response = await (options.fetch ?? fetch)(url, init); }
  catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled");
    throw new OpenApiRuntimeError("execution", "REQUEST_FAILED", "OpenAPI request failed");
  }
  const result = await responseBytes(response, maxResponseBytes, signal ?? new AbortController().signal);
  return { status: response.status, ok: response.ok, body: new TextDecoder().decode(result.bytes), truncated: result.truncated };
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1) throw new OpenApiRuntimeError("validation", "INVALID_LIMIT", `${name} must be positive`);
  return result;
}

export function createOpenApiToolDefinitions(options: OpenApiToolOptions): readonly ToolDefinition[] {
  let baseUrl: URL;
  try { baseUrl = new URL(options.baseUrl); } catch { throw new OpenApiRuntimeError("validation", "INVALID_ORIGIN", "OpenAPI base URL is invalid"); }
  if (baseUrl.protocol !== "https:") throw new OpenApiRuntimeError("authorization", "HTTPS_REQUIRED", "OpenAPI base URL must use HTTPS");
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new OpenApiRuntimeError("validation", "INVALID_ORIGIN", "OpenAPI base URL must not contain credentials or query state");
  if (options.allowedOperationIds.length === 0 || new Set(options.allowedOperationIds).size !== options.allowedOperationIds.length) throw new OpenApiRuntimeError("validation", "INVALID_ALLOWLIST", "OpenAPI operation allowlist must be non-empty and unique");
  for (const [name, value] of Object.entries(options.headers ?? {})) if (!name || CREDENTIAL_HEADER.test(name) || UNSUPPORTED_HEADER.test(name) || /[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new OpenApiRuntimeError("authorization", "UNSUPPORTED_HEADER", "OpenAPI fixed headers are unsupported");
  const maxRequestBytes = positiveLimit(options.maxRequestBytes, 65536, "maxRequestBytes");
  const maxResponseBytes = positiveLimit(options.maxResponseBytes, 65536, "maxResponseBytes");
  const timeoutMs = positiveLimit(options.timeoutMs, 30000, "timeoutMs");
  const allowed = new Set(options.allowedOperationIds);
  const operations = operationList(options.document, allowed);
  if (operations.length !== allowed.size) throw new OpenApiRuntimeError("authorization", "UNKNOWN_OPERATION", "OpenAPI operation allowlist contains an unknown operation");
  if (options.addressPolicy !== "allow-private" && isPrivateAddress(baseUrl.hostname)) throw new OpenApiRuntimeError("authorization", "PRIVATE_ADDRESS", "OpenAPI origin resolves to a private address");
  return operations.map(operation => ({
    name: `openapi__${options.serviceName.replace(/[^a-zA-Z0-9_.-]/g, "_")}__${operation.id.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
    description: `Call ${operation.method} ${operation.path}`,
    inputSchema: parameterSchema(operation),
    source: `tool-runtime:openapi:${options.serviceName}`,
    capabilities: ["network"],
    executable: { handle: createToolHandle((input, signal) => {
      const controller = new AbortController();
      const inputSignal = signal instanceof AbortSignal ? signal : undefined;
      let rejectAbort: ((error: OpenApiRuntimeError) => void) | undefined;
      const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
      const abort = () => {
        controller.abort();
        rejectAbort?.(new OpenApiRuntimeError("cancellation", "CANCELLED", "OpenAPI request cancelled"));
      };
      inputSignal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => {
        controller.abort();
        rejectAbort?.(new OpenApiRuntimeError("timeout", "TIMEOUT", "OpenAPI request timed out"));
      }, timeoutMs);
      const operationPromise = assertAddressPolicy(baseUrl, options, controller.signal).then(() => callOperation(operation, input, options, baseUrl, maxRequestBytes, maxResponseBytes, controller.signal));
      return Promise.race([operationPromise, abortPromise]).catch(error => {
        if (controller.signal.aborted && !(error instanceof OpenApiRuntimeError && error.category === "validation")) throw new OpenApiRuntimeError(inputSignal?.aborted ? "cancellation" : "timeout", inputSignal?.aborted ? "CANCELLED" : "TIMEOUT", inputSignal?.aborted ? "OpenAPI request cancelled" : "OpenAPI request timed out");
        throw error;
      }).finally(() => { clearTimeout(timer); inputSignal?.removeEventListener("abort", abort); });
    }) },
    policy: options.policy ?? "ask"
  }));
}
