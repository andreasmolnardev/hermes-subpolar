import {
  classifyProviderError as classifyNeutralProviderError,
  type ProviderErrorClassifierOptions
} from "./provider-error-classifier";

export type ProviderJsonPrimitive = string | number | boolean | null;

export type ProviderJsonValue =
  | ProviderJsonPrimitive
  | readonly ProviderJsonValue[]
  | { readonly [key: string]: ProviderJsonValue };

export type ProviderJsonObject = {
  readonly [key: string]: ProviderJsonValue;
};

type ProviderJsonCandidate = ProviderJsonPrimitive | object | undefined;

/** JSON numbers cannot be NaN or +/-Infinity. */
export function isProviderFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function isProviderJsonValue(value: ProviderJsonCandidate): value is ProviderJsonValue {
  const active = new Set<object>();

  function visit(candidate: ProviderJsonCandidate): candidate is ProviderJsonValue {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      return true;
    }
    if (typeof candidate === "number") {
      return isProviderFiniteNumber(candidate);
    }
    if (candidate === undefined || typeof candidate !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Array.prototype && prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    if (active.has(candidate)) {
      return false;
    }

    active.add(candidate);
    const valid = Array.isArray(candidate)
      ? (candidate as readonly ProviderJsonCandidate[]).every((item) => visit(item))
      : Object.keys(candidate).every((key) =>
          visit((candidate as { readonly [key: string]: ProviderJsonCandidate })[key])
        );
    active.delete(candidate);
    return valid;
  }

  return visit(value);
}

export function assertProviderJsonValue(
  value: ProviderJsonCandidate,
  path = "value"
): asserts value is ProviderJsonValue {
  if (!isProviderJsonValue(value)) {
    throw new TypeError(`${path} must be a finite JSON value`);
  }
}

export type ProviderMetadata = {
  readonly [key: string]: ProviderJsonValue;
};

export type ProviderTextPart = {
  type: "text";
  text: string;
};

export type ProviderReasoningPart = {
  type: "reasoning";
  text: string;
};

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ProviderToolResult = {
  toolCallId: string;
  content: ProviderContent;
  isError?: boolean;
};

export type ProviderToolCallPart = ProviderToolCall & {
  type: "tool-call";
};

export type ProviderToolResultPart = ProviderToolResult & {
  type: "tool-result";
};

export type ProviderContentPart =
  | ProviderTextPart
  | ProviderReasoningPart
  | ProviderToolCallPart
  | ProviderToolResultPart;

export type ProviderContent = string | readonly ProviderContentPart[];

export type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: ProviderContent;
  reasoning?: string;
  toolCalls?: readonly ProviderToolCall[];
  toolCallId?: string;
  name?: string;
  metadata?: ProviderMetadata;
};

export type ProviderTool = {
  name: string;
  policy: "allow" | "ask" | "auto";
  description?: string;
  parameters?: ProviderJsonObject;
};

export type ProviderModelOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  stop?: string | readonly string[];
  seed?: number;
  reasoningEffort?: "low" | "medium" | "high";
  responseFormat?:
    | "text"
    | "json"
    | {
        type: "json-schema";
        name: string;
        schema: ProviderJsonObject;
        strict?: boolean;
      };
  parallelToolCalls?: boolean;
};

export type ProviderCacheHints = {
  key?: string;
  ttlMs?: number;
  read?: boolean;
  write?: boolean;
};

export type ProviderRequestIdentity = {
  requestId: string;
  attempt?: number;
  parentRequestId?: string;
};

export type ProviderRequest = {
  model: string;
  messages: readonly ProviderMessage[];
  tools: readonly ProviderTool[];
  signal?: AbortSignal;
  /** Kept for existing adapters; new adapters should use signal. */
  cancellation?: AbortSignal;
  timeoutMs?: number;
  /** Unix epoch milliseconds. */
  deadline?: number;
  options?: ProviderModelOptions;
  cacheHints?: ProviderCacheHints;
  requestId?: string;
  identity?: ProviderRequestIdentity;
  metadata?: ProviderMetadata;
};

export type ProviderFinishReason =
  | "stop"
  | "length"
  | "tool_call"
  | "content_filter"
  | "cancelled"
  | "error"
  | "unknown";

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

export type ProviderUsageInput = Partial<ProviderUsage>;

export type ProviderTextDelta = {
  text: string;
};

