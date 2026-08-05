import type {
  ChatMessage,
  ToolPolicy,
  ToolPolicySnapshot
} from "data-layer/contracts";
import {
  type ChatProvider,
  type ProviderContent,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResult,
  type ProviderTool,
  validateProviderRequest
} from "chat-provider-interface";
import {
  executeHarness,
  type HarnessClock,
  type HarnessContent,
  type HarnessEvent,
  type HarnessEventSink,
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
  type HarnessRetryPolicy
} from "harness";
import {
  resolveTools,
  type JsonSchema,
  type ResolvedTool,
  type ToolCapabilityMetadata,
  type ToolDefinition,
  type ToolDescriptor,
  type ToolExecutable,
  type ToolPolicyInput
} from "tool-resolver";
import {
  createGatewayEventMapper,
  createTransportEventMapper,
  type GatewayProtocolEvent,
  type GatewayProtocolEventSink,
  type GatewayClientEventSink,
  type GatewayClientEvent
} from "./client";

export type GatewayToolInput = ToolDefinition | ToolPolicySnapshot;

export type GatewayRuntimeName = "harness" | "python";

export type GatewayRuntimeSelection = GatewayRuntimeName | {
  readonly runtime: GatewayRuntimeName;
  readonly adapter?: GatewayRuntimeAdapter;
  readonly fallback?: GatewayRuntimeAdapter;
};

export type GatewayExecutionRequest = {
  model: string;
  messages: readonly ChatMessage[];
  /** Legacy snapshots, or complete tool definitions for the descriptor path. */
  toolPolicies: readonly GatewayToolInput[];
  /** Policy overrides used when definitions are supplied separately. */
  toolPolicyOverrides?: readonly ToolPolicyInput[];
  toolDefinitions?: readonly ToolDefinition[];
  requestId?: string;
  sessionId?: string;
  runtime?: GatewayRuntimeSelection;
  runtimeFallback?: GatewayRuntimeAdapter;
  signal?: AbortSignal;
  timeoutMs?: number;
  deadline?: number;
  budgets?: HarnessBudgets;
  retryPolicy?: HarnessRetryPolicy;
  toolExecutor?: HarnessToolExecutor;
  approvalPolicy?: HarnessApprovalPolicy;
  clock?: HarnessClock;
  sleeper?: HarnessSleeper;
  idGenerator?: HarnessIdGenerator;
  /** Existing gateway protocol event stream. */
  eventSink?: GatewayProtocolEventSink;
  /** Existing data-layer transport event stream. */
  transportEventSink?: GatewayClientEventSink;
};

export type GatewayResolvedTool = ToolDescriptor | ResolvedTool;

export type GatewayNormalizedRequest = {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly GatewayResolvedTool[];
  readonly requestId: string;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly deadline?: number;
  readonly budgets?: HarnessBudgets;
  readonly retryPolicy?: HarnessRetryPolicy;
  readonly toolExecutor?: HarnessToolExecutor;
  readonly approvalPolicy?: HarnessApprovalPolicy;
  readonly clock?: HarnessClock;
  readonly sleeper?: HarnessSleeper;
  readonly idGenerator?: HarnessIdGenerator;
};

export interface GatewayRuntimeAdapter {
  readonly runtime: GatewayRuntimeName;
  supports(request: GatewayNormalizedRequest): boolean;
  execute(
    request: GatewayNormalizedRequest,
    provider: ChatProvider,
    eventSink?: HarnessEventSink
  ): Promise<HarnessResult>;
}

export class GatewayRuntimeUnsupportedError extends Error {
  readonly runtime: GatewayRuntimeName;

  constructor(runtime: GatewayRuntimeName) {
    super(`Gateway runtime does not support request: ${runtime}`);
    this.name = "GatewayRuntimeUnsupportedError";
    this.runtime = runtime;
  }
}

type PinnedRuntime = {
  readonly runtime: GatewayRuntimeName;
  readonly adapter: GatewayRuntimeAdapter;
};

const runtimePins = new Map<string, PinnedRuntime>();
let nextRequestId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPolicy(value: unknown): value is ToolPolicy {
  return value === "allow" || value === "ask" || value === "auto" || value === "deny";
}

function isToolDefinition(value: unknown): value is ToolDefinition {
  return isRecord(value) && !Object.hasOwn(value, "toolName");
}

