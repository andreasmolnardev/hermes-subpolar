import type { ProviderRequestIdentity } from "chat-provider-interface";

export type HarnessProviderFailureCategory =
  | "authentication"
  | "authorization"
  | "invalid_request"
  | "model_not_found"
  | "context_length"
  | "content_filter"
  | "tool_side_effect"
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
  readonly statusCode?: number;
  readonly requestId?: string;
};

export type HarnessRetryPolicy = {
  readonly maxAttempts?: number;
  readonly backoffMs?: number | ((attempt: number) => number);
};

export type RetryClassificationOptions = {
  readonly statusCode?: number;
  readonly body?: unknown;
  readonly cancelled?: boolean;
  readonly timedOut?: boolean;
  readonly network?: boolean;
};

export type ProviderAttemptIdentity = Omit<ProviderRequestIdentity, "requestId" | "attempt"> & {
  readonly requestId: string;
  readonly attempt: number;
  readonly providerId: string;
  readonly providerIndex: number;
};

export const MAX_RETRY_ATTEMPTS = 8;
export const MAX_RETRY_BACKOFF_MS = 60_000;

const RETRYABLE_CATEGORIES: ReadonlySet<HarnessProviderFailureCategory> = new Set([
  "rate_limit",
  "overloaded",
  "timeout",
  "network",
  "server"
]);

const FALLBACK_CATEGORIES: ReadonlySet<HarnessProviderFailureCategory> = new Set([
  "authentication",
  "authorization",
  "invalid_request",
  "content_filter",
  "model_not_found",
  "rate_limit",
  "overloaded",
  "timeout",
  "network",
  "server"
]);

const RATE_LIMIT_PATTERNS = [
  "rate limit", "rate_limit", "rate-limit", "too many requests", "throttled",
  "throttling", "resource_exhausted", "rate_limit_exceeded", "try again in",
  "please retry after", "requests per minute", "tokens per minute", "requests per day"
];
const OVERLOAD_PATTERNS = [
  "overloaded", "at capacity", "over capacity", "server is busy", "service is busy",
  "temporarily unavailable"
];
const INVALID_REQUEST_PATTERNS = [
  "invalid request", "invalid_request", "bad request", "malformed request",
  "unknown parameter", "unknown_parameter", "unsupported parameter", "unsupported_parameter",
  "unrecognized request argument", "invalid_request_body", "validation error",
  "request body is invalid", "must have non-empty content", "content field is required"
];
const CONTENT_POLICY_PATTERNS = [
  "flagged for possible cybersecurity risk", "trusted access for cyber",
  "violates our usage policies", "violates openai's usage policies", "your request was flagged by",
  "prompt was flagged by our safety", "responses cannot be generated due to safety",
  "content_filter", "responsibleaipolicyviolation", "new_sensitive"
];
const CONTEXT_PATTERNS = [
  "context length", "context size", "maximum context", "context window", "token limit",
  "too many tokens", "maximum number of tokens", "max_tokens", "max_model_len",
  "prompt length", "input is too long", "maximum model length", "prompt is too long",
  "request entity too large", "payload too large", "request_too_large"
];
const AUTH_PATTERNS = [
  "invalid api key", "invalid_api_key", "authentication", "unauthorized", "forbidden",
  "invalid token", "token expired", "token revoked", "access denied"
];
const MODEL_PATTERNS = ["model not found", "model_not_found", "invalid model", "unknown model", "unsupported model"];
const TIMEOUT_PATTERNS = [
  "timed out", "turn timed out", "request timed out", "deadline exceeded", "operation timed out",
  "upstream timed out"
];
const NETWORK_PATTERNS = [
  "fetch failed", "network error", "network connection", "connection refused", "connection reset",
  "connection aborted", "socket hang up", "econnrefused", "econnreset", "enotfound", "broken pipe"
];
const SERVER_PATTERNS = ["internal server error", "bad gateway", "server error", "upstream error", "service unavailable"];
const TIMEOUT_NAMES = new Set(["ReadTimeout", "ConnectTimeout", "PoolTimeout", "TimeoutError", "APITimeoutError"]);
const NETWORK_NAMES = new Set([
  "ConnectError", "RemoteProtocolError", "ConnectionError", "ConnectionResetError", "ConnectionAbortedError",
  "ReadError", "ServerDisconnectedError", "APIConnectionError", "NetworkError", "FetchError"
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  const candidate = record(value)?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function statusFrom(value: unknown): number | undefined {
  const candidate = record(value);
  const status = candidate?.statusCode ?? candidate?.status;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status < 600
    ? status
    : undefined;
}

function findStatus(error: unknown, explicitStatus: number | undefined): number | undefined {
  if (explicitStatus !== undefined) return statusFrom({ statusCode: explicitStatus });
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const status = statusFrom(current);
    if (status !== undefined) return status;
    const candidate = record(current);
    const cause = candidate?.cause ?? candidate?.__cause__;
    if (cause === current) break;
    current = cause;
  }
  return undefined;
}

function bodySignals(body: unknown): string {
  const root = record(body);
  const nested = record(root?.error);
  return [
    stringProperty(nested, "message"), stringProperty(root, "message"), stringProperty(root, "errorMessage"),
    stringProperty(nested, "code"), stringProperty(nested, "type"), stringProperty(root, "code"),
    stringProperty(root, "errorCode")
  ].filter((value): value is string => value !== undefined).join(" ").toLowerCase();
}

function errorSignals(error: unknown, body: unknown): { readonly message: string; readonly name: string } {
  return {
    message: `${stringProperty(error, "message") ?? ""} ${bodySignals(body)}`.toLowerCase(),
    name: stringProperty(error, "name") ?? ""
  };
}

function matches(message: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => message.includes(pattern));
}