export type ProviderReasoningDelta = {
  text: string;
};

export type ProviderToolCallDelta = {
  /** Stable provider call ID when the provider has assigned one. */
  id?: string;
  /** Stream-local call index for providers that assign IDs late. */
  index?: number;
  name?: string;
  arguments?: string;
};

export type ProviderStartEvent = {
  type: "start";
  requestId?: string;
  identity?: ProviderRequestIdentity;
  metadata?: ProviderMetadata;
};

export type ProviderTextDeltaEvent = ProviderTextDelta & {
  type: "text-delta";
};

export type ProviderReasoningDeltaEvent = ProviderReasoningDelta & {
  type: "reasoning-delta";
};

export type ProviderToolCallDeltaEvent = ProviderToolCallDelta & {
  type: "tool-call-delta";
};

export type ProviderToolCallEvent = ProviderToolCall & {
  type: "tool-call";
};

export type ProviderToolResultEvent = ProviderToolResult & {
  type: "tool-result";
};

export type ProviderUsageEvent = {
  type: "usage";
  usage: ProviderUsageInput;
  metadata?: ProviderMetadata;
};

export type ProviderFinishEvent = {
  type: "finish";
  finishReason: ProviderFinishReason;
  usage?: ProviderUsageInput;
  metadata?: ProviderMetadata;
  requestId?: string;
  identity?: ProviderRequestIdentity;
};

export type ProviderErrorEvent = {
  type: "error";
  error: ProviderErrorInfo;
  metadata?: ProviderMetadata;
  requestId?: string;
  identity?: ProviderRequestIdentity;
};

export type ProviderDelta = {
  text: string;
  done: boolean;
};

export type ProviderStreamEvent =
  | ProviderStartEvent
  | ProviderTextDeltaEvent
  | ProviderReasoningDeltaEvent
  | ProviderToolCallDeltaEvent
  | ProviderToolCallEvent
  | ProviderToolResultEvent
  | ProviderUsageEvent
  | ProviderFinishEvent
  | ProviderErrorEvent;

export type ProviderErrorCategory =
  | "authentication"
  | "authorization"
  | "invalid_request"
  | "model_not_found"
  | "context_length"
  | "content_filter"
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "cancelled"
  | "network"
  | "server"
  | "unknown";

export type ProviderErrorInfo = {
  category: ProviderErrorCategory;
  retryable: boolean;
  message: string;
  statusCode?: number;
  requestId?: string;
  metadata?: ProviderMetadata;
};

export type ProviderErrorOptions = {
  category: ProviderErrorCategory;
  retryable?: boolean;
  statusCode?: number;
  requestId?: string;
  metadata?: ProviderMetadata;
  cause?: Error;
};

const RETRYABLE_ERROR_CATEGORIES: ReadonlySet<ProviderErrorCategory> = new Set([
  "rate_limit",
  "overloaded",
  "timeout",
  "network",
  "server"
]);

function defaultRetryable(category: ProviderErrorCategory): boolean {
  return RETRYABLE_ERROR_CATEGORIES.has(category);
}

export class ProviderError extends Error {
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: ProviderMetadata | undefined;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.category = options.category;
    this.retryable = options.retryable ?? defaultRetryable(options.category);
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function classifyProviderError(error: Error): ProviderErrorInfo {
  if (error instanceof ProviderError) {
    return {
      category: error.category,
      retryable: error.retryable,
      message: error.message,
      ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.metadata === undefined ? {} : { metadata: error.metadata })
    };
  }

  const classified = classifyNeutralProviderError(error);
  return {
    ...classified,
    message: error.message
  };
}

export function isRetryableProviderError(error: Error): boolean {
  return classifyProviderError(error).retryable;
}

export type ProviderStream =
  | AsyncIterable<ProviderStreamEvent>
  | Promise<AsyncIterable<ProviderStreamEvent>>;

export type ProviderResult = {
  message: ProviderMessage;
  usage: ProviderUsage;
  finishReason?: ProviderFinishReason;
  reasoning?: string;
  toolResults?: readonly ProviderToolResult[];
  requestId?: string;
  identity?: ProviderRequestIdentity;
  metadata?: ProviderMetadata;
};

function assertFiniteNumber(value: number, path: string): void {
  if (!isProviderFiniteNumber(value)) {
    throw new TypeError(`${path} must be finite`);
  }
}

