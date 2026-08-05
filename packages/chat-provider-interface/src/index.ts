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

export type ProviderDelta = {
  text: string;
  done: boolean;
};

export type ProviderStreamEvent =
  | { type: "start"; requestId?: string }
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | ({ type: "tool-call" } & ProviderToolCall)
  | ({ type: "tool-result" } & ProviderToolResult)
  | { type: "usage"; usage: ProviderUsage }
  | {
      type: "finish";
      finishReason: ProviderFinishReason;
      usage?: ProviderUsage;
      metadata?: ProviderMetadata;
    }
  | { type: "error"; error: ProviderErrorInfo };

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
};

export type ProviderErrorOptions = {
  category: ProviderErrorCategory;
  retryable?: boolean;
  statusCode?: number;
  requestId?: string;
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

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.category = options.category;
    this.retryable = options.retryable ?? defaultRetryable(options.category);
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
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
      ...(error.requestId === undefined ? {} : { requestId: error.requestId })
    };
  }

  if (error.name === "AbortError") {
    return { category: "cancelled", retryable: false, message: error.message };
  }
  if (error.name === "TimeoutError") {
    return { category: "timeout", retryable: true, message: error.message };
  }

  return { category: "unknown", retryable: false, message: error.message };
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

function assertMetadata(metadata: ProviderMetadata | undefined, path: string): void {
  if (metadata !== undefined) {
    assertProviderJsonValue(metadata, path);
  }
}

function assertUsage(usage: ProviderUsage, path: string): void {
  assertFiniteNumber(usage.inputTokens, `${path}.inputTokens`);
  assertFiniteNumber(usage.outputTokens, `${path}.outputTokens`);
  assertOptionalFiniteNumber(usage.totalTokens, `${path}.totalTokens`);
  assertOptionalFiniteNumber(usage.reasoningTokens, `${path}.reasoningTokens`);
  assertOptionalFiniteNumber(usage.cachedInputTokens, `${path}.cachedInputTokens`);
  assertOptionalFiniteNumber(usage.cacheCreationInputTokens, `${path}.cacheCreationInputTokens`);
  assertOptionalFiniteNumber(usage.cacheReadInputTokens, `${path}.cacheReadInputTokens`);
}

function assertMessage(message: ProviderMessage, path: string): void {
  assertMetadata(message.metadata, `${path}.metadata`);
}

export function validateProviderRequest(request: ProviderRequest): void {
  assertOptionalFiniteNumber(request.timeoutMs, "request.timeoutMs");
  assertOptionalFiniteNumber(request.deadline, "request.deadline");
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
  assertMetadata(result.metadata, "result.metadata");
}

export function validateProviderStreamEvent(event: ProviderStreamEvent): void {
  switch (event.type) {
    case "usage":
      assertUsage(event.usage, "stream.usage");
      break;
    case "finish":
      if (event.usage !== undefined) {
        assertUsage(event.usage, "stream.finish.usage");
      }
      assertMetadata(event.metadata, "stream.finish.metadata");
      break;
    case "error":
      assertOptionalFiniteNumber(event.error.statusCode, "stream.error.statusCode");
      break;
    default:
      break;
  }
}

export interface ChatProvider {
  complete(request: ProviderRequest): Promise<ProviderResult>;
  stream?(request: ProviderRequest): ProviderStream;
}
