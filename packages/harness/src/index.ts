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
  ProviderRequestIdentity,
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
import {
  attemptIdentity,
  boundedBackoff,
  boundedMaxAttempts,
  classifyHarnessProviderError,
  remainingMilliseconds,
  type HarnessProviderFailure,
  type HarnessProviderFailureCategory,
  type HarnessRetryPolicy
} from "./retry-policy";
import {
  boundToolResult,
  enforceToolTurnBudget,
  DEFAULT_TOOL_PREVIEW_BYTES,
  type ToolOutputResult
} from "./tool-output";
import {
  IterationBudget,
  type IterationBudgetDecision,
  type IterationBudgetExhaustionReason
} from "./iteration-budget";
import {
  estimateRequestTokensRough,
  type HarnessTokenEstimate
} from "./model-metadata";
import {
  HarnessUnsupportedError,
  isHarnessUnsupportedError,
  type HarnessUnsupportedKind,
  type HarnessUnsupportedReason
} from "./prompt-assembler";

export { PiEventProjector } from "./pi-events";
export type { SubpolarPiEvent, SubpolarPiEventSink } from "./pi-events";
export { createSubpolarPiRuntime, executeSubpolarPiRun } from "./pi-runtime";
export type {
  CreateSubpolarPiRuntimeOptions,
  ExecuteSubpolarPiRunOptions,
  SubpolarPiRunResult,
  SubpolarPiRuntime
} from "./pi-runtime";
export { SubpolarResourceLoader } from "./pi-resources";
export type { SubpolarPiResourceOptions } from "./pi-resources";
export { toPiResolvedTool, toPiToolDefinition } from "./pi-tools";
export type {
  SubpolarPiPermissionDecision,
  SubpolarPiRunContext,
  SubpolarPiTool,
  SubpolarPiToolRequest,
  SubpolarPiToolResult
} from "./pi-tools";
export type { SubpolarPiResolvedToolExecutor } from "./pi-tools";
export { SubpolarPiCredentialStore } from "./pi-credentials";
export type { SubpolarCredentialBackend } from "./pi-credentials";
export { hydratePiSession, toPiMessages } from "./pi-messages";

export {
  MAX_RETRY_ATTEMPTS,
  MAX_RETRY_BACKOFF_MS,
  classifyHarnessProviderError,
  boundedBackoff,
  boundedMaxAttempts,
  remainingMilliseconds,
  attemptIdentity
} from "./retry-policy";
export type {
  HarnessProviderFailure,
  HarnessProviderFailureCategory,
  HarnessRetryPolicy,
  ProviderAttemptIdentity,
  RetryClassificationOptions
} from "./retry-policy";
export {
  boundToolResult,
  DEFAULT_TOOL_PREVIEW_BYTES,
  enforceToolTurnBudget,
  generatePreview,
  truncateTerminalOutput,
  truncateUtf8,
  utf8Bytes
} from "./tool-output";
export type { ToolOutputResult, Utf8Truncation } from "./tool-output";
export {
  IterationBudget
} from "./iteration-budget";
export type {
  IterationBudgetDecision,
  IterationBudgetExhaustionReason,
  IterationBudgetLimits,
  IterationBudgetResource,
  IterationBudgetResourceAlias,
  IterationBudgetSnapshot
} from "./iteration-budget";
export {
  assembleHarnessContext,
  createHarnessContextAssembler,
  isHarnessUnsupportedError,
  isHarnessUnsupportedContextSourceError,
  HarnessUnsupportedError,
  HarnessUnsupportedContextSourceError,
  HARNESS_PROMPT_SECTION_ORDER
} from "./prompt-assembler";
export type {
  HarnessPromptAssemblerOptions,
  HarnessPromptBudget,
  HarnessPromptCacheMarker,
  HarnessPromptSection,
  HarnessPromptSectionName,
  HarnessPromptSource,
  HarnessUnsupportedSourceKind,
  HarnessUnsupportedKind,
  HarnessUnsupportedReason,
  HarnessPromptAssembly
} from "./prompt-assembler";
export {
  HARNESS_IMAGE_TOKEN_COST,
  HARNESS_PROVIDER_ERROR_PARSER_VERSION,
  HARNESS_TOKEN_APPROXIMATION_VERSION,
  estimateContentPartTokensRough,
  estimateMessageTokensRough,
  estimateMessagesTokensRough,
  estimateRequestTokensRough,
  estimateTokensRough,
  estimateToolsTokensRough,
  getContextLengthFromProviderError,
  isOutputCapError,
  isSupportedTokenEstimate,
  parseAvailableOutputTokensFromError,
  parseAvailableOutputTokensFromErrorResult,
  parseContextLimitFromError,
  parseContextLimitFromErrorResult
} from "./model-metadata";
export type {
  HarnessParsedTokenValue,
  HarnessRequestTokenEstimateOptions,
  HarnessTokenEstimate
} from "./model-metadata";

export type HarnessJsonPrimitive = ProviderJsonPrimitive;
export type HarnessJsonValue = ProviderJsonValue;
export type HarnessJsonObject = ProviderJsonObject;

export type HarnessContent = ProviderContent;
export type HarnessContentPart = ProviderContentPart;
export type HarnessToolCall = ProviderToolCall;
export type HarnessMessageSidecars = {
  /** Exact provider-facing content when the persisted display content differs. */
  readonly apiContent?: HarnessContent;
  /** Presentation-only data retained for resume and projections. */
  readonly displayKind?: string;
  readonly displayMetadata?: HarnessJsonObject;
  readonly synthetic?: boolean;
  readonly context?: HarnessJsonValue;
};
export type HarnessMessage = ProviderMessage & HarnessMessageSidecars;