function validateRequestShape(request: GatewayExecutionRequest): void {
  if (!isRecord(request)) throw new TypeError("Gateway request must be an object");
  if (typeof request.model !== "string" || request.model.trim().length === 0) {
    throw new TypeError("Gateway request model must be a non-empty string");
  }
  if (!Array.isArray(request.messages)) throw new TypeError("Gateway request messages must be an array");
  for (const [index, message] of request.messages.entries()) {
    if (!isRecord(message) || !["system", "user", "assistant", "tool"].includes(String(message.role))) {
      throw new TypeError(`Gateway request messages[${index}] is invalid`);
    }
    if (typeof message.content !== "string") {
      throw new TypeError(`Gateway request messages[${index}].content must be a string`);
    }
  }
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
  for (const field of ["timeoutMs", "deadline"] as const) {
    if (request[field] !== undefined &&
      (typeof request[field] !== "number" || !Number.isFinite(request[field]))) {
      throw new TypeError(`Gateway request ${field} must be finite`);
    }
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
  const requestId = request.requestId ?? `gateway-${++nextRequestId}`;
  const sessionId = request.sessionId ?? requestId;
  return {
    model: request.model.trim(),
    messages: request.messages.map(message => ({ role: message.role, content: message.content })),
    tools: resolveRequestTools(request),
    requestId,
    sessionId,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
    ...(request.budgets === undefined ? {} : { budgets: request.budgets }),
    ...(request.retryPolicy === undefined ? {} : { retryPolicy: request.retryPolicy }),
    ...(request.toolExecutor === undefined ? {} : { toolExecutor: request.toolExecutor }),
    ...(request.approvalPolicy === undefined ? {} : { approvalPolicy: request.approvalPolicy }),
    ...(request.clock === undefined ? {} : { clock: request.clock }),
    ...(request.sleeper === undefined ? {} : { sleeper: request.sleeper }),
    ...(request.idGenerator === undefined ? {} : { idGenerator: request.idGenerator })
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
    message: asHarnessMessage(result.message),
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ...(result.usage.totalTokens === undefined ? {} : { totalTokens: result.usage.totalTokens })
    },
    ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason })
  };
}

function asProviderRequest(
  request: GatewayNormalizedRequest,
  messages: readonly (HarnessMessage | ChatMessage)[],
  tools: readonly GatewayHarnessTool[],
  harnessRequest?: HarnessProviderRequest
): ProviderRequest {
  const providerRequest: ProviderRequest = {
    model: request.model,
    messages: messages.map(asProviderMessage),
    tools: tools.map(asProviderTool),
    ...(harnessRequest?.signal === undefined ? {} : { signal: harnessRequest.signal }),
    ...(harnessRequest?.cancellation === undefined ? {} : { cancellation: harnessRequest.cancellation }),
    ...(harnessRequest?.timeoutMs === undefined ? {} : { timeoutMs: harnessRequest.timeoutMs }),
    ...(harnessRequest?.deadline === undefined ? {} : { deadline: harnessRequest.deadline }),
    ...(harnessRequest === undefined ? {} : { requestId: harnessRequest.requestId })
  };
  validateProviderRequest(providerRequest);
  return providerRequest;
}

