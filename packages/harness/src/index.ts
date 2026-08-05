import type {
  ProviderCacheHints,
  ProviderContent,
  ProviderContentPart,
  ProviderFinishReason,
  ProviderJsonObject,
  ProviderJsonPrimitive,
  ProviderJsonValue,
  ProviderMessage,
  ProviderMetadata,
  ProviderModelOptions,
  ProviderRequest,
  ProviderResult,
  ProviderTool,
  ProviderToolCall,
  ProviderUsage
} from "chat-provider-interface";

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

export type HarnessPersistencePort = {
  append(event: HarnessEvent): Promise<void>;
  load?(sessionId: string): Promise<readonly HarnessMessage[]>;
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
  readonly approvalPolicy?: HarnessApprovalPolicy;
  readonly persistence?: HarnessPersistencePort;
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

function isJsonObject(value: HarnessJsonValue): value is HarnessJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(value: string): HarnessJsonObject | undefined {
  try {
    const parsed = JSON.parse(value) as HarnessJsonValue;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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
      await request.persistence?.append(full);
    } catch (error) {
      request.logger?.warn?.(`Harness persistence failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
  };
  const terminal = async (outcome: HarnessOutcome): Promise<HarnessOutcome> => {
    if (outcome.outcome === "completed") {
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
        outcome: outcome.outcome,
        message: outcome.error.message
      });
    }
    return outcome;
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

  let messages = request.messages;
  const messageLoader = request.loadMessages ?? request.persistence?.load;
  if (messageLoader) {
    try {
      const recovered = await messageLoader(request.sessionId);
      if (recovered.length > 0) messages = recovered;
    } catch (error) {
      request.logger?.warn?.(`Harness message recovery failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
    }
  }
  const toolsByName = new Map(request.tools.map(tool => [tool.name, tool]));
  const toolResults = new Map<string, HarnessToolResult>();
  const toolResultsByCall = new Map<string, HarnessToolResult>();
  const toolMessages = new Set<string>();
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
        attempt += 1;
        await emit({ type: "provider.requested", requestId: request.requestId, sessionId: request.sessionId, providerIndex });
        providerCalls += 1;
        try {
          providerResult = await abortable(currentProvider.complete({
            model: request.model,
            messages: assembled,
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
          totalTokens += providerResult.usage.totalTokens ?? providerResult.usage.inputTokens + providerResult.usage.outputTokens;
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
        try {
          const result = await abortable(request.toolExecutor({ requestId: request.requestId, sessionId: request.sessionId, call, arguments: parsed, signal: controller.signal }), controller.signal);
          toolResults.set(call.id, result);
          toolResultsByCall.set(callKey, result);
          toolMessages.add(call.id);
          messages = [...messages, { role: "tool", toolCallId: call.id, name: call.name, content: result.content }];
          await emit({ type: "tool.completed", requestId: request.requestId, sessionId: request.sessionId, callId: call.id, result });
        } catch (error) {
          if (isAborted(controller.signal)) return terminal(timedOut ? budgetError("Harness deadline exceeded") : cancellationError());
          return terminal(failureOutcome("tool_failure", typeof error === "object" && error !== null ? error : new Error(String(error)), "tool"));
        }
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