// Harness keeps deny as an execution policy; providers receive normalized tools.
export type HarnessTool = Omit<ProviderTool, "policy"> & {
  readonly policy?: ProviderTool["policy"] | "deny";
};

export type HarnessUsage = ProviderUsage;
export type HarnessProviderRequest = ProviderRequest &
  Required<Pick<ProviderRequest, "signal" | "cancellation" | "requestId" | "identity">> & {
    readonly providerId: string;
    readonly providerIndex: number;
  };
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

export type HarnessToolResult = ToolOutputResult;

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
  readonly workspaceId?: string;
  readonly messages: readonly HarnessMessage[];
  readonly tools: readonly HarnessTool[];
  readonly signal: AbortSignal;
};

export type HarnessContextAssembler = (
  context: HarnessContext
) => Promise<readonly HarnessMessage[]>;

export type HarnessContextSource = (
  context: HarnessContext
) => Promise<void>;

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
  | (HarnessEventBase & { readonly type: "provider.requested"; readonly providerIndex: number; readonly providerId: string; readonly attempt: number })
  | (HarnessEventBase & {
    readonly type: "provider.completed";
    readonly providerIndex: number;
    readonly providerId: string;
    readonly attempt: number;
    readonly usage: HarnessUsage;
    readonly finishReason?: HarnessFinishReason;
    readonly reasoning?: string;
    readonly metadata?: HarnessProviderMetadata;
    readonly providerRequestId?: string;
  })
  | (HarnessEventBase & { readonly type: "approval.requested"; readonly call: HarnessToolCall })
  | (HarnessEventBase & { readonly type: "approval.resolved"; readonly callId: string; readonly decision: HarnessApprovalDecision })
  | (HarnessEventBase & { readonly type: "tool.called"; readonly call: HarnessToolCall })
  | (HarnessEventBase & { readonly type: "tool.completed"; readonly callId: string; readonly result: HarnessToolResult })
  | (HarnessEventBase & { readonly type: "retry.scheduled"; readonly providerIndex: number; readonly providerId: string; readonly attempt: number; readonly delayMs: number })
  | (HarnessEventBase & { readonly type: "fallback.selected"; readonly providerIndex: number; readonly providerId: string })
  | (HarnessEventBase & { readonly type: "terminal"; readonly outcome: HarnessTerminalOutcomeType; readonly message?: string });

type HarnessEventInput =
  | { readonly type: "request.started"; readonly requestId: string; readonly sessionId: string }
  | { readonly type: "provider.requested"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number; readonly providerId: string; readonly attempt: number }
  | {
    readonly type: "provider.completed";
    readonly requestId: string;
    readonly sessionId: string;
    readonly providerIndex: number;
    readonly providerId: string;
    readonly attempt: number;
    readonly usage: HarnessUsage;
    readonly finishReason?: HarnessFinishReason;
    readonly reasoning?: string;
    readonly metadata?: HarnessProviderMetadata;
    readonly providerRequestId?: string;
  }
  | { readonly type: "approval.requested"; readonly requestId: string; readonly sessionId: string; readonly call: HarnessToolCall }
  | { readonly type: "approval.resolved"; readonly requestId: string; readonly sessionId: string; readonly callId: string; readonly decision: HarnessApprovalDecision }
  | { readonly type: "tool.called"; readonly requestId: string; readonly sessionId: string; readonly call: HarnessToolCall }
  | { readonly type: "tool.completed"; readonly requestId: string; readonly sessionId: string; readonly callId: string; readonly result: HarnessToolResult }
  | { readonly type: "retry.scheduled"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number; readonly providerId: string; readonly attempt: number; readonly delayMs: number }
  | { readonly type: "fallback.selected"; readonly requestId: string; readonly sessionId: string; readonly providerIndex: number; readonly providerId: string }
  | { readonly type: "terminal"; readonly requestId: string; readonly sessionId: string; readonly outcome: HarnessTerminalOutcomeType; readonly message?: string };

export type HarnessEventSink = (event: HarnessEvent) => void | Promise<void>;

export type HarnessRecoveredToolCall = {
  readonly call: HarnessToolCall;
  readonly result: HarnessToolResult;
};

export type HarnessRecoveryMetadata = {
  readonly turnId: string;
  readonly status: "running" | "interrupted" | "recoverable";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly checkpointId?: string;
  readonly pendingToolCallIds?: readonly string[];
  readonly completedToolCallIds?: readonly string[];
  readonly completedToolCalls?: readonly HarnessRecoveredToolCall[];
};

export type HarnessRuntimeMetadata = {
  readonly runtimeVersion: string;
  readonly schemaVersion: 1;
  readonly migratedFromSchemaVersion?: number;
  readonly migrationId?: string;
  readonly migratedAt?: string;
};

export type HarnessCheckpointMetadata = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sessionId: string;
  readonly messageSequence: number;
  readonly createdAt: string;
  readonly reason: "manual" | "turn" | "before-tool" | "migration";
  readonly runtime: HarnessRuntimeMetadata;
  readonly snapshot: HarnessJsonObject;
  readonly formatVersion?: number;
  readonly label?: string;
};

