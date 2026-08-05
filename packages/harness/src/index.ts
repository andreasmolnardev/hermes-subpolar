import type {
  ProviderCacheHints,
  ProviderContent,
  ProviderContentPart,
  ProviderFinishReason,
  ProviderJsonObject,
  ProviderJsonPrimitive,
  ProviderMessage,
  ProviderMetadata,
  ProviderJsonValue,
  ProviderModelOptions,
  ProviderRequest,
  ProviderResult,
  ProviderStreamEvent,
  ProviderTool,
  ProviderToolCall,
  ProviderUsage,
  ProviderUsageInput
} from "chat-provider-interface";
import { normalizeProviderUsage } from "chat-provider-interface";
import {
  closeInterruptedToolSequence,
  normalizeHarnessMessages,
  normalizeProviderResult
} from "./message-normalization";

export type HarnessJsonPrimitive = ProviderJsonPrimitive;
export type HarnessJsonValue = ProviderJsonValue;
export type HarnessJsonObject = ProviderJsonObject;

export type HarnessContent = ProviderContent;
export type HarnessContentPart = ProviderContentPart;
export type HarnessToolCall = ProviderToolCall;
export type HarnessMessage = ProviderMessage;

// Harness keeps deny as an execution policy; providers receive normalized tools.
export type HarnessTool = Omit<ProviderTool, "policy"> & {
  readonly policy?: ProviderTool["policy"] | "deny";
};

export type HarnessUsage = ProviderUsage;
export type HarnessProviderRequest = ProviderRequest &
  Required<Pick<ProviderRequest, "signal" | "cancellation" | "requestId">>;
export type HarnessProviderResult = ProviderResult;
export type HarnessFinishReason = ProviderFinishReason;
export type HarnessProviderMetadata = ProviderMetadata;

export type HarnessProvider = {
  complete(request: HarnessProviderRequest): Promise<ProviderResult>;
  stream?(request: HarnessProviderRequest): AsyncIterable<ProviderStreamEvent> | Promise<AsyncIterable<ProviderStreamEvent>>;
};

export type HarnessClock = {
  now(): number;
};

export type HarnessSleeper = {
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
};

export type HarnessToolExecution = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly call: HarnessToolCall;
  readonly arguments: HarnessJsonObject;
  readonly signal: AbortSignal;
};

export type HarnessToolResult = {
  readonly content: ProviderContent;
  readonly isError?: boolean;
  readonly truncated?: boolean;
};

export type HarnessToolExecutor = (
  execution: HarnessToolExecution
) => Promise<HarnessToolResult>;

export type HarnessApprovalRequest = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly tool: HarnessTool;
  readonly call: HarnessToolCall;
  readonly arguments: HarnessJsonObject;
  readonly signal: AbortSignal;
};

export type HarnessApprovalDecision = "allow" | "deny";
export type HarnessApprovalPolicy = (
  request: HarnessApprovalRequest
) => Promise<HarnessApprovalDecision>;

export type HarnessContext = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly model: string;
  readonly messages: readonly HarnessMessage[];
  readonly tools: readonly HarnessTool[];
  readonly signal: AbortSignal;
};

export type HarnessContextAssembler = (
  context: HarnessContext
) => Promise<readonly HarnessMessage[]>;

export type HarnessIdKind = "event" | "tool" | "message";
export type HarnessIdGenerator = (kind: HarnessIdKind) => string;

export type HarnessLogger = {
  debug?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
};

export type HarnessEventBase = {
  readonly id: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly at: number;
};

export type HarnessEvent =
  | (HarnessEventBase & { readonly type: "request.started" })
  | (HarnessEventBase & { readonly type: "provider.requested"; readonly providerIndex: number })
  | (HarnessEventBase & { readonly type: "provider.completed"; readonly providerIndex: number; readonly usage: HarnessUsage })
  | (HarnessEventBase & { readonly type: "approval.requested"; readonly call: HarnessToolCall })
  | (HarnessEventBase & { readonly type: "approval.resolved"; readonly callId: string; readonly decision: HarnessApprovalDecision })
  | (HarnessEventBase & { readonly type: "tool.called"; readonly call: HarnessToolCall })
  | (HarnessEventBase & { readonly type: "tool.completed"; readonly callId: string; readonly result: HarnessToolResult })
  | (HarnessEventBase & { readonly type: "retry.scheduled"; readonly providerIndex: number; readonly attempt: number; readonly delayMs: number })
  | (HarnessEventBase & { readonly type: "fallback.selected"; readonly providerIndex: number })
  | (HarnessEventBase & { readonly type: "terminal"; readonly outcome: HarnessTerminalOutcomeType; readonly message?: string });

type HarnessEventInput =
  | { readonly type: "request.started"; readonly requestId: string; readonly sessionId: string }
  | { readonly type: "provider.requested"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number }
  | { readonly type: "provider.completed"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number; readonly usage: HarnessUsage }
  | { readonly type: "approval.requested"; readonly requestId: string; readonly sessionId: string; readonly call: HarnessToolCall }
  | { readonly type: "approval.resolved"; readonly requestId: string; readonly sessionId: string; readonly callId: string; readonly decision: HarnessApprovalDecision }
  | { readonly type: "tool.called"; readonly requestId: string; readonly sessionId: string; readonly call: HarnessToolCall }
  | { readonly type: "tool.completed"; readonly requestId: string; readonly sessionId: string; readonly callId: string; readonly result: HarnessToolResult }
  | { readonly type: "retry.scheduled"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number; readonly attempt: number; readonly delayMs: number }
  | { readonly type: "fallback.selected"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number }
  | { readonly type: "terminal"; readonly requestId: string; readonly sessionId: string; readonly outcome: HarnessTerminalOutcomeType; readonly message?: string };