function assertOptionalFiniteNumber(value: number | undefined, path: string): void {
  if (value !== undefined) {
    assertFiniteNumber(value, path);
  }
}

function usageNumber(value: number | undefined, path: string, fallback: number): number {
  const normalized = value ?? fallback;
  assertFiniteNumber(normalized, path);
  if (normalized < 0) {
    throw new TypeError(`${path} must be non-negative`);
  }
  return normalized;
}

function optionalUsageNumber(value: number | undefined, path: string): number | undefined {
  if (value === undefined) return undefined;
  return usageNumber(value, path, 0);
}

/** Fill omitted provider counters and derive total tokens without provider SDK types. */
export function normalizeProviderUsage(usage: ProviderUsageInput = {}, path = "usage"): ProviderUsage {
  const inputTokens = usageNumber(usage.inputTokens, `${path}.inputTokens`, 0);
  const outputTokens = usageNumber(usage.outputTokens, `${path}.outputTokens`, 0);
  const totalTokens = usage.totalTokens === undefined
    ? inputTokens + outputTokens
    : usageNumber(usage.totalTokens, `${path}.totalTokens`, 0);
  const reasoningTokens = optionalUsageNumber(usage.reasoningTokens, `${path}.reasoningTokens`);
  const cachedInputTokens = optionalUsageNumber(usage.cachedInputTokens, `${path}.cachedInputTokens`);
  const cacheCreationInputTokens = optionalUsageNumber(
    usage.cacheCreationInputTokens,
    `${path}.cacheCreationInputTokens`
  );
  const cacheReadInputTokens = optionalUsageNumber(usage.cacheReadInputTokens, `${path}.cacheReadInputTokens`);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(cacheCreationInputTokens === undefined ? {} : { cacheCreationInputTokens }),
    ...(cacheReadInputTokens === undefined ? {} : { cacheReadInputTokens })
  };
}

function assertMetadata(metadata: ProviderMetadata | undefined, path: string): void {
  if (metadata !== undefined) {
    assertProviderJsonValue(metadata, path);
  }
}

function assertUsage(usage: ProviderUsage, path: string): void {
  usageNumber(usage.inputTokens, `${path}.inputTokens`, 0);
  usageNumber(usage.outputTokens, `${path}.outputTokens`, 0);
  assertOptionalFiniteNumber(usage.totalTokens, `${path}.totalTokens`);
  assertOptionalFiniteNumber(usage.reasoningTokens, `${path}.reasoningTokens`);
  assertOptionalFiniteNumber(usage.cachedInputTokens, `${path}.cachedInputTokens`);
  assertOptionalFiniteNumber(usage.cacheCreationInputTokens, `${path}.cacheCreationInputTokens`);
  assertOptionalFiniteNumber(usage.cacheReadInputTokens, `${path}.cacheReadInputTokens`);
}

function assertIdentity(identity: ProviderRequestIdentity | undefined, path: string): void {
  if (identity === undefined) return;
  if (identity.requestId.trim().length === 0) {
    throw new TypeError(`${path}.requestId must be non-empty`);
  }
  assertOptionalFiniteNumber(identity.attempt, `${path}.attempt`);
  if (identity.attempt !== undefined && identity.attempt < 0) {
    throw new TypeError(`${path}.attempt must be non-negative`);
  }
  if (identity.parentRequestId !== undefined && identity.parentRequestId.trim().length === 0) {
    throw new TypeError(`${path}.parentRequestId must be non-empty`);
  }
}

function assertMessage(message: ProviderMessage, path: string): void {
  assertMetadata(message.metadata, `${path}.metadata`);
}

