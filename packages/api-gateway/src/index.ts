import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  ChatMessage,
  ToolPolicy,
  ToolPolicySnapshot
} from "data-layer/contracts";
import {
  type ChatProvider,
  type ProviderContent,
  type ProviderMetadata,
  type ProviderMessage,
  type ProviderModelOptions,
  type ProviderRequest,
  type ProviderRequestIdentity,
  type ProviderResult,
  type ProviderStreamEvent,
  type ProviderTool,
  type ProviderToolResult,
  type ProviderUsageInput,
  normalizeProviderUsage,
  validateProviderRequest,
  validateProviderStreamEvent
} from "chat-provider-interface";
import {
  executeHarness,
  type HarnessClock,
  type HarnessContent,
  type HarnessEvent,
  type HarnessIdGenerator,
  type HarnessMessage,
  type HarnessProvider,
  type HarnessProviderRequest,
  type HarnessProviderResult,
  type HarnessResult,
  type HarnessSleeper,
  type HarnessTool,
  type HarnessToolExecutor,
  type HarnessOutcome,
  type HarnessApprovalPolicy,
  type HarnessBudgets,
  type HarnessRetryPolicy,
  type HarnessToolOutputLimits,
  type HarnessContextAssembler,
  type HarnessSessionRepository,
  type HarnessPersistencePort,
  type SubpolarPiRunContext,
  type SubpolarPiTool
} from "harness";
import {
  resolveTools,
  type JsonSchema,
  type ResolvedTool,
  type ToolCapabilityMetadata,
  type ToolDefinition,
  type ToolDescriptor,
  type ToolExecutable,
  type ToolPolicyInput,
  validateJsonSchema
} from "tool-resolver";
import {
  createGatewayEventMapper,
  createTransportEventMapper,
  type GatewayEventProjectionInput,
  type GatewayProjectionBase,
  type GatewayProviderProjectionEvent,
  type GatewayDeltaProjectionEvent,
  type GatewayProtocolEvent,
  type GatewayProtocolEventSink,
  type GatewayClientEventSink,
  type GatewayClientEvent
} from "./client";
import {
  GatewayTurnLeaseManager,
  type GatewayTurnLeaseManagerOptions
} from "./turn-lease";
import {
  MemoryGatewaySessionCwdStore,
  validateSessionCwd,
  type GatewaySessionCwdStore
} from "./session-cwd";
import { createGatewayPiExecutor } from "./pi-executor";

export type GatewayToolInput = ToolDefinition | ToolPolicySnapshot;

/** Structural subset implemented by the durable data-layer session repository. */
export type GatewaySessionRepository = HarnessSessionRepository;

export type GatewayExecutionRequest = {
  model: string;
  messages: readonly ProviderMessage[];
  /** Legacy snapshots, or complete tool definitions for the descriptor path. */
  toolPolicies: readonly GatewayToolInput[];
  /** Policy overrides used when definitions are supplied separately. */
  toolPolicyOverrides?: readonly ToolPolicyInput[];
  toolDefinitions?: readonly ToolDefinition[];
  requestId?: string;
  identity?: ProviderRequestIdentity;
  sessionId?: string;
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Maximum time spent waiting for another turn in this session. */
  turnLeaseTimeoutMs?: number;
  deadline?: number;
  options?: ProviderModelOptions;
  cacheHints?: {
    readonly key?: string;
    readonly ttlMs?: number;
    readonly read?: boolean;
    readonly write?: boolean;
  };
  metadata?: ProviderMetadata;
  budgets?: HarnessBudgets;
  retryPolicy?: HarnessRetryPolicy;
  toolExecutor?: HarnessToolExecutor;
  toolTimeoutMs?: number;
  toolConcurrency?: number;
  toolOutputLimits?: HarnessToolOutputLimits;
  approvalPolicy?: HarnessApprovalPolicy;
  clock?: HarnessClock;
  sleeper?: HarnessSleeper;
  idGenerator?: HarnessIdGenerator;
  sessionRepository?: GatewaySessionRepository;
  persistence?: HarnessPersistencePort;
  contextAssembler?: HarnessContextAssembler;
  /** Internal server hook for application-owned Pi custom tools. */
  piToolFactory?: (run: SubpolarPiRunContext, descriptors: readonly ToolDescriptor[]) => readonly SubpolarPiTool[] | Promise<readonly SubpolarPiTool[]>;
  /** Existing gateway protocol event stream. */
  eventSink?: GatewayProtocolEventSink;
  /** Existing data-layer transport event stream. */
  transportEventSink?: GatewayClientEventSink;
};

export type GatewayResolvedTool = ToolDescriptor | ResolvedTool;

export type GatewayNormalizedRequest = {
  readonly model: string;
  readonly messages: readonly ProviderMessage[];
  readonly tools: readonly GatewayResolvedTool[];
  readonly requestId: string;
  readonly identity?: ProviderRequestIdentity;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly turnLeaseTimeoutMs?: number;
  readonly deadline?: number;
  readonly options?: ProviderModelOptions;
  readonly cacheHints?: GatewayExecutionRequest["cacheHints"];
  readonly metadata?: ProviderMetadata;
  readonly budgets?: HarnessBudgets;
  readonly retryPolicy?: HarnessRetryPolicy;
  readonly toolExecutor?: HarnessToolExecutor;
  readonly toolTimeoutMs?: number;
  readonly toolConcurrency?: number;
  readonly toolOutputLimits?: HarnessToolOutputLimits;
  readonly approvalPolicy?: HarnessApprovalPolicy;
  readonly clock?: HarnessClock;
  readonly sleeper?: HarnessSleeper;
  readonly idGenerator?: HarnessIdGenerator;
  readonly sessionRepository?: GatewaySessionRepository;
  readonly persistence?: HarnessPersistencePort;
  readonly contextAssembler?: HarnessContextAssembler;
  readonly piToolFactory?: GatewayExecutionRequest["piToolFactory"];
};