export type HarnessEventSink = (event: HarnessEvent) => void | Promise<void>;

export type HarnessRecoveredToolCall = {
  readonly call: HarnessToolCall;
  readonly result: HarnessToolResult;
};

export type HarnessRecoveryMetadata = {
  readonly turnId: string;
  readonly status: "running" | "interrupted" | "recoverable";
  readonly pendingToolCallIds?: readonly string[];
  readonly completedToolCallIds?: readonly string[];
  readonly completedToolCalls?: readonly HarnessRecoveredToolCall[];
};

export type HarnessToolCheckpoint = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly call: HarnessToolCall;
  readonly phase: "before-tool" | "tool-completed";
  readonly pendingToolCallIds: readonly string[];
  readonly completedToolCalls: readonly HarnessRecoveredToolCall[];
  readonly result?: HarnessToolResult;
  readonly at: string;
};

export type HarnessPersistencePort = {
  append?(event: HarnessEvent): Promise<void>;
  load?(sessionId: string): Promise<readonly HarnessMessage[]>;
  listMessages?(sessionId: string): Promise<readonly unknown[]>;
  commitTurn?(write: HarnessAtomicTurnWrite): Promise<unknown>;
  transaction?<T>(operation: (transaction: Pick<HarnessSessionRepository, "commitTurn">) => Promise<T>): Promise<T>;
  checkpoint?(checkpoint: HarnessToolCheckpoint): Promise<void>;
  recover?(sessionId: string): Promise<HarnessRecoveryMetadata | undefined>;
};

// Structural subset of data-layer's SessionRepository. Keeping this shape here
// avoids making the core loop depend on a concrete persistence package.
export type HarnessPersistedMessageDraft = {
  readonly id?: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string | readonly { readonly type: "text"; readonly text: string }[];
  readonly createdAt: string;
  readonly name?: string;
  readonly toolCalls?: readonly HarnessToolCall[];
  readonly toolCallId?: string;
  readonly toolResult?: {
    readonly toolCallId: string;
    readonly content: string | readonly { readonly type: "text"; readonly text: string }[];
    readonly isError: boolean;
    readonly toolName?: string;
  };
  readonly finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens?: number;
    readonly cachedInputTokens?: number;
    readonly reasoningTokens?: number;
  };
};

export type HarnessPersistedUsage = {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly recordedAt: string;
  readonly usage: NonNullable<HarnessPersistedMessageDraft["usage"]>;
  readonly messageId?: string;
};

export type HarnessAtomicTurnWrite = {
  readonly sessionId: string;
  readonly messages: readonly HarnessPersistedMessageDraft[];
  readonly expectedNextSequence?: number;
  readonly usage?: HarnessPersistedUsage | readonly HarnessPersistedUsage[];
};

export type HarnessSessionRepository = {
  commitTurn(write: HarnessAtomicTurnWrite): Promise<unknown>;
  listMessages?(sessionId: string): Promise<readonly unknown[]>;
  transaction?<T>(operation: (transaction: Pick<HarnessSessionRepository, "commitTurn">) => Promise<T>): Promise<T>;
};

export type HarnessToolOutputLimits = {
  /** Maximum UTF-8 bytes retained for one tool result. */
  readonly maxBytes?: number;
};

export type HarnessMessageLoader = (
  sessionId: string
) => Promise<readonly HarnessMessage[]>;

export type HarnessBudgets = {
  readonly maxTurns?: number;
  readonly maxProviderCalls?: number;
  readonly maxToolCalls?: number;
  readonly maxTokens?: number;
};

export type HarnessRetryPolicy = {
  readonly maxAttempts?: number;
  readonly backoffMs?: number | ((attempt: number) => number);
};

export type HarnessRequest = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly model: string;
  readonly messages: readonly HarnessMessage[];
  readonly tools: readonly HarnessTool[];
  readonly provider: HarnessProvider;
  readonly fallbackProviders?: readonly HarnessProvider[];
  readonly budgets?: HarnessBudgets;
  readonly retryPolicy?: HarnessRetryPolicy;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly deadline?: number;
  readonly options?: ProviderModelOptions;
  readonly cacheHints?: ProviderCacheHints;
  readonly metadata?: ProviderMetadata;
  readonly loadMessages?: HarnessMessageLoader;
  readonly clock: HarnessClock;
  readonly sleeper: HarnessSleeper;
  readonly toolExecutor?: HarnessToolExecutor;
  readonly toolTimeoutMs?: number;
  readonly toolConcurrency?: number;
  readonly toolOutputLimits?: HarnessToolOutputLimits;
  readonly approvalPolicy?: HarnessApprovalPolicy;
  readonly persistence?: HarnessPersistencePort;
  readonly sessionRepository?: HarnessSessionRepository;
  readonly eventSink?: HarnessEventSink;
  readonly contextAssembler?: HarnessContextAssembler;
  readonly idGenerator: HarnessIdGenerator;
  readonly logger?: HarnessLogger;
};

export type HarnessTerminalOutcomeType =
  | "completed"
  | "cancelled"
  | "budget_exhausted"
  | "provider_failure"
  | "tool_failure"
  | "approval_rejected";

export type HarnessTerminalOutcome = HarnessTerminalOutcomeType;

export type HarnessError = {
  readonly message: string;
  readonly category?: string;
};

export type HarnessOutcome =
  | { readonly outcome: "completed"; readonly result: HarnessProviderResult }
  | { readonly outcome: Exclude<HarnessTerminalOutcomeType, "completed">; readonly error: HarnessError };

export type HarnessRunResult = HarnessOutcome;

export type HarnessResult = HarnessProviderResult;