function categoryIs(value: unknown): value is HarnessProviderFailureCategory {
  return value === "authentication" || value === "authorization" || value === "invalid_request" ||
    value === "model_not_found" || value === "context_length" || value === "content_filter" ||
    value === "tool_side_effect" || value === "rate_limit" || value === "overloaded" ||
    value === "timeout" || value === "cancelled" || value === "network" || value === "server" ||
    value === "unknown";
}

function safeMessage(category: HarnessProviderFailureCategory, statusCode: number | undefined): string {
  const status = statusCode === undefined ? "" : ` (status ${statusCode})`;
  return `Provider request failed: ${category}${status}`;
}

function classified(
  category: HarnessProviderFailureCategory,
  statusCode: number | undefined,
  requestId: string | undefined,
  retryable = RETRYABLE_CATEGORIES.has(category),
  fallbackEligible = FALLBACK_CATEGORIES.has(category)
): HarnessProviderFailure {
  return {
    category,
    retryable,
    fallbackEligible,
    message: safeMessage(category, statusCode),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(requestId === undefined ? {} : { requestId })
  };
}

/** Classify only bounded, safe error metadata. Response payloads never leave this function. */
export function classifyHarnessProviderError(
  error: unknown,
  options: RetryClassificationOptions = {}
): HarnessProviderFailure {
  const candidate = record(error);
  const statusCode = findStatus(error, options.statusCode);
  const requestId = stringProperty(error, "requestId");
  const body = options.body ?? candidate?.body ?? candidate?.response;
  const { message, name } = errorSignals(error, body);
  const explicitCategory = candidate?.category;

  if (options.cancelled || candidate?.cancelled === true || name === "AbortError" || explicitCategory === "cancelled") {
    return classified("cancelled", statusCode, requestId, false, false);
  }
  if (options.timedOut || candidate?.timedOut === true || TIMEOUT_NAMES.has(name) || matches(message, TIMEOUT_PATTERNS)) {
    return classified("timeout", statusCode, requestId);
  }
  // Deterministic request and safety failures must precede broad status matches.
  if (matches(message, CONTENT_POLICY_PATTERNS) || explicitCategory === "content_filter") {
    return classified("content_filter", statusCode, requestId, false, true);
  }
  if (matches(message, INVALID_REQUEST_PATTERNS.filter(pattern => pattern !== "bad request")) ||
      ((statusCode !== undefined || body !== undefined) && message.includes("bad request")) ||
      explicitCategory === "invalid_request") {
    return classified("invalid_request", statusCode, requestId, false, true);
  }
  if (explicitCategory === "tool_side_effect") {
    return classified("tool_side_effect", statusCode, requestId, false, false);
  }

  let category: HarnessProviderFailureCategory;
  if (statusCode === 401) category = "authentication";
  else if (statusCode === 403) category = "authorization";
  else if (statusCode === 404) category = matches(message, MODEL_PATTERNS) ? "model_not_found" : "unknown";
  else if (statusCode === 408 || statusCode === 504) category = "timeout";
  else if (statusCode === 413) category = "context_length";
  else if (statusCode === 429) category = matches(message, OVERLOAD_PATTERNS) ? "overloaded" : "rate_limit";
  else if (statusCode === 503 || statusCode === 529) category = "overloaded";
  else if (statusCode === 400) {
    category = matches(message, CONTEXT_PATTERNS) ? "context_length" :
      matches(message, RATE_LIMIT_PATTERNS) ? "rate_limit" : "invalid_request";
  } else if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) category = "server";
  else if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) category = "invalid_request";
  else if (matches(message, OVERLOAD_PATTERNS)) category = "overloaded";
  else if (matches(message, RATE_LIMIT_PATTERNS)) category = "rate_limit";
  else if (matches(message, CONTEXT_PATTERNS)) category = "context_length";
  else if (matches(message, AUTH_PATTERNS)) category = "authentication";
  else if (matches(message, MODEL_PATTERNS)) category = "model_not_found";
  else if (options.network || candidate?.network === true || NETWORK_NAMES.has(name) || matches(message, NETWORK_PATTERNS)) category = "network";
  else if (matches(message, SERVER_PATTERNS)) category = "server";
  else if (categoryIs(explicitCategory)) category = explicitCategory;
  else category = "unknown";

  return classified(category, statusCode, requestId);
}

export function boundedMaxAttempts(policy: HarnessRetryPolicy): number {
  const value = policy.maxAttempts ?? 1;
  return Number.isFinite(value) ? Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, Math.floor(value))) : MAX_RETRY_ATTEMPTS;
}

export function boundedBackoff(policy: HarnessRetryPolicy, attempt: number): number {
  const value = typeof policy.backoffMs === "function" ? policy.backoffMs(attempt) : (policy.backoffMs ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(MAX_RETRY_BACKOFF_MS, Math.floor(value)) : 0;
}

export function attemptIdentity(
  requestId: string,
  base: ProviderRequestIdentity | undefined,
  attempt: number,
  providerIndex: number
): ProviderAttemptIdentity {
  return {
    ...(base?.parentRequestId === undefined ? {} : { parentRequestId: base.parentRequestId }),
    requestId,
    attempt: (base?.attempt ?? 1) + attempt - 1,
    providerId: providerIndex === 0 ? "primary" : `fallback-${providerIndex}`,
    providerIndex
  };
}

export function remainingMilliseconds(now: number, deadline: number | undefined): number | undefined {
  if (deadline === undefined) return undefined;
  return Math.max(0, deadline - now);
}
