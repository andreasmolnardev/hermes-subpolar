import type { ProviderErrorCategory } from "./index";

export type ProviderErrorClassifierOptions = {
  readonly statusCode?: number;
  readonly body?: unknown;
  readonly cancelled?: boolean;
  readonly timedOut?: boolean;
  readonly network?: boolean;
};

export type ProviderErrorClassification = {
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly statusCode?: number;
};

const RETRYABLE_CATEGORIES: ReadonlySet<ProviderErrorCategory> = new Set([
  "rate_limit",
  "overloaded",
  "timeout",
  "network",
  "server"
]);

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate_limit",
  "rate-limit",
  "too many requests",
  "throttled",
  "throttling",
  "resource_exhausted",
  "rate_limit_exceeded",
  "too many concurrent requests",
  "servicequotaexceededexception",
  "rate increased too quickly",
  "requests per minute",
  "tokens per minute",
  "requests per day",
  "try again in",
  "please retry after"
];

const OVERLOAD_PATTERNS = [
  "overloaded",
  "at capacity",
  "over capacity",
  "server is busy",
  "service is busy",
  "temporarily unavailable"
];

const CONTEXT_LENGTH_PATTERNS = [
  "context length",
  "context size",
  "maximum context",
  "context window",
  "token limit",
  "too many tokens",
  "maximum number of tokens",
  "max_tokens",
  "max_model_len",
  "prompt length",
  "input is too long",
  "maximum model length",
  "maximum allowed input length",
  "context_length_exceeded",
  "max_tokens_exceeded",
  "exceeds the maximum number of input tokens",
  "prompt is too long",
  "reduce the length",
  "request entity too large",
  "payload too large",
  "request_too_large",
  "request exceeds the maximum size"
];

const INVALID_REQUEST_PATTERNS = [
  "invalid request",
  "invalid_request",
  "bad request",
  "malformed request",
  "unknown parameter",
  "unknown_parameter",
  "unsupported parameter",
  "unsupported_parameter",
  "unrecognized request argument",
  "invalid_request_body",
  "validation error",
  "request body is invalid",
  "must have non-empty content",
  "content field is required"
];

const AUTH_PATTERNS = [
  "invalid api key",
  "invalid_api_key",
  "authentication",
  "unauthorized",
  "forbidden",
  "invalid token",
  "token expired",
  "token revoked",
  "access denied"
];

const CONTENT_POLICY_PATTERNS = [
  "flagged for possible cybersecurity risk",
  "trusted access for cyber",
  "violates our usage policies",
  "violates openai's usage policies",
  "your request was flagged by",
  "prompt was flagged by our safety",
  "responses cannot be generated due to safety",
  "content_filter",
  "responsibleaipolicyviolation",
  "new_sensitive"
];

const TIMEOUT_PATTERNS = [
  "timed out",
  "turn timed out",
  "request timed out",
  "deadline exceeded",
  "operation timed out",
  "upstream timed out"
];

const TIMEOUT_ERROR_NAMES = new Set([
  "ReadTimeout",
  "ConnectTimeout",
  "PoolTimeout",
  "TimeoutError",
  "APITimeoutError"
]);

const NETWORK_PATTERNS = [
  "fetch failed",
  "network error",
  "network connection",
  "connection refused",
  "connection reset",
  "connection aborted",
  "socket hang up",
  "econnrefused",
  "econnreset",
  "enotfound",
  "broken pipe"
];

const NETWORK_ERROR_NAMES = new Set([
  "ConnectError",
  "RemoteProtocolError",
  "ConnectionError",
  "ConnectionResetError",
  "ConnectionAbortedError",
  "ReadError",
  "ServerDisconnectedError",
  "APIConnectionError",
  "NetworkError",
  "FetchError"
]);

const SERVER_PATTERNS = [
  "internal server error",
  "bad gateway",
  "server error",
  "upstream error",
  "service unavailable"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function errorName(error: unknown): string {
  return isRecord(error) && typeof error.name === "string" ? error.name : "";
}

function errorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === "string" ? error.message : "";
}