export type HarnessProviderFailureCategory =
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

export type HarnessProviderFailure = {
  readonly category: HarnessProviderFailureCategory;
  readonly retryable: boolean;
  readonly fallbackEligible: boolean;
  readonly message: string;
};

const RETRYABLE_CATEGORIES: ReadonlySet<HarnessProviderFailureCategory> = new Set([
  "rate_limit",
  "overloaded",
  "timeout",
  "network",
  "server"
]);

export class HarnessProviderError extends Error {
  readonly category: HarnessProviderFailureCategory;
  readonly retryable: boolean;
  readonly fallbackEligible: boolean;

  constructor(
    message: string,
    options: {
      readonly category: HarnessProviderFailureCategory;
      readonly retryable?: boolean;
      readonly fallbackEligible?: boolean;
    }
  ) {
    super(message);
    this.name = "HarnessProviderError";
    this.category = options.category;
    this.retryable = options.retryable ?? RETRYABLE_CATEGORIES.has(options.category);
    this.fallbackEligible = options.fallbackEligible ?? this.retryable;
  }
}

function isProviderCategory(value: string): value is HarnessProviderFailureCategory {
  return value === "authentication" || value === "authorization" || value === "invalid_request" ||
    value === "model_not_found" || value === "context_length" || value === "content_filter" ||
    value === "rate_limit" || value === "overloaded" || value === "timeout" || value === "cancelled" ||
    value === "network" || value === "server" || value === "unknown";
}

function thrownAsFailure(value: object): HarnessProviderFailure {
  if (value instanceof HarnessProviderError) {
    return {
      category: value.category,
      retryable: value.retryable,
      fallbackEligible: value.fallbackEligible,
      message: value.message
    };
  }
  if (value instanceof Error) {
    if (value.name === "AbortError") {
      return { category: "cancelled", retryable: false, fallbackEligible: false, message: value.message };
    }
    if (value.name === "TimeoutError") {
      return { category: "timeout", retryable: true, fallbackEligible: true, message: value.message };
    }
    const providerError = value as {
      readonly category?: string;
      readonly retryable?: boolean;
      readonly fallbackEligible?: boolean;
    };
    if (providerError.category !== undefined && isProviderCategory(providerError.category)) {
      const retryable = providerError.retryable === true || RETRYABLE_CATEGORIES.has(providerError.category);
      return {
        category: providerError.category,
        retryable,
        fallbackEligible: providerError.fallbackEligible === true || retryable,
        message: value.message
      };
    }
    return { category: "unknown", retryable: false, fallbackEligible: false, message: value.message };
  }
  const candidate = value as {
    readonly category?: string;
    readonly retryable?: boolean;
    readonly fallbackEligible?: boolean;
    readonly message?: string;
  };
  const category = candidate.category !== undefined && isProviderCategory(candidate.category)
    ? candidate.category
    : "unknown";
  const retryable = candidate.retryable === true || RETRYABLE_CATEGORIES.has(category);
  return {
    category,
    retryable,
    fallbackEligible: candidate.fallbackEligible === true || retryable,
    message: typeof candidate.message === "string" ? candidate.message : "Provider failed"
  };
}

function parseArguments(value: string): HarnessJsonObject | undefined {
  try {
    const parsed = JSON.parse(value) as HarnessJsonValue;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as HarnessJsonObject : undefined;
  } catch {
    return undefined;
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (utf8Bytes(value) <= maxBytes) return { value, truncated: false };
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return { value: result, truncated: true };
}

function isProviderContent(value: unknown): value is ProviderContent {
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) return false;
  return value.every((part: unknown) => {
    if (typeof part !== "object" || part === null || Array.isArray(part)) return false;
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text" || candidate.type === "reasoning") {
      return typeof candidate.text === "string";
    }
    if (candidate.type === "tool-call") {
      return typeof candidate.id === "string" && typeof candidate.name === "string" &&
        typeof candidate.arguments === "string";
    }
    if (candidate.type === "tool-result") {
      return typeof candidate.toolCallId === "string" &&
        isProviderContent(candidate.content) &&
        (candidate.isError === undefined || typeof candidate.isError === "boolean");
    }
    return false;
  });
}

function validateHarnessStreamUsage(usage: ProviderUsageInput): void {
  if ((usage.inputTokens !== undefined && !Number.isFinite(usage.inputTokens)) ||
      (usage.outputTokens !== undefined && !Number.isFinite(usage.outputTokens)) ||
      (usage.totalTokens !== undefined && !Number.isFinite(usage.totalTokens))) {
    throw new TypeError("Stream usage must contain finite token counts");
  }
}

function validateHarnessStreamEvent(event: ProviderStreamEvent): void {
  if (event.type === "usage") {
    validateHarnessStreamUsage(event.usage);
  } else if (event.type === "finish" && event.usage !== undefined) {
    validateHarnessStreamUsage(event.usage);
  }
}

function contentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map((part: ProviderContentPart) => {
    if (part.type === "text" || part.type === "reasoning") return part.text;
    if (part.type === "tool-call") return `${part.name}(${part.arguments})`;
    return contentText(part.content);
  }).join("");
}

function boundedToolResult(value: unknown, maxBytes: number): HarnessToolResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Tool returned an invalid result");
  }
  const candidate = value as { readonly content?: unknown; readonly isError?: unknown };
  if (!isProviderContent(candidate.content) ||
      (candidate.isError !== undefined && typeof candidate.isError !== "boolean")) {
    throw new TypeError("Tool returned an invalid result");
  }

  if (typeof candidate.content === "string") {
    const bounded = truncateUtf8(candidate.content, maxBytes);
    return {
      content: bounded.value,
      ...(candidate.isError === undefined ? {} : { isError: candidate.isError }),
      ...(bounded.truncated ? { truncated: true } : {})
    };
  }

  const serialized = JSON.stringify(candidate.content);
  if (serialized !== undefined && utf8Bytes(serialized) <= maxBytes) {
    return {
      content: candidate.content,
      ...(candidate.isError === undefined ? {} : { isError: candidate.isError })
    };
  }

  const bounded = truncateUtf8(contentText(candidate.content), maxBytes);
  return {
    content: bounded.value,
    ...(candidate.isError === undefined ? {} : { isError: candidate.isError }),
    truncated: true
  };
}