export function validateProviderRequest(request: ProviderRequest): void {
  assertOptionalFiniteNumber(request.timeoutMs, "request.timeoutMs");
  assertOptionalFiniteNumber(request.deadline, "request.deadline");
  if (request.timeoutMs !== undefined && request.timeoutMs < 0) {
    throw new TypeError("request.timeoutMs must be non-negative");
  }
  if (request.requestId !== undefined && request.requestId.trim().length === 0) {
    throw new TypeError("request.requestId must be non-empty");
  }
  assertIdentity(request.identity, "request.identity");
  if (request.identity !== undefined && request.requestId !== undefined &&
    request.identity.requestId !== request.requestId) {
    throw new TypeError("request.identity.requestId must match request.requestId");
  }
  assertMetadata(request.metadata, "request.metadata");

  request.messages.forEach((message, index) => assertMessage(message, `request.messages[${index}]`));
  request.tools.forEach((tool, index) => {
    if (tool.parameters !== undefined) {
      assertProviderJsonValue(tool.parameters, `request.tools[${index}].parameters`);
    }
  });

  if (request.options !== undefined) {
    assertOptionalFiniteNumber(request.options.temperature, "request.options.temperature");
    assertOptionalFiniteNumber(request.options.topP, "request.options.topP");
    assertOptionalFiniteNumber(request.options.maxTokens, "request.options.maxTokens");
    assertOptionalFiniteNumber(request.options.maxOutputTokens, "request.options.maxOutputTokens");
    assertOptionalFiniteNumber(request.options.seed, "request.options.seed");
    if (request.options.responseFormat !== null && typeof request.options.responseFormat === "object") {
      assertProviderJsonValue(request.options.responseFormat.schema, "request.options.responseFormat.schema");
    }
  }

  if (request.cacheHints !== undefined) {
    assertOptionalFiniteNumber(request.cacheHints.ttlMs, "request.cacheHints.ttlMs");
  }
}

export function validateProviderResult(result: ProviderResult): void {
  assertMessage(result.message, "result.message");
  assertUsage(result.usage, "result.usage");
  if (result.requestId !== undefined && result.requestId.trim().length === 0) {
    throw new TypeError("result.requestId must be non-empty");
  }
  result.toolResults?.forEach((toolResult, index) => assertMessage({
    role: "tool",
    content: toolResult.content,
    toolCallId: toolResult.toolCallId
  }, `result.toolResults[${index}]`));
  assertMetadata(result.metadata, "result.metadata");
}

export function validateProviderStreamEvent(event: ProviderStreamEvent): void {
  switch (event.type) {
    case "usage":
      normalizeProviderUsage(event.usage, "stream.usage");
      assertMetadata(event.metadata, "stream.usage.metadata");
      break;
    case "finish":
      if (event.usage !== undefined) {
        normalizeProviderUsage(event.usage, "stream.finish.usage");
      }
      assertMetadata(event.metadata, "stream.finish.metadata");
      assertIdentity(event.identity, "stream.finish.identity");
      if (event.identity !== undefined && event.requestId !== undefined &&
        event.identity.requestId !== event.requestId) {
        throw new TypeError("stream.finish.identity.requestId must match requestId");
      }
      if (event.requestId !== undefined && event.requestId.trim().length === 0) {
        throw new TypeError("stream.finish.requestId must be non-empty");
      }
      break;
    case "start":
      assertMetadata(event.metadata, "stream.start.metadata");
      assertIdentity(event.identity, "stream.start.identity");
      if (event.identity !== undefined && event.requestId !== undefined &&
        event.identity.requestId !== event.requestId) {
        throw new TypeError("stream.start.identity.requestId must match requestId");
      }
      if (event.requestId !== undefined && event.requestId.trim().length === 0) {
        throw new TypeError("stream.start.requestId must be non-empty");
      }
      break;
    case "error":
      assertMetadata(event.metadata, "stream.error.metadata");
      assertMetadata(event.error.metadata, "stream.error.info.metadata");
      assertIdentity(event.identity, "stream.error.identity");
      if (event.identity !== undefined && event.requestId !== undefined &&
        event.identity.requestId !== event.requestId) {
        throw new TypeError("stream.error.identity.requestId must match requestId");
      }
      assertOptionalFiniteNumber(event.error.statusCode, "stream.error.statusCode");
      if (event.requestId !== undefined && event.requestId.trim().length === 0) {
        throw new TypeError("stream.error.requestId must be non-empty");
      }
      break;
    default:
      break;
  }
}