export type HarnessMigrationStateMetadata = {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly updatedAt: string;
  readonly runtime: HarnessRuntimeMetadata;
  readonly recovery?: HarnessRecoveryMetadata;
};

export type HarnessSessionSetup = {
  readonly sessionId: string;
  readonly workspaceId?: string;
  readonly model: string;
  readonly runtime: HarnessRuntimeMetadata;
  readonly createdAt: string;
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
  /** Verify or create the session before any provider or tool effect. */
  ensureSession?(sessionId: string, setup?: HarnessSessionSetup): Promise<void>;
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
  readonly content: HarnessContent;
  readonly createdAt: string;
  readonly apiContent?: HarnessContent;
  readonly displayKind?: string;
  readonly displayMetadata?: HarnessJsonObject;
  readonly synthetic?: boolean;
  readonly context?: HarnessJsonValue;
  readonly name?: string;
  readonly toolCalls?: readonly HarnessToolCall[];
  readonly toolCallId?: string;
  readonly toolResult?: {
    readonly toolCallId: string;
    readonly content: HarnessContent;
    readonly isError: boolean;
    readonly toolName?: string;
    readonly truncated?: boolean;
  };
  readonly finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  readonly reasoning?: string;
  readonly metadata?: HarnessProviderMetadata;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens?: number;
    readonly cachedInputTokens?: number;
    readonly reasoningTokens?: number;
    readonly cacheCreationInputTokens?: number;
    readonly cacheReadInputTokens?: number;
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
  readonly checkpoint?: HarnessCheckpointMetadata;
  readonly migrationState?: HarnessMigrationStateMetadata;
};

export type HarnessSessionRepository = {
  commitTurn(write: HarnessAtomicTurnWrite): Promise<unknown>;
  ensureSession?(sessionId: string, setup?: HarnessSessionSetup): Promise<void>;
  listMessages?(sessionId: string): Promise<readonly unknown[]>;
  transaction?<T>(operation: (transaction: Pick<HarnessSessionRepository, "commitTurn">) => Promise<T>): Promise<T>;
};

export type HarnessToolOutputLimits = {
  /** Maximum UTF-8 bytes retained for one tool result. */
  readonly maxBytes?: number;
  /** Optional maximum UTF-8 bytes retained across one assistant tool turn. */
  readonly maxTurnBytes?: number;
  /** Maximum UTF-8 bytes used for structured-result fallback previews. */
  readonly previewBytes?: number;
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

export type HarnessRequest = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly model: string;
  readonly workspaceId?: string;
  readonly messages: readonly HarnessMessage[];
  readonly tools: readonly HarnessTool[];
  readonly provider: HarnessProvider;
  readonly fallbackProviders?: readonly HarnessProvider[];
  readonly identity?: ProviderRequestIdentity;
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
  readonly runtime?: HarnessRuntimeMetadata;
  readonly persistence?: HarnessPersistencePort;
  readonly sessionRepository?: HarnessSessionRepository;
  readonly eventSink?: HarnessEventSink;
  readonly contextSource?: HarnessContextSource;
  readonly contextAssembler?: HarnessContextAssembler;
  readonly idGenerator: HarnessIdGenerator;
  readonly logger?: HarnessLogger;
};

export type HarnessTerminalOutcomeType =
  | "completed"
  | "cancelled"
  | "budget_exhausted"
  | "unsupported"
  | "provider_failure"
  | "tool_failure"
  | "approval_rejected";

export type HarnessTerminalOutcome = HarnessTerminalOutcomeType;

export type HarnessError = {
  readonly message: string;
  readonly category?: string;
  readonly reason?: IterationBudgetExhaustionReason | HarnessUnsupportedReason;
  readonly kind?: HarnessUnsupportedKind;
};

export type HarnessOutcome =
  | { readonly outcome: "completed"; readonly result: HarnessProviderResult }
  | { readonly outcome: Exclude<HarnessTerminalOutcomeType, "completed">; readonly error: HarnessError };

export type HarnessRunResult = HarnessOutcome;

export type HarnessResult = HarnessProviderResult;

export class HarnessProviderError extends Error {
  readonly category: HarnessProviderFailureCategory;
  readonly retryable: boolean;
  readonly fallbackEligible: boolean;
  readonly statusCode: number | undefined;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    options: {
      readonly category: HarnessProviderFailureCategory;
      readonly retryable?: boolean;
      readonly fallbackEligible?: boolean;
      readonly statusCode?: number;
      readonly requestId?: string;
    }
  ) {
    super(message);
    this.name = "HarnessProviderError";
    this.category = options.category;
    this.retryable = options.retryable ?? (
      options.category === "rate_limit" || options.category === "overloaded" || options.category === "timeout" ||
      options.category === "network" || options.category === "server"
    );
    this.fallbackEligible = options.fallbackEligible ?? this.retryable;
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
  }
}

function thrownAsFailure(value: object): HarnessProviderFailure {
  return classifyHarnessProviderError(value);
}