function timeoutError(): Error {
  const error = new Error("Tool execution timed out");
  error.name = "TimeoutError";
  return error;
}

function withToolDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number | undefined
): Promise<T> {
  const child = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
      callback();
    };
    const onParentAbort = () => {
      child.abort();
      finish(() => reject(abortError()));
    };
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
    if (parentSignal.aborted) {
      onParentAbort();
      return;
    }
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        child.abort();
        finish(() => reject(timeoutError()));
      }, Math.max(0, timeoutMs));
    }
    try {
      operation(child.signal).then(
        value => finish(() => resolve(value)),
        error => finish(() => reject(error))
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function collectProviderStream(
  provider: HarnessProvider,
  request: HarnessProviderRequest
): Promise<ProviderResult> {
  if (provider.stream === undefined) return provider.complete(request);
  const events = await provider.stream(request);
  let text = "";
  let reasoning = "";
  let usage: ProviderUsageInput = {};
  let finishReason: ProviderFinishReason | undefined;
  let metadata: ProviderMetadata | undefined;
  const toolCalls: ProviderToolCall[] = [];
  const toolCallIds = new Set<string>();
  const contentParts: ProviderContentPart[] = [];

  for await (const event of events) {
    validateHarnessStreamEvent(event);
    switch (event.type) {
      case "start":
        break;
      case "text-delta":
        text += event.text;
        break;
      case "reasoning-delta":
        reasoning += event.text;
        break;
      case "tool-call":
        if (!toolCallIds.has(event.id)) {
          toolCallIds.add(event.id);
          toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
        }
        break;
      case "tool-result":
        contentParts.push(event);
        break;
      case "usage":
        usage = event.usage;
        break;
      case "finish":
        finishReason = event.finishReason;
        if (event.usage !== undefined) usage = event.usage;
        metadata = event.metadata ?? metadata;
        break;
      case "error":
        throw new HarnessProviderError(event.error.message, {
          category: event.error.category,
          retryable: event.error.retryable
        });
    }
  }

  const messageContent: ProviderContent = contentParts.length > 0
    ? [...(text.length === 0 ? [] : [{ type: "text" as const, text }]), ...contentParts]
    : text;
  return {
    message: {
      role: "assistant",
      content: messageContent,
      ...(reasoning.length === 0 ? {} : { reasoning }),
      ...(toolCalls.length === 0 ? {} : { toolCalls })
    },
    usage: normalizeProviderUsage(usage),
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(reasoning.length === 0 ? {} : { reasoning }),
    ...(metadata === undefined ? {} : { metadata })
  };
}

function persistedContent(content: ProviderContent): string {
  return contentText(content);
}

function persistedFinishReason(
  reason: ProviderFinishReason
): NonNullable<HarnessPersistedMessageDraft["finishReason"]> {
  if (reason === "stop" || reason === "length" || reason === "content_filter" || reason === "error") {
    return reason;
  }
  if (reason === "tool_call") return "tool_calls";
  return "error";
}

function persistedAssistant(
  result: HarnessProviderResult,
  id: string,
  createdAt: string
): HarnessPersistedMessageDraft {
  return {
    id,
    role: "assistant",
    content: persistedContent(result.message.content),
    createdAt,
    ...(result.message.name === undefined ? {} : { name: result.message.name }),
    ...(result.message.toolCalls === undefined ? {} : { toolCalls: result.message.toolCalls }),
    ...(result.finishReason === undefined ? {} : { finishReason: persistedFinishReason(result.finishReason) }),
    usage: result.usage
  };
}

function persistedToolResult(
  call: HarnessToolCall,
  result: HarnessToolResult,
  id: string,
  createdAt: string
): HarnessPersistedMessageDraft {
  const content = persistedContent(result.content);
  return {
    id,
    role: "tool",
    content,
    createdAt,
    name: call.name,
    toolCallId: call.id,
    toolResult: {
      toolCallId: call.id,
      content,
      isError: result.isError === true,
      toolName: call.name
    }
  };
}

function errorMessage(value: object): string {
  return value instanceof Error ? value.message : "Operation failed";
}

function abortError(): Error {
  const error = new Error("Harness cancelled");
  error.name = "AbortError";
  return error;
}

function budgetError(message: string): HarnessOutcome {
  return { outcome: "budget_exhausted", error: { message, category: "budget" } };
}

function cancellationError(): HarnessOutcome {
  return { outcome: "cancelled", error: { message: "Harness cancelled", category: "cancelled" } };
}

function failureOutcome(outcome: "provider_failure" | "tool_failure" | "approval_rejected", error: object, category?: string): HarnessOutcome {
  return { outcome, error: { message: errorMessage(error), ...(category === undefined ? {} : { category }) } };
}

function persistenceFailureOutcome(error: Error): HarnessOutcome {
  return failureOutcome("provider_failure", error, "persistence");
}

function atomicRepository(
  persistence: HarnessPersistencePort | undefined
): HarnessSessionRepository | undefined {
  return persistence !== undefined && typeof persistence.commitTurn === "function"
    ? persistence as HarnessSessionRepository
    : undefined;
}

function defaultDelay(policy: HarnessRetryPolicy, attempt: number): number {
  const value = typeof policy.backoffMs === "function" ? policy.backoffMs(attempt) : (policy.backoffMs ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function providerTools(tools: readonly HarnessTool[]): readonly ProviderTool[] {
  return tools.map(tool => ({
    ...tool,
    policy: tool.policy === "ask" || tool.policy === "auto" ? tool.policy : "allow"
  }));
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    operation.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      }
    );
  });
}