function statusFrom(value: unknown): number | undefined {
  const statusCode = property(value, "statusCode");
  if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 100 && statusCode < 600) {
    return statusCode;
  }
  const status = property(value, "status");
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status < 600) {
    return status;
  }
  return undefined;
}

function findStatus(error: unknown, explicitStatus: number | undefined): number | undefined {
  if (explicitStatus !== undefined) return statusFrom({ statusCode: explicitStatus });
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const status = statusFrom(current);
    if (status !== undefined) return status;
    const cause = property(current, "cause") ?? property(current, "__cause__");
    if (cause === current) break;
    current = cause;
  }
  return undefined;
}

function bodyMessage(body: unknown): string {
  const error = property(body, "error");
  const values = [
    property(error, "message"),
    property(body, "message"),
    property(body, "errorMessage"),
    property(error, "code"),
    property(error, "type"),
    property(body, "code"),
    property(body, "errorCode")
  ];
  return values.filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
}

function combinedMessage(error: unknown, body: unknown): string {
  return `${errorMessage(error)} ${bodyMessage(body)}`.toLowerCase();
}

function matches(message: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => message.includes(pattern));
}

function result(category: ProviderErrorCategory, statusCode: number | undefined): ProviderErrorClassification {
  return {
    category,
    retryable: RETRYABLE_CATEGORIES.has(category),
    ...(statusCode === undefined ? {} : { statusCode })
  };
}

function classifyStatus(
  statusCode: number,
  message: string
): ProviderErrorCategory {
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "model_not_found";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode === 413) return "context_length";
  if (statusCode === 429) return matches(message, OVERLOAD_PATTERNS) ? "overloaded" : "rate_limit";
  if (statusCode === 400) {
    // Keep deterministic parameter errors ahead of the broad max_tokens match.
    if (matches(message, INVALID_REQUEST_PATTERNS.filter(pattern => pattern !== "invalid_request"))) {
      return "invalid_request";
    }
    if (matches(message, CONTEXT_LENGTH_PATTERNS)) return "context_length";
    if (matches(message, RATE_LIMIT_PATTERNS)) return "rate_limit";
    return "invalid_request";
  }
  if (statusCode === 502 || statusCode === 500 || (statusCode >= 500 && statusCode < 600 && statusCode !== 503 && statusCode !== 529)) {
    return "server";
  }
  if (statusCode === 503 || statusCode === 529) return "overloaded";
  if (statusCode >= 400 && statusCode < 500) return "invalid_request";
  return "unknown";
}

/** Classify generic provider failures without retaining or exposing response payloads. */
export function classifyProviderError(
  error: unknown,
  options: ProviderErrorClassifierOptions = {}
): ProviderErrorClassification {
  const statusCode = findStatus(error, options.statusCode);
  const message = combinedMessage(error, options.body);
  const name = errorName(error);

  if (options.cancelled || name === "AbortError") return result("cancelled", statusCode);
  if (options.timedOut || TIMEOUT_ERROR_NAMES.has(name) || matches(message, TIMEOUT_PATTERNS)) {
    return result("timeout", statusCode);
  }

  // A safety refusal is deterministic and must not be hidden by a generic 4xx.
  if (matches(message, CONTENT_POLICY_PATTERNS)) return result("content_filter", statusCode);

  if (statusCode !== undefined) return result(classifyStatus(statusCode, message), statusCode);

  // Keep message-only classification deterministic when providers omit codes.
  if (matches(message, OVERLOAD_PATTERNS)) return result("overloaded", undefined);
  if (matches(message, RATE_LIMIT_PATTERNS)) return result("rate_limit", undefined);
  if (matches(message, CONTEXT_LENGTH_PATTERNS)) return result("context_length", undefined);
  if (matches(message, AUTH_PATTERNS)) return result("authentication", undefined);
  if (matches(message, INVALID_REQUEST_PATTERNS)) return result("invalid_request", undefined);
  if (options.network || NETWORK_ERROR_NAMES.has(name) || matches(message, NETWORK_PATTERNS)) {
    return result("network", undefined);
  }
  if (matches(message, SERVER_PATTERNS)) return result("server", undefined);

  return result("unknown", undefined);
}

export { classifyProviderError as classifyProviderFailure };