function parseArguments(value: string): HarnessJsonObject | undefined {
  try {
    const parsed = JSON.parse(value) as HarnessJsonValue;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as HarnessJsonObject : undefined;
  } catch {
    return undefined;
  }
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
  let responseRequestId: string | undefined;
  let responseIdentity: ProviderRequestIdentity | undefined;
  const toolCalls: ProviderToolCall[] = [];
  const toolCallIds = new Set<string>();
  const contentParts: ProviderContentPart[] = [];

  for await (const event of events) {
    validateHarnessStreamEvent(event);
    switch (event.type) {
      case "start":
        responseRequestId = event.requestId ?? responseRequestId;
        responseIdentity = event.identity ?? responseIdentity;
        metadata = event.metadata ?? metadata;
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
        responseRequestId = event.requestId ?? responseRequestId;
        responseIdentity = event.identity ?? responseIdentity;
        finishReason = event.finishReason;
        if (event.usage !== undefined) usage = event.usage;
        metadata = event.metadata ?? metadata;
        break;
      case "error":
        responseRequestId = event.requestId ?? responseRequestId;
        responseIdentity = event.identity ?? responseIdentity;
        metadata = event.metadata ?? metadata;
        throw new HarnessProviderError(event.error.message, {
          category: event.error.category,
          retryable: event.error.retryable,
          ...(event.error.statusCode === undefined ? {} : { statusCode: event.error.statusCode }),
          ...(event.error.requestId === undefined ? {} : { requestId: event.error.requestId })
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
    ...(responseRequestId === undefined ? {} : { requestId: responseRequestId }),
    ...(responseIdentity === undefined ? {} : { identity: responseIdentity }),
    ...(metadata === undefined ? {} : { metadata })
  };
}

function persistedMessage(
  message: HarnessMessage,
  id: string,
  createdAt: string
): HarnessPersistedMessageDraft {
  return {
    id,
    role: message.role,
    content: message.content,
    createdAt,
    ...(message.apiContent === undefined ? {} : { apiContent: message.apiContent }),
    ...(message.displayKind === undefined ? {} : { displayKind: message.displayKind }),
    ...(message.displayMetadata === undefined ? {} : { displayMetadata: message.displayMetadata }),
    ...(message.synthetic === undefined ? {} : { synthetic: message.synthetic }),
    ...(message.context === undefined ? {} : { context: message.context }),
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
    ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
    ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata })
  };
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
  const metadata = result.message.metadata ?? result.metadata;
  return {
    id,
    role: "assistant",
    content: result.message.content,
    createdAt,
    ...(result.message.name === undefined ? {} : { name: result.message.name }),
    ...(result.message.toolCalls === undefined ? {} : { toolCalls: result.message.toolCalls }),
    ...messageSidecars(result.message),
    ...(result.finishReason === undefined ? {} : { finishReason: persistedFinishReason(result.finishReason) }),
    ...(result.reasoning ?? result.message.reasoning) === undefined
      ? {}
      : { reasoning: result.reasoning ?? result.message.reasoning },
    ...(metadata === undefined ? {} : { metadata }),
    usage: result.usage
  };
}

function persistedToolResult(
  call: HarnessToolCall,
  result: HarnessToolResult,
  id: string,
  createdAt: string
): HarnessPersistedMessageDraft {
  return {
    id,
    role: "tool",
    content: result.content,
    createdAt,
    ...messageSidecars(result),
    name: call.name,
    toolCallId: call.id,
    toolResult: {
      toolCallId: call.id,
      content: result.content,
      isError: result.isError === true,
      toolName: call.name,
      ...(result.truncated === undefined ? {} : { truncated: result.truncated })
    },
    ...(result.isError === undefined && result.truncated === undefined ? {} : {
      metadata: {
        ...(result.isError === undefined ? {} : { isError: result.isError }),
        ...(result.truncated === undefined ? {} : { truncated: result.truncated })
      }
    })
  };
}

function messageSidecars(value: unknown): HarnessMessageSidecars {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const candidate = value as Partial<HarnessMessageSidecars>;
  return {
    ...(candidate.apiContent === undefined ? {} : { apiContent: candidate.apiContent }),
    ...(candidate.displayKind === undefined ? {} : { displayKind: candidate.displayKind }),
    ...(candidate.displayMetadata === undefined ? {} : { displayMetadata: candidate.displayMetadata }),
    ...(candidate.synthetic === undefined ? {} : { synthetic: candidate.synthetic }),
    ...(candidate.context === undefined ? {} : { context: candidate.context })
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

function budgetError(message: string, reason?: IterationBudgetExhaustionReason): HarnessOutcome {
  return {
    outcome: "budget_exhausted",
    error: { message, category: "budget", ...(reason === undefined ? {} : { reason }) }
  };
}

function iterationBudgetError(decision: IterationBudgetDecision): HarnessOutcome {
  const reason = decision.reason;
  if (reason === undefined) throw new Error("Budget exhaustion decision is missing a reason");
  const messages: Record<IterationBudgetExhaustionReason, string> = {
    max_turns: "Harness turn budget exhausted",
    max_provider_calls: "Harness provider-call budget exhausted",
    max_tool_calls: "Harness tool-call budget exhausted",
    max_tokens: "Harness token budget exhausted"
  };
  return budgetError(messages[reason], reason);
}

function cancellationError(): HarnessOutcome {
  return { outcome: "cancelled", error: { message: "Harness cancelled", category: "cancelled" } };
}

function unsupportedOutcome(error: HarnessUnsupportedError): HarnessOutcome {
  return {
    outcome: "unsupported",
    error: {
      message: error.message,
      category: "unsupported",
      reason: error.reason,
      kind: error.kind
    }
  };
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

function providerTools(tools: readonly HarnessTool[]): readonly ProviderTool[] {
  return tools.map(tool => ({
    ...tool,
    policy: tool.policy === "ask" || tool.policy === "auto" ? tool.policy : "allow"
  }));
}

function providerMessages(messages: readonly HarnessMessage[]): readonly ProviderMessage[] {
  return messages.map(message => {
    const {
      apiContent,
      displayKind: _displayKind,
      displayMetadata: _displayMetadata,
      synthetic: _synthetic,
      context: _context,
      ...providerMessage
    } = message;
    return { ...providerMessage, content: apiContent ?? message.content };
  });
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
  let pendingToolCallIds: readonly string[] = [];
  const runtime = request.runtime ?? { runtimeVersion: "harness", schemaVersion: 1 as const };
  const turnStartedAt = new Date(request.clock.now()).toISOString();
  const commitPending = async (
    finalize = false,
    finalStatus: HarnessRecoveryMetadata["status"] = "recoverable"
  ): Promise<boolean> => {
    const repository = request.sessionRepository ?? atomicRepository(request.persistence);
    if (repository === undefined || (pendingMessages.length === 0 && !finalize)) return true;
    const recordedAt = new Date(request.clock.now()).toISOString();
    const recoveryStatus: HarnessRecoveryMetadata["status"] = finalize ? finalStatus : "running";
    const checkpoint: HarnessCheckpointMetadata = {
      schemaVersion: 1,
      id: `${request.requestId}:checkpoint`,
      sessionId: request.sessionId,
      messageSequence: nextSequence + pendingMessages.length,
      createdAt: recordedAt,
      reason: "turn",
      runtime,
      snapshot: {
        turnId: request.requestId,
        pendingToolCallIds: [...pendingToolCallIds]
      }
    };
    const migrationState: HarnessMigrationStateMetadata = {
      schemaVersion: 1,
      sessionId: request.sessionId,
      updatedAt: recordedAt,
      runtime,
      recovery: {
        turnId: request.requestId,
        status: recoveryStatus,
        startedAt: turnStartedAt,
        updatedAt: recordedAt,
        checkpointId: checkpoint.id,
        pendingToolCallIds: [...pendingToolCallIds],
        completedToolCallIds: completedTurnTools.map(completed => completed.call.id)
      }
    };
    const write: HarnessAtomicTurnWrite = {
      sessionId: request.sessionId,
      messages: pendingMessages,
      expectedNextSequence: nextSequence,
      ...(pendingUsage.length === 0 ? {} : { usage: pendingUsage }),
      checkpoint,
      migrationState
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
    pendingIds: readonly string[],
    result?: HarnessToolResult
  ): Promise<boolean> => {
    const completedToolCalls = phase === "tool-completed" && result !== undefined
      ? [...completedTurnTools, { call: task.call, result }]
      : completedTurnTools;
    if (request.persistence?.checkpoint === undefined) {
      if (phase === "tool-completed" && result !== undefined) {
        completedTurnTools.push({ call: task.call, result });
      }
      pendingToolCallIds = [...pendingIds];
      return true;
    }
    try {
      await request.persistence.checkpoint({
        requestId: request.requestId,
        sessionId: request.sessionId,
        turnId: request.requestId,
        call: task.call,
        phase,
        pendingToolCallIds: pendingIds,
        completedToolCalls,
        ...(result === undefined ? {} : { result }),
        at: new Date(request.clock.now()).toISOString()
      });
      if (phase === "tool-completed" && result !== undefined) {
        completedTurnTools.push({ call: task.call, result });
      }
      pendingToolCallIds = [...pendingIds];
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
    if (finalOutcome.outcome === "unsupported") {
      controller.abort();
    } else if (persistenceFailure !== undefined) {
      finalOutcome = persistenceFailureOutcome(persistenceFailure);
    } else if (!(await commitPending(
      true,
      finalOutcome.outcome === "cancelled" ? "interrupted" : "recoverable"
    ))) {
      finalOutcome = persistenceFailureOutcome(persistenceFailure ?? new Error("Atomic turn persistence failed"));
    }
    if (finalOutcome.outcome !== "completed") controller.abort();
    await emit({
      type: "terminal",
      requestId: request.requestId,
      sessionId: request.sessionId,
      outcome: finalOutcome.outcome,
      ...(finalOutcome.outcome === "completed" ? {} : { message: finalOutcome.error.message })
    });
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

  if (typeof request.model !== "string" || request.model.trim().length === 0) {
    request.signal?.removeEventListener("abort", onAbort);
    if (timer !== undefined) clearTimeout(timer);
    return terminal(unsupportedOutcome(new HarnessUnsupportedError(
      "model",
      "unsupported-model",
      "Harness model must be a non-empty string"
    )));
  }

  try {
    const initialEstimate = estimateRequestTokensRough(
      providerMessages(request.messages),
      { tools: providerTools(request.tools) }
    );
    if (!initialEstimate.supported) {
      request.signal?.removeEventListener("abort", onAbort);
      if (timer !== undefined) clearTimeout(timer);
      return terminal(unsupportedOutcome(new HarnessUnsupportedError(
        "tokens",
        "unsupported-token-shape",
        `Harness cannot estimate request tokens: ${initialEstimate.reason}`
      )));
    }
  } catch (error) {
    request.signal?.removeEventListener("abort", onAbort);
    if (timer !== undefined) clearTimeout(timer);
    return terminal(unsupportedOutcome(new HarnessUnsupportedError(
      "tokens",
      "unsupported-token-shape",
      `Harness cannot estimate request tokens: ${errorMessage(error instanceof Error ? error : new Error(String(error)))}`
    )));
  }

  if (request.contextSource !== undefined) {
    try {
      await abortable(request.contextSource({
        requestId: request.requestId,
        sessionId: request.sessionId,
        model: request.model,
        ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
        messages: request.messages,
        tools: request.tools,
        signal: controller.signal
      }), controller.signal);
    } catch (error) {
      if (isHarnessUnsupportedError(error)) {
        return terminal(unsupportedOutcome(error));
      }
      const stop = stopped();
      if (stop !== undefined) return terminal(stop);
      const failure = error instanceof Error ? error : new Error(String(error));
      return terminal(failureOutcome("provider_failure", failure, "context"));
    }
  }

  const ensureSession = request.sessionRepository?.ensureSession ?? request.persistence?.ensureSession;
  if (ensureSession !== undefined) {
    try {
      await ensureSession(request.sessionId, {
        sessionId: request.sessionId,
        ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
        model: request.model,
        runtime,
        createdAt: turnStartedAt
      });
    } catch (error) {
      persistenceFailure = typeof error === "object" && error !== null
        ? error instanceof Error ? error : new Error("Session setup failed")
        : new Error(String(error));
      return terminal(persistenceFailureOutcome(persistenceFailure));
    }
  }

  let recovery: HarnessRecoveryMetadata | undefined;
  let loadedMessageCount = 0;
  let usedStoredMessages = false;
  const repositoryLoader = request.sessionRepository?.listMessages !== undefined
    ? (sessionId: string) => request.sessionRepository!.listMessages!(sessionId)
    : request.persistence?.listMessages !== undefined
      ? (sessionId: string) => request.persistence!.listMessages!(sessionId)
      : undefined;
  const messageLoader = request.loadMessages ?? request.persistence?.load ??
    (repositoryLoader === undefined ? undefined : async (sessionId: string) =>
      await repositoryLoader(sessionId) as readonly HarnessMessage[]);
  const messageLoaderUsesPersistence = request.loadMessages === undefined &&
    (request.persistence?.load !== undefined || repositoryLoader !== undefined);
  if (messageLoader) {
    try {
      const recovered = await messageLoader(request.sessionId);
      loadedMessageCount = recovered.length;
      if (recovered.length > 0) {
        messages = recovered as readonly HarnessMessage[];
        usedStoredMessages = true;
      }
    } catch (error) {
      request.logger?.warn?.(`Harness message recovery failed: ${errorMessage(typeof error === "object" && error !== null ? error : new Error(String(error)))}`);
      const failure = error instanceof Error ? error : new Error(String(error));
      if (messageLoaderUsesPersistence) persistenceFailure = failure;
      return terminal(messageLoaderUsesPersistence
        ? persistenceFailureOutcome(failure)
        : failureOutcome("provider_failure", failure, "history"));
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
      persistenceFailure = error instanceof Error ? error : new Error(String(error));
      return terminal(persistenceFailureOutcome(persistenceFailure));
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
  const inboundUser = [...request.messages].reverse().find(message => message.role === "user");
  const inboundNormalized = inboundUser === undefined
    ? undefined
    : normalizeHarnessMessages([inboundUser])[0];
  const storedInbound = usedStoredMessages
    ? [...messages.slice(0, loadedMessageCount)].reverse().find(message => message.role === "user")
    : undefined;
  const inboundAlreadyLoaded = inboundNormalized !== undefined && storedInbound !== undefined &&
    JSON.stringify(storedInbound) === JSON.stringify(inboundNormalized);
  if (inboundNormalized !== undefined && usedStoredMessages && !inboundAlreadyLoaded) {
    messages = [...messages, inboundNormalized];
  }
  nextSequence = request.sessionRepository?.commitTurn === undefined && atomicRepository(request.persistence) === undefined
    ? messages.length - (inboundAlreadyLoaded ? 0 : inboundNormalized === undefined ? 0 : 1)
    : loadedMessageCount;
  if (inboundNormalized !== undefined && !inboundAlreadyLoaded) {
    pendingMessages.push(persistedMessage(
      inboundNormalized,
      request.idGenerator("message"),
      new Date(request.clock.now()).toISOString()
    ));
  }
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
  const budget = new IterationBudget(request.budgets);
  let providerIndex = 0;
  let finalResult: HarnessProviderResult | undefined;
  const providers = [request.provider, ...(request.fallbackProviders ?? [])];
  const retryPolicy = request.retryPolicy ?? {};
  const maxAttempts = boundedMaxAttempts(retryPolicy);

  try {
    while (true) {
      const stop = stopped();
      if (stop !== undefined) return terminal(stop);
      const turnDecision = budget.tryConsume("turns");
      if (!turnDecision.allowed) return terminal(iterationBudgetError(turnDecision));
      const assembled = request.contextAssembler
        ? await abortable(request.contextAssembler({
          requestId: request.requestId,
          sessionId: request.sessionId,
          model: request.model,
          ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
          messages,
          tools: request.tools,
          signal: controller.signal
        }), controller.signal)
        : messages;
      const providerMessagesForTurn = providerMessages(normalizeHarnessMessages(assembled));
      const requestEstimate: HarnessTokenEstimate = estimateRequestTokensRough(providerMessagesForTurn, {
        tools: providerTools(request.tools)
      });
      if (!requestEstimate.supported) {
        return terminal(unsupportedOutcome(new HarnessUnsupportedError(
          "tokens",
          "unsupported-token-shape",
          `Harness cannot estimate request tokens: ${requestEstimate.reason}`
        )));
      }
      if (request.budgets?.maxTokens !== undefined) {
        const estimateDecision = budget.check("tokens", requestEstimate.tokens);
        if (!estimateDecision.allowed) return terminal(iterationBudgetError(estimateDecision));
      }
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
        const providerCheck = budget.check("providerCalls");
        if (!providerCheck.allowed) return terminal(iterationBudgetError(providerCheck));
        attempt += 1;
        const providerDecision = budget.tryConsume("providerCalls");
        if (!providerDecision.allowed) return terminal(iterationBudgetError(providerDecision));
        const providerAttempt = attemptIdentity(request.requestId, request.identity, budget.used("providerCalls"), providerIndex);
        const { providerId, providerIndex: attemptProviderIndex, ...identity } = providerAttempt;
        await emit({
          type: "provider.requested",
          requestId: request.requestId,
          sessionId: request.sessionId,
          providerIndex: attemptProviderIndex,
          providerId,
          attempt: identity.attempt
        });
        const remaining = remainingMilliseconds(request.clock.now(), deadline);
        if (remaining !== undefined && remaining <= 0) return terminal(budgetError("Harness deadline exceeded"));
        // Preserve the caller's timeout for provider identity/fidelity. The
        // absolute deadline carries the reduced remaining budget per attempt.
        const attemptTimeoutMs = request.timeoutMs;
        try {
          const rawProviderResult = await abortable(collectProviderStream(currentProvider, {
            model: request.model,
            messages: providerMessagesForTurn,
            tools: providerTools(request.tools),
            signal: controller.signal,
            cancellation: controller.signal,
            ...(attemptTimeoutMs === undefined ? {} : { timeoutMs: Math.max(0, attemptTimeoutMs) }),
            ...(deadline === undefined ? {} : { deadline }),
            ...(request.options === undefined ? {} : { options: request.options }),
            ...(request.cacheHints === undefined ? {} : { cacheHints: request.cacheHints }),
            ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
            requestId: request.requestId,
            identity,
            providerId,
            providerIndex: attemptProviderIndex
          }), controller.signal);
          const existingCallIds = new Set(
            messages.flatMap(message => message.role === "assistant"
              ? (message.toolCalls ?? []).map(call => call.id.split("|", 1)[0] ?? call.id)
              : [])
          );
          providerResult = normalizeProviderResult(rawProviderResult, messages.length, existingCallIds);
          const tokenDecision = budget.tryConsume(
            "tokens",
            providerResult.usage.totalTokens ?? providerResult.usage.inputTokens + providerResult.usage.outputTokens
          );
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
          await emit({
            type: "provider.completed",
            requestId: request.requestId,
            sessionId: request.sessionId,
            providerIndex: attemptProviderIndex,
            providerId,
            attempt: identity.attempt,
            usage: providerResult.usage,
            ...(providerResult.finishReason === undefined ? {} : { finishReason: providerResult.finishReason }),
            ...((providerResult.reasoning ?? providerResult.message.reasoning) === undefined
              ? {} : { reasoning: providerResult.reasoning ?? providerResult.message.reasoning }),
            ...(providerResult.metadata === undefined ? {} : { metadata: providerResult.metadata }),
            ...(providerResult.requestId === undefined ? {} : { providerRequestId: providerResult.requestId })
          });
          if (!tokenDecision.allowed) return terminal(iterationBudgetError(tokenDecision));
        } catch (error) {
          const failure = thrownAsFailure(typeof error === "object" && error !== null ? error : new Error(String(error)));
          lastFailure = failure;
          const stopAfterFailure = stopped();
          if (stopAfterFailure !== undefined) return terminal(stopAfterFailure);
          if (failure.retryable && attempt < maxAttempts) {
            const delayMs = boundedBackoff(retryPolicy, attempt);
            const remainingBeforeBackoff = remainingMilliseconds(request.clock.now(), deadline);
            if (remainingBeforeBackoff !== undefined && delayMs >= remainingBeforeBackoff) {
              return terminal(budgetError("Harness deadline exceeded"));
            }
            await emit({
              type: "retry.scheduled",
              requestId: request.requestId,
              sessionId: request.sessionId,
              providerIndex: attemptProviderIndex,
              providerId,
              attempt: identity.attempt,
              delayMs
            });
            await abortable(request.sleeper.sleep(delayMs, controller.signal), controller.signal);
            continue;
          }
          if (failure.fallbackEligible && providerIndex + 1 < providers.length) {
            providerIndex += 1;
            attempt = 0;
            await emit({
              type: "fallback.selected",
              requestId: request.requestId,
              sessionId: request.sessionId,
              providerIndex,
              providerId: providerIndex === 0 ? "primary" : `fallback-${providerIndex}`
            });
            continue;
          }
          return terminal(failureOutcome("provider_failure", new Error(failure.message), failure.category));
        }
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
        readonly precomputed?: HarnessToolResult;
      };
      const pendingTools: PendingTool[] = [];
      for (const call of providerResult.message.toolCalls) {
        const callKey = `${call.name}\u0000${call.arguments}`;
        const existing = toolResults.get(call.id) ?? toolResultsByCall.get(callKey);
        if (existing !== undefined) {
          toolResults.set(call.id, existing);
          toolResultsByCall.set(callKey, existing);
          if (!toolMessages.has(call.id)) {
            messages = [...messages, {
              role: "tool",
              toolCallId: call.id,
              name: call.name,
              content: existing.content,
              ...messageSidecars(existing)
            }];
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
          pendingTools.push({ call, callKey, tool, arguments: parsed, precomputed: {
            content: `Tool ${call.name} was denied because the capability is not permitted for this Agent/session.`,
            isError: true,
            synthetic: true
          } });
          continue;
        }
        if (tool.policy === "ask") {
          if (request.approvalPolicy === undefined) {
            pendingTools.push({ call, callKey, tool, arguments: parsed, precomputed: {
              content: `Tool ${call.name} was not run because interactive approval is unavailable on this transport.`,
              isError: true,
              synthetic: true
            } });
            continue;
          }
          await emit({ type: "approval.requested", requestId: request.requestId, sessionId: request.sessionId, call });
          let decision: HarnessApprovalDecision;
          try {
            decision = await abortable(request.approvalPolicy({ requestId: request.requestId, sessionId: request.sessionId, tool, call, arguments: parsed, signal: controller.signal }), controller.signal);
          } catch (error) {
            const stopAfterApproval = stopped();
            if (stopAfterApproval !== undefined) return terminal(stopAfterApproval);
            pendingTools.push({ call, callKey, tool, arguments: parsed, precomputed: {
              content: `Tool ${call.name} was not run because approval was cancelled or unavailable.`,
              isError: true,
              synthetic: true
            } });
            continue;
          }
          await emit({ type: "approval.resolved", requestId: request.requestId, sessionId: request.sessionId, callId: call.id, decision });
          if (decision === "deny") {
            pendingTools.push({ call, callKey, tool, arguments: parsed, precomputed: {
              content: `The user denied permission to run ${call.name}.`,
              isError: true,
              synthetic: true
            } });
            continue;
          }
        }
        const stopBeforeTool = stopped();
        if (stopBeforeTool !== undefined) return terminal(stopBeforeTool);
        const toolCheck = budget.check("toolCalls");
        if (!toolCheck.allowed) return terminal(iterationBudgetError(toolCheck));
        if (request.toolExecutor === undefined) {
          return terminal(failureOutcome("tool_failure", new Error(`No executor for tool: ${call.name}`), "tool"));
        }
        const toolDecision = budget.tryConsume("toolCalls");
        if (!toolDecision.allowed) return terminal(iterationBudgetError(toolDecision));
        await emit({ type: "tool.called", requestId: request.requestId, sessionId: request.sessionId, call });
        pendingTools.push({ call, callKey, tool, arguments: parsed });
      }

      const maxBytesCandidate = request.toolOutputLimits?.maxBytes ?? 64 * 1024;
      const maxBytes = Number.isFinite(maxBytesCandidate) && maxBytesCandidate >= 0
        ? Math.floor(maxBytesCandidate)
        : 64 * 1024;
      const previewBytesCandidate = request.toolOutputLimits?.previewBytes ?? DEFAULT_TOOL_PREVIEW_BYTES;
      const previewBytes = Number.isFinite(previewBytesCandidate) && previewBytesCandidate >= 0
        ? Math.floor(previewBytesCandidate)
        : DEFAULT_TOOL_PREVIEW_BYTES;
      const maxTurnBytesCandidate = request.toolOutputLimits?.maxTurnBytes;
      const maxTurnBytes = maxTurnBytesCandidate !== undefined &&
        Number.isFinite(maxTurnBytesCandidate) && maxTurnBytesCandidate >= 0
        ? Math.floor(maxTurnBytesCandidate)
        : undefined;
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
        if (task.precomputed !== undefined) return { task, result: task.precomputed } as const;
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
          const result = boundToolResult(raw, maxBytes, previewBytes);
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
      const successfulRoundResults = toolResultsForRound.flatMap(entry =>
        "error" in entry ? [] : [entry.result]
      );
      const aggregateRoundResults = maxTurnBytes === undefined
        ? successfulRoundResults
        : enforceToolTurnBudget(successfulRoundResults, maxTurnBytes);
      let aggregateResultIndex = 0;
      const roundFailure = toolResultsForRound.find(entry => "error" in entry);
      for (const entry of toolResultsForRound) {
        if (entry === undefined || "error" in entry) continue;
        const { task, result } = entry;
        const aggregateResult = aggregateRoundResults[aggregateResultIndex] ?? result;
        aggregateResultIndex += 1;
        toolResults.set(task.call.id, aggregateResult);
        toolResultsByCall.set(task.callKey, aggregateResult);
        toolMessages.add(task.call.id);
        messages = [...messages, {
          role: "tool",
          toolCallId: task.call.id,
          name: task.call.name,
          content: aggregateResult.content,
          ...messageSidecars(aggregateResult)
        }];
        pendingMessages.push(persistedToolResult(
          task.call,
          aggregateResult,
          request.idGenerator("message"),
          new Date(request.clock.now()).toISOString()
        ));
        await emit({ type: "tool.completed", requestId: request.requestId, sessionId: request.sessionId, callId: task.call.id, result: aggregateResult });
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
    if (isHarnessUnsupportedError(thrown)) {
      return terminal(unsupportedOutcome(thrown));
    }
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

export function execute(request: HarnessRequest): Promise<HarnessOutcome> {
  return runHarness(request);
}