/** Pi-backed execution seam. Explicit injection remains available for tests and controlled compatibility callers. */
export type GatewayPiExecutor = (
  request: GatewayNormalizedRequest,
  provider: ChatProvider,
  eventSink?: (event: GatewayEventProjectionInput) => void | Promise<void>
) => Promise<HarnessResult>;

export { createGatewayPiExecutor };
export type { GatewayPiExecutorOptions } from "./pi-executor";

export type GatewayOptions = {
  readonly sessionRepository?: GatewaySessionRepository;
  readonly persistence?: HarnessPersistencePort;
  readonly sessionCwdStore?: GatewaySessionCwdStore;
  readonly toolExecutor?: HarnessToolExecutor;
  readonly turnLeaseManager?: GatewayTurnLeaseManager;
  readonly turnLease?: GatewayTurnLeaseManagerOptions;
  readonly piExecutor?: GatewayPiExecutor;
  /** Explicit migration escape hatch for callers that still require the old Harness loop. */
  readonly legacyHarness?: boolean;
};

export type Gateway = {
  executeRequest(request: GatewayExecutionRequest, provider: ChatProvider): Promise<HarnessResult>;
  setSessionCwd(sessionId: string, cwd: string): Promise<void>;
  clearSessionCwd(sessionId?: string): Promise<void>;
};

const defaultSessionCwdStore = new MemoryGatewaySessionCwdStore();
const GATEWAY_REQUEST_FIELDS = new Set([
  "model", "messages", "toolPolicies", "toolPolicyOverrides", "toolDefinitions", "requestId", "identity",
  "sessionId", "cwd", "signal", "timeoutMs", "turnLeaseTimeoutMs", "deadline", "options", "cacheHints",
  "metadata", "budgets", "retryPolicy", "toolExecutor", "toolTimeoutMs", "toolConcurrency", "toolOutputLimits",
  "approvalPolicy", "clock", "sleeper", "idGenerator", "sessionRepository", "persistence", "eventSink",
  "transportEventSink", "contextAssembler", "piToolFactory"
]);
const GATEWAY_OPTION_FIELDS = new Set([
  "sessionRepository", "persistence", "sessionCwdStore", "toolExecutor", "turnLeaseManager", "turnLease", "piExecutor", "legacyHarness"
]);

function rejectUnsupportedFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unsupported = Object.keys(value).find(field => !allowed.has(field));
  if (unsupported !== undefined) throw new TypeError(`${label} field is unsupported: ${unsupported}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPolicy(value: unknown): value is ToolPolicy {
  return value === "allow" || value === "ask" || value === "auto" || value === "deny";
}

function isToolDefinition(value: unknown): value is ToolDefinition {
  return isRecord(value) && !Object.hasOwn(value, "toolName");
}

function validateProviderContent(value: unknown, path: string): void {
  if (typeof value === "string") return;
  if (!Array.isArray(value)) throw new TypeError(`${path} must be a string or content parts`);
  for (const [index, part] of value.entries()) {
    const partPath = `${path}[${index}]`;
    if (!isRecord(part) || typeof part.type !== "string") {
      throw new TypeError(`${partPath} is malformed`);
    }
    if (part.type === "text" || part.type === "reasoning") {
      if (typeof part.text !== "string") throw new TypeError(`${partPath}.text must be a string`);
      continue;
    }
    if (part.type === "tool-call") {
      if (typeof part.id !== "string" || part.id.length === 0 ||
        typeof part.name !== "string" || part.name.length === 0 ||
        typeof part.arguments !== "string") {
        throw new TypeError(`${partPath} is malformed`);
      }
      continue;
    }
    if (part.type === "image" || part.type === "image_url" || part.type === "audio" || part.type === "file") {
      if (part.type === "image_url") {
        const imageUrl = part.imageUrl;
        if ((typeof imageUrl !== "string" &&
          (typeof imageUrl !== "object" || imageUrl === null ||
            typeof (imageUrl as { readonly url?: unknown }).url !== "string")) ||
          (typeof imageUrl === "string" && imageUrl.length === 0)) {
          throw new TypeError(`${partPath}.imageUrl is malformed`);
        }
      } else if (typeof part.url !== "string" || part.url.length === 0) {
        throw new TypeError(`${partPath}.url must be non-empty`);
      }
      continue;
    }
    if (part.type === "tool-result") {
      if (typeof part.toolCallId !== "string" || part.toolCallId.length === 0 ||
        (part.isError !== undefined && typeof part.isError !== "boolean")) {
        throw new TypeError(`${partPath} is malformed`);
      }
      validateProviderContent(part.content, `${partPath}.content`);
      continue;
    }
    throw new TypeError(`${partPath}.type is unsupported by the provider interface`);
  }
}

function validateGatewayMessages(messages: readonly ProviderMessage[]): void {
  for (const [index, message] of messages.entries()) {
    validateProviderContent(message.content, `Gateway request messages[${index}].content`);
    if (message.reasoning !== undefined && typeof message.reasoning !== "string") {
      throw new TypeError(`Gateway request messages[${index}].reasoning must be a string`);
    }
    if (message.toolCalls !== undefined) {
      if (!Array.isArray(message.toolCalls)) {
        throw new TypeError(`Gateway request messages[${index}].toolCalls must be an array`);
      }
      for (const [callIndex, call] of message.toolCalls.entries()) {
        if (!isRecord(call) || typeof call.id !== "string" || call.id.length === 0 ||
          typeof call.name !== "string" || call.name.length === 0 || typeof call.arguments !== "string") {
          throw new TypeError(`Gateway request messages[${index}].toolCalls[${callIndex}] is malformed`);
        }
      }
    }
    if (message.toolCallId !== undefined &&
      (typeof message.toolCallId !== "string" || message.toolCallId.length === 0)) {
      throw new TypeError(`Gateway request messages[${index}].toolCallId must be non-empty`);
    }
    if (message.name !== undefined && typeof message.name !== "string") {
      throw new TypeError(`Gateway request messages[${index}].name must be a string`);
    }
  }
}

function validateRequestShape(request: GatewayExecutionRequest): void {
  if (!isRecord(request)) throw new TypeError("Gateway request must be an object");
  rejectUnsupportedFields(request, GATEWAY_REQUEST_FIELDS, "Gateway");
  if (typeof request.model !== "string" || request.model.trim().length === 0) {
    throw new TypeError("Gateway request model must be a non-empty string");
  }
  if (!Array.isArray(request.messages)) throw new TypeError("Gateway request messages must be an array");
  for (const [index, message] of request.messages.entries()) {
    if (!isRecord(message) || !["system", "user", "assistant", "tool"].includes(String(message.role))) {
      throw new TypeError(`Gateway request messages[${index}] is invalid`);
    }
  }
  validateGatewayMessages(request.messages);
  if (!Array.isArray(request.toolPolicies)) {
    throw new TypeError("Gateway request toolPolicies must be an array");
  }
  if (request.toolDefinitions !== undefined && !Array.isArray(request.toolDefinitions)) {
    throw new TypeError("Gateway request toolDefinitions must be an array");
  }
  for (const [index, policy] of request.toolPolicies.entries()) {
    if (!isRecord(policy) || typeof policy.name !== "string" && typeof policy.toolName !== "string") {
      throw new TypeError(`Gateway request toolPolicies[${index}] is invalid`);
    }
    if ("toolName" in policy && (!isPolicy(policy.policy) ||
      (policy.disabled !== undefined && typeof policy.disabled !== "boolean"))) {
      throw new TypeError(`Gateway request toolPolicies[${index}] is invalid`);
    }
    if ("toolName" in policy && (typeof policy.toolName !== "string" || policy.toolName.length === 0)) {
      throw new TypeError(`Gateway request toolPolicies[${index}] is invalid`);
    }
  }
  for (const [index, definition] of (request.toolDefinitions ?? request.toolPolicies.filter(isToolDefinition)).entries()) {
    if (!isRecord(definition) || typeof definition.name !== "string" || definition.name.length === 0 ||
      typeof definition.description !== "string" || typeof definition.source !== "string" || definition.source.length === 0 ||
      !("inputSchema" in definition) ||
      (typeof definition.inputSchema !== "boolean" && !isRecord(definition.inputSchema)) ||
      !isRecord(definition.executable) ||
      (Object.hasOwn(definition.executable, "handle") === Object.hasOwn(definition.executable, "reference")) ||
      (Object.hasOwn(definition.executable, "reference") &&
        (typeof definition.executable.reference !== "string" || definition.executable.reference.length === 0)) ||
      (definition.policy !== undefined && !isPolicy(definition.policy)) ||
      (definition.disabled !== undefined && typeof definition.disabled !== "boolean") ||
      (definition.enabled !== undefined && typeof definition.enabled !== "boolean")) {
      throw new TypeError(`Gateway request tool definition[${index}] is invalid`);
    }
  }
  if (request.toolPolicyOverrides !== undefined) {
    if (!Array.isArray(request.toolPolicyOverrides)) {
      throw new TypeError("Gateway request toolPolicyOverrides must be an array");
    }
    for (const [index, policy] of request.toolPolicyOverrides.entries()) {
      if (!isRecord(policy) || typeof policy.toolName !== "string" || !isPolicy(policy.policy) ||
        (policy.disabled !== undefined && typeof policy.disabled !== "boolean")) {
        throw new TypeError(`Gateway request toolPolicyOverrides[${index}] is invalid`);
      }
    }
  }
  for (const field of ["requestId", "sessionId"] as const) {
    if (request[field] !== undefined &&
      (typeof request[field] !== "string" || request[field].trim().length === 0)) {
      throw new TypeError(`Gateway request ${field} must be a non-empty string`);
    }
  }
  if (request.cwd !== undefined) validateSessionCwd(request.cwd);
  for (const field of ["timeoutMs", "turnLeaseTimeoutMs", "deadline"] as const) {
    if (request[field] !== undefined &&
      (typeof request[field] !== "number" || !Number.isFinite(request[field]))) {
      throw new TypeError(`Gateway request ${field} must be finite`);
    }
  }
  if (request.toolTimeoutMs !== undefined &&
    (typeof request.toolTimeoutMs !== "number" || !Number.isFinite(request.toolTimeoutMs))) {
    throw new TypeError("Gateway request toolTimeoutMs must be finite");
  }
  if (request.toolConcurrency !== undefined &&
    (typeof request.toolConcurrency !== "number" || !Number.isFinite(request.toolConcurrency))) {
    throw new TypeError("Gateway request toolConcurrency must be finite");
  }
  if (request.toolOutputLimits?.maxBytes !== undefined &&
    (typeof request.toolOutputLimits.maxBytes !== "number" || !Number.isFinite(request.toolOutputLimits.maxBytes))) {
    throw new TypeError("Gateway request toolOutputLimits.maxBytes must be finite");
  }
}

function resolveRequestTools(request: GatewayExecutionRequest): readonly GatewayResolvedTool[] {
  const explicitDefinitions = request.toolDefinitions;
  const definitionsInPolicies = request.toolPolicies.length > 0 &&
    request.toolPolicies.every(isToolDefinition);
  if (explicitDefinitions !== undefined) {
    if (!request.toolPolicies.every(policy => !isToolDefinition(policy))) {
      throw new TypeError("toolPolicies cannot contain definitions when toolDefinitions is supplied");
    }
    return resolveTools(
      explicitDefinitions,
      [...request.toolPolicies as readonly ToolPolicyInput[], ...(request.toolPolicyOverrides ?? [])]
    );
  }
  if (definitionsInPolicies) {
    return resolveTools(
      request.toolPolicies as readonly ToolDefinition[],
      request.toolPolicyOverrides ?? []
    );
  }
  if (request.toolPolicies.some(isToolDefinition)) {
    throw new TypeError("toolPolicies must contain either snapshots or definitions, not both");
  }
  return resolveTools(request.toolPolicies as readonly ToolPolicySnapshot[]);
}

export function normalizeGatewayRequest(request: GatewayExecutionRequest): GatewayNormalizedRequest {
  validateRequestShape(request);
  const requestId = request.requestId ?? `gateway-${randomUUID()}`;
  const sessionId = request.sessionId ?? requestId;
  const tools = resolveRequestTools(request);
  validateDescriptorSchemas(tools);
  validateReferencedTools(tools);
  const messages = request.messages.map(message => ({ ...message }));
  validateProviderRequest({
    model: request.model.trim(),
    messages,
    tools: tools.map(tool => asProviderTool(asHarnessTool(tool))),
    requestId,
    ...(request.identity === undefined ? {} : { identity: request.identity }),
    ...(request.options === undefined ? {} : { options: request.options }),
    ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  });
  return {
    model: request.model.trim(),
    messages,
    tools,
    requestId,
    sessionId,
    ...(request.cwd === undefined ? {} : { cwd: validateSessionCwd(request.cwd) }),
    ...(request.identity === undefined ? {} : { identity: request.identity }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(request.turnLeaseTimeoutMs === undefined ? {} : { turnLeaseTimeoutMs: request.turnLeaseTimeoutMs }),
    ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
    ...(request.options === undefined ? {} : { options: request.options }),
    ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    ...(request.budgets === undefined ? {} : { budgets: request.budgets }),
    ...(request.retryPolicy === undefined ? {} : { retryPolicy: request.retryPolicy }),
    ...(request.toolExecutor === undefined ? {} : { toolExecutor: request.toolExecutor }),
    ...(request.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: request.toolTimeoutMs }),
    ...(request.toolConcurrency === undefined ? {} : { toolConcurrency: request.toolConcurrency }),
    ...(request.toolOutputLimits === undefined ? {} : { toolOutputLimits: request.toolOutputLimits }),
    ...(request.approvalPolicy === undefined ? {} : { approvalPolicy: request.approvalPolicy }),
    ...(request.clock === undefined ? {} : { clock: request.clock }),
    ...(request.sleeper === undefined ? {} : { sleeper: request.sleeper }),
    ...(request.idGenerator === undefined ? {} : { idGenerator: request.idGenerator }),
     ...(request.sessionRepository === undefined ? {} : { sessionRepository: request.sessionRepository }),
     ...(request.persistence === undefined ? {} : { persistence: request.persistence }),
     ...(request.contextAssembler === undefined ? {} : { contextAssembler: request.contextAssembler }),
     ...(request.piToolFactory === undefined ? {} : { piToolFactory: request.piToolFactory })
  };
}

function isDescriptor(tool: GatewayResolvedTool): tool is ToolDescriptor {
  return "inputSchema" in tool;
}

type GatewayHarnessTool = HarnessTool & {
  readonly inputSchema?: JsonSchema;
  readonly source?: string;
  readonly capabilities?: ToolCapabilityMetadata;
  readonly executable?: ToolExecutable;
};

function asHarnessTool(tool: GatewayResolvedTool): GatewayHarnessTool {
  const base: GatewayHarnessTool = { name: tool.name, policy: tool.policy };
  if (!isDescriptor(tool)) return base;
  return {
    ...base,
    description: tool.description,
    ...(typeof tool.inputSchema === "object" && tool.inputSchema !== null && !Array.isArray(tool.inputSchema)
      ? { parameters: tool.inputSchema }
      : {}),
    inputSchema: tool.inputSchema,
    source: tool.source,
    capabilities: tool.capabilities,
    executable: tool.executable
  };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function schemaTypeMatches(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function schemaMatches(value: unknown, schema: JsonSchema): boolean {
  if (typeof schema === "boolean") return schema;
  const rules = schema as Record<string, unknown>;
  const type = rules.type;
  if (typeof type === "string" && !schemaTypeMatches(value, type)) return false;
  if (Array.isArray(type) && !type.some(candidate => typeof candidate === "string" && schemaTypeMatches(value, candidate))) {
    return false;
  }
  if (Array.isArray(rules.enum) && !rules.enum.some(candidate => jsonEqual(candidate, value))) return false;
  if (Object.hasOwn(rules, "const") && !jsonEqual(rules.const, value)) return false;

  if (Array.isArray(rules.allOf) && !rules.allOf.every(candidate => schemaMatches(value, candidate as JsonSchema))) return false;
  if (Array.isArray(rules.anyOf) && !rules.anyOf.some(candidate => schemaMatches(value, candidate as JsonSchema))) return false;
  if (Array.isArray(rules.oneOf) && rules.oneOf.filter(candidate => schemaMatches(value, candidate as JsonSchema)).length !== 1) {
    return false;
  }
  if (Object.hasOwn(rules, "not") && schemaMatches(value, rules.not as JsonSchema)) return false;

  if (typeof value === "string") {
    if (typeof rules.minLength === "number" && [...value].length < rules.minLength) return false;
    if (typeof rules.maxLength === "number" && [...value].length > rules.maxLength) return false;
    if (typeof rules.pattern === "string") {
      try {
        if (!new RegExp(rules.pattern).test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof rules.minimum === "number" && value < rules.minimum) return false;
    if (typeof rules.maximum === "number" && value > rules.maximum) return false;
    if (typeof rules.exclusiveMinimum === "number" && value <= rules.exclusiveMinimum) return false;
    if (typeof rules.exclusiveMaximum === "number" && value >= rules.exclusiveMaximum) return false;
    if (typeof rules.multipleOf === "number" && rules.multipleOf > 0 && value % rules.multipleOf !== 0) return false;
  }
  if (Array.isArray(value)) {
    if (typeof rules.minItems === "number" && value.length < rules.minItems) return false;
    if (typeof rules.maxItems === "number" && value.length > rules.maxItems) return false;
    if (rules.uniqueItems === true && value.some((item, index) => value.slice(index + 1).some(other => jsonEqual(item, other)))) {
      return false;
    }
    if (rules.items !== undefined && !value.every(item => schemaMatches(item, rules.items as JsonSchema))) return false;
    if (Array.isArray(rules.prefixItems) && rules.prefixItems.some((item, index) => index < value.length &&
      !schemaMatches(value[index], item as JsonSchema))) return false;
  }
  if (isRecord(value)) {
    const properties = isRecord(rules.properties) ? rules.properties : {};
    if (Array.isArray(rules.required) && rules.required.some(name => typeof name !== "string" || !Object.hasOwn(value, name))) {
      return false;
    }
    if (typeof rules.minProperties === "number" && Object.keys(value).length < rules.minProperties) return false;
    if (typeof rules.maxProperties === "number" && Object.keys(value).length > rules.maxProperties) return false;
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, name) && !schemaMatches(value[name], propertySchema as JsonSchema)) return false;
    }
    if (rules.additionalProperties === false) {
      const patterns = isRecord(rules.patternProperties) ? Object.keys(rules.patternProperties) : [];
      for (const name of Object.keys(value)) {
        if (Object.hasOwn(properties, name)) continue;
        let matched = false;
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern).test(name)) {
              matched = true;
              if (!schemaMatches(value[name], (rules.patternProperties as Record<string, unknown>)[pattern] as JsonSchema)) return false;
            }
          } catch {
            return false;
          }
        }
        if (!matched) return false;
      }
    } else if (isRecord(rules.additionalProperties)) {
      for (const name of Object.keys(value)) {
        if (!Object.hasOwn(properties, name) && !schemaMatches(value[name], rules.additionalProperties as JsonSchema)) return false;
      }
    }
    if (isRecord(rules.dependentSchemas)) {
      for (const [name, dependent] of Object.entries(rules.dependentSchemas)) {
        if (Object.hasOwn(value, name) && !schemaMatches(value, dependent as JsonSchema)) return false;
      }
    }
  }
  if (Object.hasOwn(rules, "if")) {
    const branch = schemaMatches(value, rules.if as JsonSchema) ? rules.then : rules.else;
    if (branch !== undefined && !schemaMatches(value, branch as JsonSchema)) return false;
  }
  return true;
}

function validateDescriptorToolCalls(
  calls: readonly { readonly name: string; readonly arguments: string }[],
  tools: readonly GatewayResolvedTool[]
): void {
  const byName = new Map(tools.filter(isDescriptor).map(tool => [tool.name, tool]));
  for (const call of calls) {
    const tool = byName.get(call.name);
    if (tool === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.arguments) as unknown;
    } catch {
      throw new TypeError(`Malformed arguments for tool: ${call.name}`);
    }
    if (!isRecord(parsed) || !schemaMatches(parsed, tool.inputSchema)) {
      throw new TypeError(`Arguments do not match schema for tool: ${call.name}`);
    }
  }
}

function validateDescriptorSchemas(tools: readonly GatewayResolvedTool[]): void {
  for (const tool of tools) {
    if (isDescriptor(tool)) validateJsonSchema(tool.inputSchema, tool.name);
  }
}

function validateReferencedTools(tools: readonly GatewayResolvedTool[]): void {
  for (const tool of tools) {
    if (!isDescriptor(tool) || !("reference" in tool.executable)) continue;
    throw new TypeError(`Tool executable reference is unsupported: ${tool.name}`);
  }
}

function asProviderMessage(message: HarnessMessage | ChatMessage): ProviderMessage {
  const extended = message as HarnessMessage;
  return {
    role: message.role,
    content: message.content as ProviderContent,
    ...(extended.reasoning === undefined ? {} : { reasoning: extended.reasoning }),
    ...(extended.toolCalls === undefined ? {} : {
      toolCalls: extended.toolCalls.map(call => ({ id: call.id, name: call.name, arguments: call.arguments }))
    }),
    ...(extended.toolCallId === undefined ? {} : { toolCallId: extended.toolCallId }),
    ...(extended.name === undefined ? {} : { name: extended.name }),
    ...(extended.metadata === undefined ? {} : { metadata: extended.metadata })
  };
}

function asProviderTool(tool: GatewayHarnessTool): ProviderTool {
  return {
    name: tool.name,
    policy: tool.policy === "deny" ? "allow" : (tool.policy ?? "allow"),
    ...(tool.description === undefined ? {} : { description: tool.description }),
    ...(tool.parameters === undefined ? {} : { parameters: tool.parameters }),
    ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
    ...(tool.source === undefined ? {} : { source: tool.source }),
    ...(tool.capabilities === undefined ? {} : { capabilities: tool.capabilities }),
    ...(tool.executable === undefined ? {} : { executable: tool.executable })
  } as ProviderTool;
}

function asHarnessMessage(message: ProviderMessage): HarnessMessage {
  return {
    role: message.role,
    content: message.content as HarnessContent,
    ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
    ...(message.toolCalls === undefined ? {} : {
      toolCalls: message.toolCalls.map(call => ({ id: call.id, name: call.name, arguments: call.arguments }))
    }),
    ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata as NonNullable<HarnessMessage["metadata"]> })
  };
}

function asHarnessResult(result: ProviderResult): HarnessProviderResult {
  return {
    ...result,
    message: asHarnessMessage(result.message),
    usage: { ...result.usage }
  };
}

type ProviderRequestBoundary = Pick<
  HarnessProviderRequest,
  "signal" | "cancellation" | "timeoutMs" | "deadline" | "requestId"
>;

function asProviderRequest(
  request: GatewayNormalizedRequest,
  messages: readonly (HarnessMessage | ChatMessage)[],
  tools: readonly GatewayHarnessTool[],
  harnessRequest?: Partial<ProviderRequestBoundary>,
  identity?: ProviderRequestIdentity
): ProviderRequest {
  const providerRequest: ProviderRequest = {
    model: request.model,
    messages: messages.map(asProviderMessage),
    tools: tools.map(asProviderTool),
    ...(harnessRequest?.signal === undefined ? {} : { signal: harnessRequest.signal }),
    ...(harnessRequest?.cancellation === undefined ? {} : { cancellation: harnessRequest.cancellation }),
    ...(harnessRequest?.timeoutMs === undefined ? {} : { timeoutMs: harnessRequest.timeoutMs }),
    ...(harnessRequest?.deadline === undefined ? {} : { deadline: harnessRequest.deadline }),
    requestId: harnessRequest?.requestId ?? request.requestId,
    ...(identity === undefined ? {} : { identity }),
    ...(request.options === undefined ? {} : { options: request.options }),
    ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  };
  validateProviderRequest(providerRequest);
  return providerRequest;
}

function descriptorExecutor(
  request: GatewayNormalizedRequest
): HarnessToolExecutor | undefined {
  if (request.toolExecutor !== undefined) return request.toolExecutor;
  const handles = new Map<string, (...args: readonly unknown[]) => unknown>();
  validateReferencedTools(request.tools);
  for (const tool of request.tools) {
    if (isDescriptor(tool) && "handle" in tool.executable) {
      const handle = tool.executable.handle;
      if (handle !== undefined) handles.set(tool.name, handle.execute);
    }
  }
  if (handles.size === 0) return undefined;
  return async execution => {
    const handle = handles.get(execution.call.name);
    if (handle !== undefined) {
      const value = await handle(execution.arguments, execution.signal);
      return { content: typeof value === "string" ? value : JSON.stringify(value) ?? "" };
    }
    throw new Error(`No executor for tool: ${execution.call.name}`);
  };
}

function defaultClock(): HarnessClock {
  return { now: () => Date.now() };
}

function defaultSleeper(): HarnessSleeper {
  return {
    sleep: (milliseconds, signal) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(Object.assign(new Error("Harness cancelled"), { name: "AbortError" }));
        return;
      }
      const timer = setTimeout(resolve, milliseconds);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Harness cancelled"), { name: "AbortError" }));
      }, { once: true });
    })
  };
}

function defaultIdGenerator(): HarnessIdGenerator {
  let next = 0;
  return kind => `${kind}-${++next}`;
}

class ProviderHarnessAdapter {
  readonly stream?: HarnessProvider["stream"];
  private providerCalls = 0;
  private providerEventIds = 0;
  private lastStreamExtras: {
    readonly toolResults?: ProviderResult["toolResults"];
    readonly usage?: ProviderResult["usage"];
    readonly requestId?: string;
    readonly identity?: ProviderRequestIdentity;
    readonly metadata?: ProviderMetadata;
  } | undefined;

  constructor(
    private readonly provider: ChatProvider,
    private readonly gatewayRequest: GatewayNormalizedRequest,
    private readonly eventSink?: (event: GatewayEventProjectionInput) => void | Promise<void>
  ) {
    if (provider.stream !== undefined) this.stream = request => this.forwardStream(request);
  }

  asHarnessProvider(): HarnessProvider {
    return {
      complete: request => this.complete(request),
      ...(this.stream === undefined ? {} : { stream: this.stream })
    };
  }

  private nextIdentity(): ProviderRequestIdentity {
    const base = this.gatewayRequest.identity;
    return {
      ...(base ?? {}),
      requestId: base?.requestId ?? this.gatewayRequest.requestId,
      attempt: (base?.attempt ?? 1) + this.providerCalls - 1
    };
  }

  private providerRequest(request: HarnessProviderRequest): ProviderRequest {
    this.providerCalls += 1;
    return asProviderRequest(this.gatewayRequest, request.messages, request.tools as readonly GatewayHarnessTool[], request, this.nextIdentity());
  }

  private async emitProviderEvent(
    event: Record<string, unknown> & { readonly type: GatewayProviderProjectionEvent["type"] }
  ): Promise<void> {
    if (this.eventSink === undefined) return;
    await this.eventSink({
      ...event,
      id: `provider-${++this.providerEventIds}`,
      requestId: this.gatewayRequest.requestId,
      sessionId: this.gatewayRequest.sessionId,
      at: Date.now()
    } as GatewayProviderProjectionEvent);
  }

  async complete(request: HarnessProviderRequest): Promise<HarnessProviderResult> {
    const result = await this.provider.complete(this.providerRequest(request));
    validateDescriptorToolCalls(result.message.toolCalls ?? [], this.gatewayRequest.tools);
    return asHarnessResult(result);
  }

  private async forwardStream(request: HarnessProviderRequest): Promise<AsyncIterable<ProviderStreamEvent>> {
    const providerRequest = this.providerRequest(request);
    const stream = this.provider.stream!(providerRequest);

    const toolResults: ProviderToolResult[] = [];
    const calls = new Map<string, { id: string | undefined; name: string | undefined; arguments: string; complete: boolean }>();
    let requestId: string | undefined;
    let identity: ProviderRequestIdentity | undefined;
    let metadata: ProviderMetadata | undefined;
    let usage: ProviderUsageInput | undefined;
    const mergeMetadata = (value: ProviderMetadata | undefined) => {
      if (value !== undefined) metadata = { ...metadata, ...value };
    };
    const callKey = (event: Extract<ProviderStreamEvent, { type: "tool-call-delta" }>) =>
      event.id ?? `index:${event.index ?? calls.size}`;

    this.lastStreamExtras = undefined;
    return (async function* (adapter: ProviderHarnessAdapter): AsyncIterable<ProviderStreamEvent> {
      for await (const event of await stream) {
        validateProviderStreamEvent(event);
        if (event.type === "start" || event.type === "error") {
          requestId = event.requestId ?? event.identity?.requestId ?? requestId;
          identity = event.identity ?? identity;
          mergeMetadata(event.metadata);
        } else if (event.type === "usage") {
          usage = { ...usage, ...event.usage };
          mergeMetadata(event.metadata);
        } else if (event.type === "finish") {
          requestId = event.requestId ?? event.identity?.requestId ?? requestId;
          identity = event.identity ?? identity;
          usage = { ...usage, ...event.usage };
          mergeMetadata(event.metadata);
        } else if (event.type === "tool-result") {
          toolResults.push({
            toolCallId: event.toolCallId,
            content: event.content,
            ...(event.isError === undefined ? {} : { isError: event.isError })
          });
        } else if (event.type === "tool-call-delta") {
          const key = callKey(event);
          const current = calls.get(key) ?? { id: undefined, name: undefined, arguments: "", complete: false };
          const next = {
            id: event.id ?? current.id,
            name: event.name ?? current.name,
            arguments: current.arguments + (event.arguments ?? ""),
            complete: false
          };
          calls.set(key, next);
        } else if (event.type === "tool-call") {
          calls.set(event.id, { ...event, complete: true });
        }
        if (event.type === "start") {
          await adapter.emitProviderEvent({ type: "provider.started", providerIndex: 0 });
        } else if (event.type === "text-delta") {
          await adapter.emitProviderEvent({ type: "provider.text.delta", text: event.text });
        } else if (event.type === "reasoning-delta") {
          await adapter.emitProviderEvent({ type: "provider.reasoning.delta", text: event.text });
        } else if (event.type === "tool-call-delta") {
          await adapter.emitProviderEvent({
            type: "provider.tool-call.delta",
            ...(event.id === undefined ? {} : { callId: event.id }),
            ...(event.name === undefined ? {} : { name: event.name }),
            ...(event.arguments === undefined ? {} : { arguments: event.arguments })
          });
        } else if (event.type === "tool-call") {
          await adapter.emitProviderEvent({ type: "provider.tool-call", call: event });
        } else if (event.type === "tool-result") {
          await adapter.emitProviderEvent({ type: "provider.tool-result", callId: event.toolCallId, result: event });
        } else if (event.type === "usage") {
          await adapter.emitProviderEvent({ type: "provider.usage", usage: normalizeProviderUsage(event.usage) });
        } else if (event.type === "finish") {
          await adapter.emitProviderEvent({
            type: "provider.finished",
            ...(event.usage === undefined ? {} : { usage: normalizeProviderUsage(event.usage) }),
            finishReason: event.finishReason,
            ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
            ...(event.requestId === undefined ? {} : { providerRequestId: event.requestId })
          });
        } else if (event.type === "error") {
          await adapter.emitProviderEvent({ type: "provider.failed", providerIndex: 0, category: event.error.category });
        }
        yield event;
      }

      validateDescriptorToolCalls(
        [...calls.values()]
          .filter(call => call.complete && call.name !== undefined)
          .map(call => ({ name: call.name!, arguments: call.arguments })),
        adapter.gatewayRequest.tools
      );
      for (const call of calls.values()) {
        if (call.complete) continue;
        if (call.id === undefined || call.name === undefined) {
          throw new TypeError("Provider stream emitted an incomplete tool call");
        }
        yield {
          type: "tool-call",
          id: call.id,
          name: call.name,
          arguments: call.arguments
        };
      }
      adapter.lastStreamExtras = {
        ...(toolResults.length === 0 ? {} : { toolResults }),
        ...(usage === undefined ? {} : { usage: normalizeProviderUsage(usage) }),
        ...(requestId === undefined ? {} : { requestId }),
        ...(identity === undefined ? {} : { identity }),
        ...(metadata === undefined ? {} : { metadata })
      };
    })(this);
  }

  result(result: HarnessProviderResult): HarnessProviderResult {
    const extras = this.lastStreamExtras;
    if (extras === undefined) return result;
    return {
      ...result,
      ...(extras.toolResults === undefined ? {} : { toolResults: extras.toolResults }),
      ...(extras.usage === undefined ? {} : { usage: extras.usage }),
      ...(extras.requestId === undefined ? {} : { requestId: extras.requestId }),
      ...(extras.identity === undefined ? {} : { identity: extras.identity }),
      ...(extras.metadata === undefined ? {} : { metadata: { ...result.metadata, ...extras.metadata } })
    };
  }
}

export const harnessRuntimeAdapter = {
  async execute(request: GatewayNormalizedRequest, provider: ChatProvider, eventSink?: (event: GatewayEventProjectionInput) => void | Promise<void>) {
    const toolExecutor = descriptorExecutor(request);
    const providerAdapter = new ProviderHarnessAdapter(provider, request, eventSink);
    const harnessRequest = {
      requestId: request.requestId,
      sessionId: request.sessionId,
      model: request.model,
      messages: request.messages.map(message => asProviderMessage(message) as unknown as HarnessMessage),
      tools: request.tools.map(asHarnessTool),
      provider: providerAdapter.asHarnessProvider(),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
      ...(request.options === undefined ? {} : { options: request.options }),
      ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.budgets === undefined ? {} : { budgets: request.budgets }),
      ...(request.retryPolicy === undefined ? {} : { retryPolicy: request.retryPolicy }),
      ...(request.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: request.toolTimeoutMs }),
      ...(request.toolConcurrency === undefined ? {} : { toolConcurrency: request.toolConcurrency }),
      ...(request.toolOutputLimits === undefined ? {} : { toolOutputLimits: request.toolOutputLimits }),
      clock: request.clock ?? defaultClock(),
      sleeper: request.sleeper ?? defaultSleeper(),
      ...(toolExecutor === undefined ? {} : { toolExecutor }),
      ...(request.approvalPolicy === undefined ? {} : { approvalPolicy: request.approvalPolicy }),
      ...(request.sessionRepository === undefined ? {} : { sessionRepository: request.sessionRepository }),
      ...(request.persistence === undefined ? {} : { persistence: request.persistence }),
      ...(request.contextAssembler === undefined ? {} : { contextAssembler: request.contextAssembler }),
      ...(eventSink === undefined ? {} : { eventSink: (event: HarnessEvent) => eventSink(event) }),
      idGenerator: request.idGenerator ?? defaultIdGenerator(),
      ...(request.cwd === undefined ? {} : { cwd: request.cwd })
    };
    const inboundPreparer = request.persistence as (HarnessPersistencePort & {
      prepareInbound?: (sessionId: string, requestId: string, model: string, messages: readonly ProviderMessage[]) => Promise<void>;
    }) | undefined;
    await inboundPreparer?.prepareInbound?.(request.sessionId, request.requestId, request.model, request.messages);
    const outcome: HarnessOutcome = await executeHarness(harnessRequest);
    if (outcome.outcome === "completed") return providerAdapter.result(outcome.result);
    throw new Error("Harness execution failed");
  }
};

function safeHarnessEventSink(
  request: GatewayExecutionRequest,
): ((event: GatewayEventProjectionInput) => Promise<void>) | undefined {
  const gatewayMapper = request.eventSink === undefined ? undefined : createGatewayEventMapper(request.eventSink);
  const transportMapper = request.transportEventSink === undefined
    ? undefined
    : createTransportEventMapper(request.transportEventSink);
  if (gatewayMapper === undefined && transportMapper === undefined) return undefined;
  return async event => {
    await gatewayMapper?.(event);
    await transportMapper?.(event);
  };
}

function configureHarnessRequest(
  request: GatewayNormalizedRequest,
  options: GatewayOptions
): GatewayNormalizedRequest {
  const toolExecutor = request.toolExecutor ?? options.toolExecutor;
  const sessionRepository = request.sessionRepository ?? options.sessionRepository;
  const persistence = request.persistence ?? options.persistence;
  return {
    ...request,
    ...(toolExecutor === undefined ? {} : { toolExecutor }),
    ...(sessionRepository === undefined ? {} : { sessionRepository }),
    ...(persistence === undefined ? {} : { persistence })
  };
}

export function createGateway(options: GatewayOptions = {}): Gateway {
  rejectUnsupportedFields(options as Record<string, unknown>, GATEWAY_OPTION_FIELDS, "Gateway");
  const sessionCwdStore = options.sessionCwdStore ?? new MemoryGatewaySessionCwdStore();
  const turnLeases = options.turnLeaseManager ?? new GatewayTurnLeaseManager(options.turnLease);
  const piExecutor = options.piExecutor ?? createGatewayPiExecutor({
    cwd: process.cwd(),
    agentDir: join(process.env.SUBPOLAR_DATA_DIR ?? join(process.cwd(), ".subpolar"), "pi-agent"),
  });

  return {
    async executeRequest(request, provider): Promise<HarnessResult> {
      const normalizedRequest = normalizeGatewayRequest(request);
      const storedCwd = normalizedRequest.cwd === undefined
        ? await sessionCwdStore.load(normalizedRequest.sessionId)
        : undefined;
      const normalized = storedCwd === undefined
        ? normalizedRequest
        : { ...normalizedRequest, cwd: validateSessionCwd(storedCwd) };
      const lease = await turnLeases.acquire(normalized.sessionId, {
        ...(normalized.signal === undefined ? {} : { signal: normalized.signal }),
        ...(normalized.turnLeaseTimeoutMs === undefined
          ? (normalized.timeoutMs === undefined || normalized.timeoutMs < 0 ? {} : { waitTimeoutMs: normalized.timeoutMs })
          : { waitTimeoutMs: normalized.turnLeaseTimeoutMs })
      });
      try {
        const configured = configureHarnessRequest(normalized, options);
        const eventSink = safeHarnessEventSink(request);
        if (options.legacyHarness === true) return await harnessRuntimeAdapter.execute(configured, provider, eventSink);
        return await piExecutor(configured, provider, eventSink);
      } finally {
        lease.release();
      }
    },
    async setSessionCwd(sessionId, cwd): Promise<void> {
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new TypeError("Gateway sessionId must be a non-empty string");
      }
      await sessionCwdStore.save(sessionId, validateSessionCwd(cwd));
    },
    async clearSessionCwd(sessionId): Promise<void> {
      await sessionCwdStore.clear?.(sessionId);
    },
  };
}

const defaultGateway = (): Gateway => createGateway({ sessionCwdStore: defaultSessionCwdStore });

export async function setSessionCwd(sessionId: string, cwd: string): Promise<void> {
  await defaultGateway().setSessionCwd(sessionId, cwd);
}

export async function clearSessionCwd(sessionId?: string): Promise<void> {
  await defaultGateway().clearSessionCwd(sessionId);
}

export async function executeRequest(
  request: GatewayExecutionRequest,
  provider: ChatProvider
): Promise<HarnessResult> {
  return defaultGateway().executeRequest(request, provider);
}

export type {
  GatewayClientEvent,
  GatewayEventProjectionInput,
  GatewayProjectionBase,
  GatewayProviderProjectionEvent,
  GatewayDeltaProjectionEvent,
  GatewayProtocolEvent
};
export { createGatewayEventMapper, createTransportEventMapper } from "./client";
export {
  GatewayTurnLeaseError,
  GatewayTurnLeaseManager
} from "./turn-lease";
export type {
  GatewayTurnLease,
  GatewayTurnLeaseAcquireOptions,
  GatewayTurnLeaseDiagnostics,
  GatewayTurnLeaseErrorCode,
  GatewayTurnLeaseManagerOptions,
  GatewayTurnLeaseState
} from "./turn-lease";
export { MemoryGatewaySessionCwdStore, validateSessionCwd } from "./session-cwd";
export type { GatewaySessionCwdStore } from "./session-cwd";
export { createGatewayPersistenceAdapter } from "./persistence";
export type { GatewayPersistenceAdapter } from "./persistence";