async function runHarness(request: HarnessRequest): Promise<HarnessOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = request.deadline ?? (request.timeoutMs === undefined ? undefined : request.clock.now() + request.timeoutMs);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) controller.abort();
  if (deadline !== undefined) {
    const remaining = deadline - request.clock.now();
    if (remaining <= 0) {
      timedOut = true;
      controller.abort();
    } else {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, remaining);
    }
  }

  let terminalEmitted = false;
  let persistenceFailure: Error | undefined;
  let pendingMessages: HarnessPersistedMessageDraft[] = [];
  let pendingUsage: HarnessPersistedUsage[] = [];
  let messages: readonly HarnessMessage[] = request.messages;
  let nextSequence = 0;
  const commitPending = async (): Promise<boolean> => {
    const repository = request.sessionRepository ?? atomicRepository(request.persistence);
    if (repository === undefined || pendingMessages.length === 0) return true;
    const write: HarnessAtomicTurnWrite = {
      sessionId: request.sessionId,
      messages: pendingMessages,
      expectedNextSequence: nextSequence,
      ...(pendingUsage.length === 0 ? {} : { usage: pendingUsage })
    };
    try {
      if (repository.transaction !== undefined) {
        await repository.transaction(transaction => transaction.commitTurn(write));
      } else {
        await repository.commitTurn(write);
      }
      nextSequence += pendingMessages.length;
      pendingMessages = [];
      pendingUsage = [];
      return true;
    } catch (error) {
      persistenceFailure = typeof error === "object" && error !== null
        ? error instanceof Error ? error : new Error("Atomic turn persistence failed")
        : new Error(String(error));
      request.logger?.warn?.(`Atomic turn persistence failed: ${persistenceFailure.message}`);
      return false;
    }
  };
  const emit = async (event: HarnessEventInput): Promise<void> => {
    const full = {
      ...event,
      id: request.idGenerator("event"),
      at: request.clock.now()
    } as HarnessEvent;
    if (full.type === "terminal") {
      if (terminalEmitted) return;
      terminalEmitted = true;
    }
    try {
      await request.eventSink?.(full);
    } catch (error) {
      request.logger?.warn?.(`Harness event sink failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
    try {
      await request.persistence?.append?.(full);
    } catch (error) {
      request.logger?.warn?.(`Harness persistence failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
  };
  const completedTurnTools: HarnessRecoveredToolCall[] = [];
  const checkpointTool = async (
    task: { readonly call: HarnessToolCall },
    phase: HarnessToolCheckpoint["phase"],
    pendingToolCallIds: readonly string[],
    result?: HarnessToolResult
  ): Promise<boolean> => {
    if (request.persistence?.checkpoint === undefined) return true;
    const completedToolCalls = phase === "tool-completed" && result !== undefined
      ? [...completedTurnTools, { call: task.call, result }]
      : completedTurnTools;
    try {
      await request.persistence.checkpoint({
        requestId: request.requestId,
        sessionId: request.sessionId,
        turnId: request.requestId,
        call: task.call,
        phase,
        pendingToolCallIds,
        completedToolCalls,
        ...(result === undefined ? {} : { result }),
        at: new Date(request.clock.now()).toISOString()
      });
      if (phase === "tool-completed" && result !== undefined) {
        completedTurnTools.push({ call: task.call, result });
      }
      return true;
    } catch (error) {
      persistenceFailure = typeof error === "object" && error !== null
        ? error instanceof Error ? error : new Error("Tool checkpoint persistence failed")
        : new Error(String(error));
      request.logger?.warn?.(`Tool checkpoint persistence failed: ${persistenceFailure.message}`);
      return false;
    }
  };
  const terminal = async (outcome: HarnessOutcome): Promise<HarnessOutcome> => {
    let finalOutcome = outcome;
    if (finalOutcome.outcome === "cancelled") {
      messages = closeInterruptedToolSequence(messages);
    }
    if (persistenceFailure !== undefined) {
      finalOutcome = persistenceFailureOutcome(persistenceFailure);
    } else if (!(await commitPending())) {
      finalOutcome = persistenceFailureOutcome(persistenceFailure ?? new Error("Atomic turn persistence failed"));
    }
    if (finalOutcome.outcome !== "completed") controller.abort();
    if (finalOutcome.outcome === "completed") {
      await emit({
        type: "terminal",
        requestId: request.requestId,
        sessionId: request.sessionId,
        outcome: "completed"
      });
    } else {
      await emit({
        type: "terminal",
        requestId: request.requestId,
        sessionId: request.sessionId,
        outcome: finalOutcome.outcome,
        message: finalOutcome.error.message
      });
    }
    return finalOutcome;
  };
  const stopped = (): HarnessOutcome | undefined => {
    if (request.signal?.aborted || (controller.signal.aborted && !timedOut)) return cancellationError();
    if (timedOut || (deadline !== undefined && request.clock.now() >= deadline)) return budgetError("Harness deadline exceeded");
    return undefined;
  };

  await emit({ type: "request.started", requestId: request.requestId, sessionId: request.sessionId });
  if (stopped() !== undefined) {
    const stop = stopped();
    request.signal?.removeEventListener("abort", onAbort);
    if (timer !== undefined) clearTimeout(timer);
    return terminal(stop ?? cancellationError());
  }

  let recovery: HarnessRecoveryMetadata | undefined;
  const repositoryLoader = request.sessionRepository?.listMessages !== undefined
    ? (sessionId: string) => request.sessionRepository!.listMessages!(sessionId)
    : request.persistence?.listMessages !== undefined
      ? (sessionId: string) => request.persistence!.listMessages!(sessionId)
      : undefined;
  const messageLoader = request.loadMessages ?? request.persistence?.load ??
    (repositoryLoader === undefined ? undefined : async (sessionId: string) =>
      await repositoryLoader(sessionId) as readonly HarnessMessage[]);
  if (messageLoader) {
    try {
      const recovered = await messageLoader(request.sessionId);
      if (recovered.length > 0) messages = recovered;
    } catch (error) {
      request.logger?.warn?.(`Harness message recovery failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
  }
  if (request.persistence?.recover !== undefined) {
    try {
      recovery = await request.persistence.recover(request.sessionId);
      for (const completed of recovery?.completedToolCalls ?? []) {
        const hasCall = messages.some(message => message.role === "assistant" &&
          message.toolCalls?.some(call => call.id === completed.call.id));
        if (!hasCall) {
          messages = [...messages, { role: "assistant", content: "", toolCalls: [completed.call] }];
        }
        const hasResult = messages.some(message => message.role === "tool" && message.toolCallId === completed.call.id);
        if (!hasResult) {
          messages = [...messages, {
            role: "tool",
            toolCallId: completed.call.id,
            name: completed.call.name,
            content: completed.result.content
          }];
        }
      }
    } catch (error) {
      request.logger?.warn?.(`Harness turn recovery failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
  }
  if (recovery?.status === "interrupted") {
    messages = closeInterruptedToolSequence(messages);
  }
  try {
    messages = normalizeHarnessMessages(messages);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    return terminal(failureOutcome("provider_failure", failure, "history"));
  }
  nextSequence = messages.length;
  const toolsByName = new Map(request.tools.map(tool => [tool.name, tool]));
  const toolResults = new Map<string, HarnessToolResult>();
  const toolResultsByCall = new Map<string, HarnessToolResult>();
  const toolMessages = new Set<string>();
  const completedToolCallIds = new Set(recovery?.completedToolCallIds ?? []);
  const recoveredToolCalls = new Map<string, HarnessRecoveredToolCall>();
  for (const completed of recovery?.completedToolCalls ?? []) {
    recoveredToolCalls.set(completed.call.id, completed);
  }
  for (const [index, message] of messages.entries()) {
    if (message.role !== "tool" || message.toolCallId === undefined) continue;
    const call = messages.slice(0, index).findLast(candidate => candidate.role === "assistant" &&
      candidate.toolCalls?.some(toolCall => toolCall.id === message.toolCallId))?.toolCalls?.find(toolCall => toolCall.id === message.toolCallId);
    if (call === undefined) continue;
    const result = { content: message.content };
    toolResults.set(call.id, result);
    toolMessages.add(call.id);
    completedToolCallIds.add(call.id);
  }
  for (const completed of recoveredToolCalls.values()) {
    toolResults.set(completed.call.id, completed.result);
    toolMessages.add(completed.call.id);
    completedToolCallIds.add(completed.call.id);
    completedTurnTools.push(completed);
  }
  let providerCalls = 0;
  let turns = 0;
  let toolCalls = 0;
  let totalTokens = 0;
  let providerIndex = 0;
  let finalResult: HarnessProviderResult | undefined;
  const providers = [request.provider, ...(request.fallbackProviders ?? [])];
  const retryPolicy = request.retryPolicy ?? {};
  const maxAttempts = Math.max(1, retryPolicy.maxAttempts ?? 1);

  try {
    while (true) {
      const stop = stopped();
      if (stop !== undefined) return terminal(stop);
      if (request.budgets?.maxTurns !== undefined && turns >= request.budgets.maxTurns) {
        return terminal(budgetError("Harness turn budget exhausted"));
      }
      if (request.budgets?.maxProviderCalls !== undefined && providerCalls >= request.budgets.maxProviderCalls) {
        return terminal(budgetError("Harness provider-call budget exhausted"));
      }
      turns += 1;
      let providerResult: HarnessProviderResult | undefined;
      let lastFailure: HarnessProviderFailure | undefined;
      let attempt = 0;
      while (providerResult === undefined) {
        const currentProvider = providers[providerIndex];
        if (currentProvider === undefined) {
          const failure = lastFailure ?? {
            category: "unknown" as const,
            retryable: false,
            fallbackEligible: false,
            message: "No provider available"
          };
          return terminal(failureOutcome("provider_failure", new Error(failure.message), failure.category));
        }
        if (request.budgets?.maxProviderCalls !== undefined && providerCalls + 1 > request.budgets.maxProviderCalls) {
          return terminal(budgetError("Harness provider-call budget exhausted"));
        }
        const assembled = request.contextAssembler
          ? await abortable(request.contextAssembler({
            requestId: request.requestId,
            sessionId: request.sessionId,
            model: request.model,
            messages,
            tools: request.tools,
            signal: controller.signal
          }), controller.signal)
          : messages;
        const providerMessages = normalizeHarnessMessages(assembled);
        attempt += 1;
        await emit({ type: "provider.requested", requestId: request.requestId, sessionId: request.sessionId, providerIndex });
        providerCalls += 1;
        try {
          const rawProviderResult = await abortable(collectProviderStream(currentProvider, {
            model: request.model,
            messages: providerMessages,
            tools: providerTools(request.tools),
            signal: controller.signal,
            cancellation: controller.signal,
            ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
            ...(deadline === undefined ? {} : { deadline }),
            ...(request.options === undefined ? {} : { options: request.options }),
            ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
            ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
            requestId: request.requestId
          }), controller.signal);
          const existingCallIds = new Set(
            messages.flatMap(message => message.role === "assistant"
              ? (message.toolCalls ?? []).map(call => call.id.split("|", 1)[0] ?? call.id)
              : [])
          );
          providerResult = normalizeProviderResult(rawProviderResult, messages.length, existingCallIds);
          totalTokens += providerResult.usage.totalTokens ?? providerResult.usage.inputTokens + providerResult.usage.outputTokens;
          const assistantId = request.idGenerator("message");
          pendingMessages.push(persistedAssistant(
            providerResult,
            assistantId,
            new Date(request.clock.now()).toISOString()
          ));
          pendingUsage.push({
            schemaVersion: 1,
            sessionId: request.sessionId,
            recordedAt: new Date(request.clock.now()).toISOString(),
            usage: providerResult.usage,
            messageId: assistantId
          });
          await emit({ type: "provider.completed", requestId: request.requestId, sessionId: request.sessionId, providerIndex, usage: providerResult.usage });
        } catch (error) {
          const failure = thrownAsFailure(typeof error === "object" && error !== null ? error : new Error(String(error)));
          lastFailure = failure;
          const stopAfterFailure = stopped();
          if (stopAfterFailure !== undefined) return terminal(stopAfterFailure);
          if (failure.retryable && attempt < maxAttempts) {
            const delayMs = defaultDelay(retryPolicy, attempt);
            await emit({ type: "retry.scheduled", requestId: request.requestId, sessionId: request.sessionId, providerIndex, attempt, delayMs });
            await abortable(request.sleeper.sleep(delayMs, controller.signal), controller.signal);
            continue;
          }
          if (failure.fallbackEligible && providerIndex + 1 < providers.length) {
            providerIndex += 1;
            attempt = 0;
            await emit({ type: "fallback.selected", requestId: request.requestId, sessionId: request.sessionId, providerIndex });
            continue;
          }
          return terminal(failureOutcome("provider_failure", new Error(failure.message), failure.category));
        }
      }

      if (request.budgets?.maxTokens !== undefined && totalTokens > request.budgets.maxTokens) {
        return terminal(budgetError("Harness token budget exhausted"));
      }
      finalResult = providerResult;
      messages = [...messages, providerResult.message];
      if (providerResult.message.toolCalls === undefined || providerResult.message.toolCalls.length === 0) {
        return terminal({ outcome: "completed", result: providerResult });
      }
      type PendingTool = {
        readonly call: HarnessToolCall;
        readonly callKey: string;
        readonly tool: HarnessTool;
        readonly arguments: HarnessJsonObject;
      };
      const pendingTools: PendingTool[] = [];
      for (const call of providerResult.message.toolCalls) {
        const callKey = `${call.name}\u0000${call.arguments}`;
        const existing = toolResults.get(call.id) ?? toolResultsByCall.get(callKey);
        if (existing !== undefined) {
          toolResults.set(call.id, existing);
          toolResultsByCall.set(callKey, existing);
          if (!toolMessages.has(call.id)) {
            messages = [...messages, { role: "tool", toolCallId: call.id, name: call.name, content: existing.content }];
            toolMessages.add(call.id);
          }
          continue;
        }
        if (completedToolCallIds.has(call.id)) {
          return terminal(failureOutcome("tool_failure", new Error(`Recovered tool result unavailable: ${call.id}`), "recovery"));
        }
        const tool = toolsByName.get(call.name);
        const parsed = parseArguments(call.arguments);
        if (tool === undefined) {
          return terminal(failureOutcome("tool_failure", new Error(`Unknown tool: ${call.name}`), "tool"));
        }
        if (parsed === undefined) {
          return terminal(failureOutcome("tool_failure", new Error(`Malformed arguments for tool: ${call.name}`), "tool"));
        }
        if (tool.policy === "deny") {
          return terminal(failureOutcome("approval_rejected", new Error(`Tool denied by policy: ${call.name}`), "approval"));
        }
        if (tool.policy === "ask") {
          if (request.approvalPolicy === undefined) {
            return terminal(failureOutcome("approval_rejected", new Error(`Approval required for tool: ${call.name}`), "approval"));
          }
          await emit({ type: "approval.requested", requestId: request.requestId, sessionId: request.sessionId, call });
          let decision: HarnessApprovalDecision;
          try {
            decision = await abortable(request.approvalPolicy({ requestId: request.requestId, sessionId: request.sessionId, tool, call, arguments: parsed, signal: controller.signal }), controller.signal);
          } catch (error) {
            const stopAfterApproval = stopped();
            if (stopAfterApproval !== undefined) return terminal(stopAfterApproval);
            return terminal(failureOutcome("approval_rejected", new Error(errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))), "approval"));
          }
          await emit({ type: "approval.resolved", requestId: request.requestId, sessionId: request.sessionId, callId: call.id, decision });
          if (decision === "deny") {
            return terminal(failureOutcome("approval_rejected", new Error(`Tool approval rejected: ${call.name}`), "approval"));
          }
        }
        const stopBeforeTool = stopped();
        if (stopBeforeTool !== undefined) return terminal(stopBeforeTool);
        if (request.budgets?.maxToolCalls !== undefined && toolCalls >= request.budgets.maxToolCalls) {
          return terminal(budgetError("Harness tool-call budget exhausted"));
        }
        if (request.toolExecutor === undefined) {
          return terminal(failureOutcome("tool_failure", new Error(`No executor for tool: ${call.name}`), "tool"));
        }
        toolCalls += 1;
        await emit({ type: "tool.called", requestId: request.requestId, sessionId: request.sessionId, call });
        pendingTools.push({ call, callKey, tool, arguments: parsed });
      }

      const maxBytesCandidate = request.toolOutputLimits?.maxBytes ?? 64 * 1024;
      const maxBytes = Number.isFinite(maxBytesCandidate) && maxBytesCandidate >= 0
        ? Math.floor(maxBytesCandidate)
        : 64 * 1024;
      const concurrencyCandidate = request.toolConcurrency ?? 1;
      const concurrency = Number.isFinite(concurrencyCandidate) && concurrencyCandidate > 0
        ? Math.max(1, Math.floor(concurrencyCandidate))
        : 1;
      for (const [index, task] of pendingTools.entries()) {
        const stopBeforeCheckpoint = stopped();
        if (stopBeforeCheckpoint !== undefined) return terminal(stopBeforeCheckpoint);
        if (!(await checkpointTool(
          task,
          "before-tool",
          pendingTools.slice(index).map(pending => pending.call.id)
        ))) {
          controller.abort();
          return terminal(persistenceFailureOutcome(persistenceFailure ?? new Error("Tool checkpoint persistence failed")));
        }
      }
      const toolResultsForRound: Array<
        | { readonly task: PendingTool; readonly result: HarnessToolResult }
        | { readonly task: PendingTool; readonly error: object }
      > = [];
      let nextTool = 0;
      let stopStarting = false;
      const executeTool = async (task: PendingTool) => {
        if (stopStarting || controller.signal.aborted) {
          return { task, error: abortError() } as const;
        }
        try {
          const raw = await withToolDeadline(
            signal => request.toolExecutor!({
              requestId: request.requestId,
              sessionId: request.sessionId,
              call: task.call,
              arguments: task.arguments,
              signal
            }),
            controller.signal,
            request.toolTimeoutMs
          );
          const result = boundedToolResult(raw, maxBytes);
          if (!(await checkpointTool(
            task,
            "tool-completed",
            pendingTools
              .filter(pending => pending.call.id !== task.call.id &&
                !completedTurnTools.some(completed => completed.call.id === pending.call.id))
              .map(pending => pending.call.id),
            result
          ))) {
            stopStarting = true;
            controller.abort();
            return {
              task,
              error: persistenceFailure ?? new Error("Tool checkpoint persistence failed")
            } as const;
          }
          return { task, result } as const;
        } catch (error) {
          stopStarting = true;
          return {
            task,
            error: typeof error === "object" && error !== null ? error : new Error(String(error))
          } as const;
        }
      };
      const worker = async (): Promise<void> => {
        while (true) {
          const index = nextTool++;
          const task = pendingTools[index];
          if (task === undefined) return;
          toolResultsForRound[index] = await executeTool(task);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, pendingTools.length) }, () => worker())
      );
      const roundFailure = toolResultsForRound.find(entry => "error" in entry);
      for (const entry of toolResultsForRound) {
        if (entry === undefined || "error" in entry) continue;
        const { task, result } = entry;
        toolResults.set(task.call.id, result);
        toolResultsByCall.set(task.callKey, result);
        toolMessages.add(task.call.id);
        messages = [...messages, {
          role: "tool",
          toolCallId: task.call.id,
          name: task.call.name,
          content: result.content
        }];
        pendingMessages.push(persistedToolResult(
          task.call,
          result,
          request.idGenerator("message"),
          new Date(request.clock.now()).toISOString()
        ));
        await emit({ type: "tool.completed", requestId: request.requestId, sessionId: request.sessionId, callId: task.call.id, result });
      }
      if (!(await commitPending())) {
        return terminal(persistenceFailureOutcome(persistenceFailure ?? new Error("Atomic turn persistence failed")));
      }
      if (roundFailure !== undefined) {
        if (stopped() !== undefined) return terminal(stopped() ?? cancellationError());
        return terminal(failureOutcome("tool_failure", new Error(errorMessage(roundFailure.error)), "tool"));
      }
      if (finalResult === undefined) {
        return terminal(failureOutcome("provider_failure", new Error("Provider returned no result"), "provider"));
      }
    }
  } catch (error) {
    const thrown = typeof error === "object" && error !== null ? error : new Error(String(error));
    const stop = stopped();
    if (stop !== undefined) return terminal(stop);
    return terminal(failureOutcome("provider_failure", new Error(errorMessage(thrown)), "harness"));
  } finally {
    request.signal?.removeEventListener("abort", onAbort);
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function executeHarness(request: HarnessRequest): Promise<HarnessOutcome> {
  return runHarness(request);
}

export function run(request: HarnessRequest): Promise<HarnessOutcome> {
  return runHarness(request);
}

type LegacyTool = HarnessTool;

type LegacyRequest = {
  readonly model: string;
  readonly messages: readonly HarnessMessage[];
  readonly tools: readonly LegacyTool[];
};

type LegacyProvider = {
  complete(request: {
    readonly model: string;
    readonly messages: readonly HarnessMessage[];
    readonly tools: readonly LegacyTool[];
  }): Promise<ProviderResult>;
};

function isHarnessRequest(request: LegacyRequest | HarnessRequest): request is HarnessRequest {
  return "provider" in request;
}

export function execute(request: LegacyRequest, provider: LegacyProvider): Promise<HarnessResult>;
export function execute(request: HarnessRequest): Promise<HarnessOutcome>;
export function execute(request: LegacyRequest | HarnessRequest, provider?: LegacyProvider): Promise<HarnessResult | HarnessOutcome> {
  if (provider !== undefined) {
    return provider.complete({
      model: request.model,
      messages: request.messages,
      tools: request.tools
    });
  }
  if (!isHarnessRequest(request)) {
    throw new TypeError("Harness provider is required");
  }
  return runHarness(request);
}