export function normalizeProviderFinishReason(value: string | undefined): ProviderFinishReason {
  switch (value) {
    case "stop":
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "length":
    case "max_tokens":
    case "max_output_tokens":
      return "length";
    case "tool_call":
    case "tool_calls":
    case "function_call":
      return "tool_call";
    case "content_filter":
    case "safety":
      return "content_filter";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

export type ProviderErrorContext = {
  requestId?: string;
  metadata?: ProviderMetadata;
  statusCode?: number;
  body?: unknown;
  cancelled?: boolean;
  timedOut?: boolean;
  network?: boolean;
};

function isProviderErrorInfo(value: unknown): value is ProviderErrorInfo {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { category?: unknown; retryable?: unknown; message?: unknown };
  return typeof candidate.category === "string" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.message === "string";
}

/** Convert adapter-specific failures into the provider-neutral error envelope. */
export function normalizeProviderError(error: unknown, context: ProviderErrorContext = {}): ProviderErrorInfo {
  const classified = isProviderErrorInfo(error)
    ? error
    : error instanceof Error
      ? {
          ...classifyNeutralProviderError(error, context as ProviderErrorClassifierOptions),
          message: error.message
        }
      : {
          ...classifyNeutralProviderError(error, context as ProviderErrorClassifierOptions),
          message: "Provider failed"
        };
  const statusCode = classified.statusCode ?? context.statusCode;
  return {
    ...classified,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(context.requestId === undefined && classified.requestId === undefined
      ? {} : { requestId: context.requestId ?? classified.requestId }),
    ...(context.metadata === undefined && classified.metadata === undefined
      ? {} : { metadata: { ...classified.metadata, ...context.metadata } })
  };
}

export type ProviderRequestContext = {
  readonly signal: AbortSignal;
  readonly requestId: string | undefined;
  readonly identity: ProviderRequestIdentity | undefined;
  readonly deadline: number | undefined;
  readonly timedOut: () => boolean;
  readonly dispose: () => void;
};

export type ProviderRequestCancellation = Pick<
  ProviderRequest,
  "requestId" | "identity" | "signal" | "cancellation" | "timeoutMs" | "deadline"
>;

/** Combine caller cancellation with the earliest request timeout/deadline. */
export function createProviderRequestContext(
  request: ProviderRequestCancellation,
  now = Date.now()
): ProviderRequestContext {
  const controller = new AbortController();
  const sources = [request.signal, request.cancellation].filter(
    (signal, index, all): signal is AbortSignal => signal !== undefined && all.indexOf(signal) === index
  );
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort();
  for (const source of sources) {
    if (source.aborted) {
      controller.abort();
    } else {
      source.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timeoutDeadline = request.timeoutMs === undefined ? undefined : now + request.timeoutMs;
  const deadline = request.deadline === undefined
    ? timeoutDeadline
    : timeoutDeadline === undefined ? request.deadline : Math.min(request.deadline, timeoutDeadline);
  if (deadline !== undefined) {
    if (deadline <= now) {
      timedOut = true;
      controller.abort();
    } else {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, deadline - now);
    }
  }

  return {
    signal: controller.signal,
    requestId: request.identity?.requestId ?? request.requestId,
    identity: request.identity,
    deadline,
    timedOut: () => timedOut,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const source of sources) source.removeEventListener("abort", onAbort);
    }
  };
}

export type ProviderStreamOptions = ProviderRequestCancellation & {
  metadata?: ProviderMetadata;
};

function providerAbortError(context: ProviderRequestContext): ProviderError {
  return new ProviderError(
    context.timedOut() ? "Provider request deadline exceeded" : "Provider request cancelled",
    {
      category: context.timedOut() ? "timeout" : "cancelled",
      ...(context.requestId === undefined ? {} : { requestId: context.requestId })
    }
  );
}

async function nextProviderEvent(
  iterator: AsyncIterator<ProviderStreamEvent>,
  signal: AbortSignal,
  onAbort: () => Error
): Promise<IteratorResult<ProviderStreamEvent>> {
  if (signal.aborted) {
    void iterator.return?.();
    throw onAbort();
  }
  let abort: (() => void) | undefined;
  const next = iterator.next();
  const stopped = new Promise<IteratorResult<ProviderStreamEvent>>((_, reject) => {
    abort = () => {
      void iterator.return?.();
      reject(onAbort());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([next, stopped]);
  } finally {
    if (abort !== undefined) signal.removeEventListener("abort", abort);
  }
}

async function resolveProviderStream(
  stream: ProviderStream,
  context: ProviderRequestContext
): Promise<AsyncIterable<ProviderStreamEvent>> {
  if (context.signal.aborted) throw providerAbortError(context);
  let abort: (() => void) | undefined;
  const stopped = new Promise<AsyncIterable<ProviderStreamEvent>>((_, reject) => {
    abort = () => reject(providerAbortError(context));
    context.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(stream), stopped]);
  } finally {
    if (abort !== undefined) context.signal.removeEventListener("abort", abort);
  }
}

type ReconciledToolCall = {
  id?: string;
  name?: string;
  arguments: string;
  index: number;
  partIndex: number;
};

/** Consume one typed stream and reconcile interleaved deltas into one result. */
export async function reconcileProviderStream(
  stream: ProviderStream,
  options: ProviderStreamOptions = {}
): Promise<ProviderResult> {
  const context = createProviderRequestContext(options);
  const parts: ProviderContentPart[] = [];
  const calls: ReconciledToolCall[] = [];
  const toolResults: ProviderToolResult[] = [];
  let text = "";
  let reasoning = "";
  let usage: ProviderUsageInput = {};
  let finishReason: ProviderFinishReason = "unknown";
  let finishSeen = false;
  let requestId = context.requestId;
  let identity = context.identity;
  let metadata: ProviderMetadata | undefined = options.metadata;

  const mergeMetadata = (next: ProviderMetadata | undefined) => {
    if (next !== undefined) metadata = { ...metadata, ...next };
  };
  const setIdentity = (event: { requestId?: string; identity?: ProviderRequestIdentity }) => {
    const eventRequestId = event.identity?.requestId ?? event.requestId;
    if (eventRequestId !== undefined) {
      if (requestId !== undefined && requestId !== eventRequestId) {
        throw new ProviderError("Provider stream request identity changed", {
          category: "invalid_request",
          requestId
        });
      }
      requestId = eventRequestId;
    }
    if (event.identity !== undefined) identity = event.identity;
  };
  const appendText = (value: string) => {
    text += value;
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += value;
    else parts.push({ type: "text", text: value });
  };
  const appendReasoning = (value: string) => {
    reasoning += value;
    const last = parts[parts.length - 1];
    if (last?.type === "reasoning") last.text += value;
    else parts.push({ type: "reasoning", text: value });
  };
  const findCall = (delta: ProviderToolCallDelta): ReconciledToolCall | undefined => {
    if (delta.id !== undefined) return calls.find(call => call.id === delta.id);
    if (delta.index !== undefined) return calls.find(call => call.index === delta.index);
    return undefined;
  };
  const applyCall = (call: ProviderToolCall | ProviderToolCallDelta, replaceArguments: boolean) => {
    const delta = call as ProviderToolCallDelta;
    let current = findCall(delta);
    if (current === undefined) {
      const index = delta.index ?? calls.length;
      const created: ReconciledToolCall = {
        arguments: "",
        index,
        partIndex: parts.length,
        ...(delta.id === undefined ? {} : { id: delta.id }),
        ...(delta.name === undefined ? {} : { name: delta.name })
      };
      current = created;
      calls.push(created);
      parts.push({ type: "tool-call", id: delta.id ?? "", name: delta.name ?? "", arguments: "" });
    }
    if (delta.id !== undefined) current.id = delta.id;
    if (delta.name !== undefined) current.name = delta.name;
    if (delta.arguments !== undefined) {
      current.arguments = replaceArguments ? delta.arguments : current.arguments + delta.arguments;
    }
    const part = parts[current.partIndex];
    if (part?.type === "tool-call") {
      parts[current.partIndex] = {
        type: "tool-call",
        id: current.id ?? "",
        name: current.name ?? "",
        arguments: current.arguments
      };
    }
  };

  try {
    const iterator = (await resolveProviderStream(stream, context))[Symbol.asyncIterator]();
    while (true) {
      const next = await nextProviderEvent(iterator, context.signal, () => providerAbortError(context));
      if (next.done) break;
      const event = next.value;
      validateProviderStreamEvent(event);
      if (finishSeen) {
        throw new ProviderError("Provider emitted an event after finish", {
          category: "invalid_request",
          ...(requestId === undefined ? {} : { requestId })
        });
      }
      switch (event.type) {
        case "start":
          setIdentity(event);
          mergeMetadata(event.metadata);
          break;
        case "text-delta":
          appendText(event.text);
          break;
        case "reasoning-delta":
          appendReasoning(event.text);
          break;
        case "tool-call-delta":
          applyCall(event, false);
          break;
        case "tool-call":
          applyCall(event, true);
          break;
        case "tool-result":
          toolResults.push({
            toolCallId: event.toolCallId,
            content: event.content,
            ...(event.isError === undefined ? {} : { isError: event.isError })
          });
          break;
        case "usage":
          usage = event.usage;
          mergeMetadata(event.metadata);
          break;
        case "finish":
          setIdentity(event);
          finishReason = event.finishReason;
          if (event.usage !== undefined) usage = event.usage;
          mergeMetadata(event.metadata);
          finishSeen = true;
          break;
        case "error": {
          setIdentity(event);
          mergeMetadata(event.metadata);
          const info = normalizeProviderError(event.error, {
            ...(requestId === undefined ? {} : { requestId }),
            ...(metadata === undefined ? {} : { metadata })
          });
          throw new ProviderError(info.message, {
            category: info.category,
            retryable: info.retryable,
            ...(info.statusCode === undefined ? {} : { statusCode: info.statusCode }),
            ...(info.requestId === undefined ? {} : { requestId: info.requestId }),
            ...(info.metadata === undefined ? {} : { metadata: info.metadata })
          });
        }
      }
    }
  } catch (error) {
    if (context.signal.aborted) throw providerAbortError(context);
    if (error instanceof ProviderError) throw error;
    const info = normalizeProviderError(error, requestId === undefined ? {} : { requestId });
    throw new ProviderError(info.message, {
      category: info.category,
      retryable: info.retryable,
      ...(info.statusCode === undefined ? {} : { statusCode: info.statusCode }),
      ...(info.requestId === undefined ? {} : { requestId: info.requestId }),
      ...(info.metadata === undefined ? {} : { metadata: info.metadata })
    });
  } finally {
    context.dispose();
  }

  const normalizedCalls = calls.map((call, index): ProviderToolCall => {
    if (call.id === undefined || call.name === undefined) {
      throw new ProviderError(`Provider tool call ${index} is incomplete`, {
        category: "invalid_request",
        ...(requestId === undefined ? {} : { requestId })
      });
    }
    return { id: call.id, name: call.name, arguments: call.arguments };
  });
  const content: ProviderContent = parts.length === 0
    ? []
    : parts.every(part => part.type === "text")
      ? text
      : parts;
  const result: ProviderResult = {
    message: {
      role: "assistant",
      content,
      ...(reasoning.length === 0 ? {} : { reasoning }),
      ...(normalizedCalls.length === 0 ? {} : { toolCalls: normalizedCalls })
    },
    usage: normalizeProviderUsage(usage),
    finishReason,
    ...(reasoning.length === 0 ? {} : { reasoning }),
    ...(toolResults.length === 0 ? {} : { toolResults }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(identity === undefined ? {} : { identity }),
    ...(metadata === undefined ? {} : { metadata })
  };
  validateProviderResult(result);
  return result;
}

/** Adapter for providers that expose only a stream while complete remains the stable API. */
export async function completeFromProviderStream(
  provider: Pick<ChatProvider, "stream">,
  request: ProviderRequest
): Promise<ProviderResult> {
  if (provider.stream === undefined) throw new TypeError("Provider does not implement stream");
  return reconcileProviderStream(provider.stream(request), request);
}

export type RecordedProviderResponse = {
  readonly events: readonly ProviderStreamEvent[];
};

export type RecordedResponseProvider = ChatProvider & {
  readonly requests: readonly ProviderRequest[];
};

/** Credential-free provider for recorded event fixtures and adapter conformance tests. */
export function createRecordedResponseProvider(
  response: RecordedProviderResponse
): RecordedResponseProvider {
  const requests: ProviderRequest[] = [];
  const provider: RecordedResponseProvider = {
    get requests() {
      return requests;
    },
    async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      validateProviderRequest(request);
      requests.push(request);
      for (const event of response.events) {
        if (request.signal?.aborted || request.cancellation?.aborted) {
          throw new ProviderError("Provider request cancelled", {
            category: "cancelled",
            ...((request.identity?.requestId ?? request.requestId) === undefined
              ? {}
              : { requestId: request.identity?.requestId ?? request.requestId })
          });
        }
        yield event;
      }
    },
    async complete(request: ProviderRequest): Promise<ProviderResult> {
      return completeFromProviderStream(provider, request);
    }
  };
  return provider;
}

export interface ChatProvider {
  complete(request: ProviderRequest): Promise<ProviderResult>;
  stream?(request: ProviderRequest): ProviderStream;
}

export {
  createOpenAICompatibleProvider,
  type OpenAICompatibleCredentials,
  type OpenAICompatibleFetch,
  type OpenAICompatibleProviderOptions
} from "./openai-compatible";