function descriptorExecutor(request: GatewayNormalizedRequest): HarnessToolExecutor | undefined {
  if (request.toolExecutor !== undefined) return request.toolExecutor;
  const handles = new Map<string, (...args: readonly unknown[]) => unknown>();
  for (const tool of request.tools) {
    if (isDescriptor(tool) && "handle" in tool.executable) {
      handles.set(tool.name, tool.executable.handle.execute);
    }
  }
  if (handles.size === 0) return undefined;
  return async execution => {
    const handle = handles.get(execution.call.name);
    if (handle === undefined) throw new Error(`No executor for tool: ${execution.call.name}`);
    const value = await handle(execution.arguments);
    return { content: typeof value === "string" ? value : JSON.stringify(value) ?? "" };
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

class ProviderHarnessAdapter implements HarnessProvider {
  constructor(private readonly provider: ChatProvider, private readonly gatewayRequest: GatewayNormalizedRequest) {}

  async complete(request: HarnessProviderRequest): Promise<HarnessProviderResult> {
    const tools = request.tools as readonly GatewayHarnessTool[];
    const result = await this.provider.complete(
      asProviderRequest(this.gatewayRequest, request.messages, tools, request)
    );
    return asHarnessResult(result);
  }
}

export const harnessRuntimeAdapter: GatewayRuntimeAdapter = {
  runtime: "harness",
  supports: request => request.tools.every(tool => !isDescriptor(tool) || typeof tool.inputSchema !== "boolean"),
  async execute(request, provider, eventSink) {
    const toolExecutor = descriptorExecutor(request);
    const harnessRequest = {
      requestId: request.requestId,
      sessionId: request.sessionId,
      model: request.model,
      messages: request.messages.map(message => asProviderMessage(message) as unknown as HarnessMessage),
      tools: request.tools.map(asHarnessTool),
      provider: new ProviderHarnessAdapter(provider, request),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
      ...(request.budgets === undefined ? {} : { budgets: request.budgets }),
      ...(request.retryPolicy === undefined ? {} : { retryPolicy: request.retryPolicy }),
      clock: request.clock ?? defaultClock(),
      sleeper: request.sleeper ?? defaultSleeper(),
      ...(toolExecutor === undefined ? {} : { toolExecutor }),
      ...(request.approvalPolicy === undefined ? {} : { approvalPolicy: request.approvalPolicy }),
      ...(eventSink === undefined ? {} : { eventSink }),
      idGenerator: request.idGenerator ?? defaultIdGenerator()
    };
    const outcome: HarnessOutcome = await executeHarness(harnessRequest);
    if (outcome.outcome === "completed") return outcome.result;
    throw new Error("Harness execution failed");
  }
};

export const legacyPythonRuntimeAdapter: GatewayRuntimeAdapter = {
  runtime: "python",
  supports: () => true,
  async execute(request, provider) {
    const tools = request.tools.map(asHarnessTool);
    return await provider.complete(asProviderRequest(request, request.messages, tools)) as unknown as HarnessResult;
  }
};

function selectRuntime(
  request: GatewayNormalizedRequest,
  selection: GatewayRuntimeSelection | undefined,
  fallback: GatewayRuntimeAdapter | undefined
): { adapter: GatewayRuntimeAdapter; fallback: GatewayRuntimeAdapter } {
  const selected = selection === undefined
    ? { runtime: "python" as const }
    : typeof selection === "string" ? { runtime: selection } : selection;
  const pinned = runtimePins.get(request.sessionId);
  const adapter = pinned?.adapter ?? selected.adapter ?? (selected.runtime === "harness"
    ? harnessRuntimeAdapter
    : legacyPythonRuntimeAdapter);
  const selectedFallback = pinned === undefined
    ? selected.fallback ?? fallback ?? legacyPythonRuntimeAdapter
    : fallback ?? legacyPythonRuntimeAdapter;
  return { adapter, fallback: selectedFallback };
}

function safeHarnessEventSink(
  request: GatewayExecutionRequest,
): HarnessEventSink | undefined {
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

export function clearPinnedRuntime(sessionId?: string): void {
  if (sessionId === undefined) runtimePins.clear();
  else runtimePins.delete(sessionId);
}

export async function executeRequest(
  request: GatewayExecutionRequest,
  provider: ChatProvider
): Promise<HarnessResult> {
  const normalized = normalizeGatewayRequest(request);
  const selection = selectRuntime(normalized, request.runtime, request.runtimeFallback);
  let adapter = selection.adapter;
  const validateAdapter = (candidate: GatewayRuntimeAdapter): void => {
    if (candidate.runtime !== "harness" && candidate.runtime !== "python") {
      throw new TypeError("Gateway runtime adapter has invalid runtime");
    }
  };
  validateAdapter(adapter);
  if (!adapter.supports(normalized)) {
    adapter = selection.fallback;
    validateAdapter(adapter);
    if (!adapter.supports(normalized)) throw new GatewayRuntimeUnsupportedError(adapter.runtime);
  }
  if (request.runtime !== undefined || runtimePins.has(normalized.sessionId)) {
    runtimePins.set(normalized.sessionId, { runtime: adapter.runtime, adapter });
  }
  return adapter.execute(normalized, provider, safeHarnessEventSink(request));
}

export type { GatewayClientEvent, GatewayProtocolEvent };
export {
  PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
  PythonToolBridge,
  PythonToolBridgeError,
  createAllowlistedEnvironment,
  createPythonToolBridgeExecutor,
  createPythonToolBridgeSubprocessTransport
} from "./python-bridge";
export type {
  PythonToolBridgeCall,
  PythonToolBridgeErrorCode,
  PythonToolBridgeExecutorOptions,
  PythonToolBridgeFailure,
  PythonToolBridgeProcess,
  PythonToolBridgeRequest,
  PythonToolBridgeResponse,
  PythonToolBridgeSpawner,
  PythonToolBridgeSpawnOptions,
  PythonToolBridgeSuccess,
  PythonToolBridgeTool,
  PythonToolBridgeTransport
} from "./python-bridge";
