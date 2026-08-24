import type {
  CheckpointRecord,
  ContentPart,
  JsonObject,
  JsonValue,
  PendingApprovalRecord,
  SessionMessageDraft,
  ToolCall,
  ToolResult,
} from "./contracts.js";

/**
 * Controls which runtime details are allowed to survive in session storage.
 * Operational approval arguments are retained until the approval retention
 * window expires; they are still scrubbed for credential-shaped fields.
 */
export type PersistenceRedactionPolicy = Readonly<{
  retainProviderPayloads: boolean;
  retainCredentials: boolean;
  retainToolArguments: boolean;
  retainToolOutput: boolean;
  retainReasoning: boolean;
  retainErrorDetails: boolean;
  retainApprovalArguments: boolean;
}>;

export type PersistenceRedactionPolicyInput = Partial<PersistenceRedactionPolicy>;

export const DEFAULT_PERSISTENCE_REDACTION_POLICY: PersistenceRedactionPolicy = {
  retainProviderPayloads: false,
  retainCredentials: false,
  retainToolArguments: false,
  retainToolOutput: false,
  retainReasoning: false,
  retainErrorDetails: false,
  retainApprovalArguments: true,
};

export function normalizePersistenceRedactionPolicy(
  input: PersistenceRedactionPolicyInput = {},
): PersistenceRedactionPolicy {
  return { ...DEFAULT_PERSISTENCE_REDACTION_POLICY, ...input };
}

const CREDENTIAL_KEYS = new Set([
  "access_token", "accesstoken", "api_key", "apikey", "authorization", "client_secret",
  "clientsecret", "code_verifier", "codeverifier", "credentials", "custom_headers",
  "customheaders", "env", "environment", "environment_variables", "environmentvariables",
  "headers", "password", "passphrase", "private_key", "privatekey", "refresh_token",
  "refreshtoken", "secret", "secrets", "static_headers", "staticheaders", "token",
]);

const ERROR_KEYS = new Set(["cause", "error", "error_details", "errordetails", "exception", "stack"]);
const PROVIDER_KEYS = new Set(["api_content", "apicontent", "provider_payload", "providerpayload", "provider_request", "providerrequest", "provider_response", "providerresponse", "raw_request", "rawrequest", "raw_response", "rawresponse"]);
const TOOL_DATA_KEYS = new Set(["arguments", "output", "tool_arguments", "toolarguments", "tool_output", "tooloutput", "tool_result", "toolresult"]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll("-", "_");
}

function redactText(value: string, policy: PersistenceRedactionPolicy): string {
  if (policy.retainCredentials) return value;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|ghp|github_pat|xox[baprs]-|AKIA)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/((?:access[_-]?token|api[_-]?key|client[_-]?secret|password|private[_-]?key|refresh[_-]?token|secret|token)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]");
}

/** Recursively removes credential/error fields from persisted JSON objects. */
export function redactJsonValue(
  value: unknown,
  policy: PersistenceRedactionPolicy,
): JsonValue {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (typeof value === "string") return redactText(value, policy);
  if (Array.isArray(value)) return value.map((item) => redactJsonValue(item, policy));
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return null;

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (!policy.retainCredentials && CREDENTIAL_KEYS.has(normalized)) continue;
    if (!policy.retainErrorDetails && ERROR_KEYS.has(normalized)) continue;
    if (!policy.retainProviderPayloads && PROVIDER_KEYS.has(normalized)) continue;
    if (!policy.retainToolArguments && TOOL_DATA_KEYS.has(normalized)) continue;
    result[key] = redactJsonValue(item, policy);
  }
  return result;
}

export function redactJsonRecord(
  value: Record<string, unknown>,
  policy: PersistenceRedactionPolicy,
): Record<string, unknown> {
  return redactJsonValue(value as JsonObject, policy) as Record<string, unknown>;
}

function redactedToolArguments(argumentsValue: ToolCall["arguments"]): ToolCall["arguments"] {
  return typeof argumentsValue === "string" ? "[tool arguments redacted]" : { redacted: true };
}

function redactContent(
  content: SessionMessageDraft["content"],
  policy: PersistenceRedactionPolicy,
  toolOutput = false,
): SessionMessageDraft["content"] {
  if (toolOutput && !policy.retainToolOutput) return "[tool output redacted]";
  if (typeof content === "string") return redactText(content, policy);
  return content.flatMap((part): readonly ContentPart[] => {
    if (part.type === "reasoning" && !policy.retainReasoning) return [];
    if (part.type === "tool-call") {
      return [{
        ...part,
        arguments: policy.retainToolArguments ? part.arguments : "[tool arguments redacted]",
      }];
    }
    if (part.type === "tool-result") {
      return [{
        ...part,
        content: redactContent(part.content, policy, true),
      }];
    }
    if (part.type === "text") return [{ ...part, text: redactText(part.text, policy) }];
    return [part];
  });
}

function redactToolCall(call: ToolCall, policy: PersistenceRedactionPolicy): ToolCall {
  return {
    ...call,
    arguments: policy.retainToolArguments
      ? (redactJsonValue(
        typeof call.arguments === "string" ? call.arguments : call.arguments,
        policy,
      ) as ToolCall["arguments"])
      : redactedToolArguments(call.arguments),
  };
}

function redactToolResult(result: ToolResult, policy: PersistenceRedactionPolicy): ToolResult {
  return {
    ...result,
    content: redactContent(result.content, policy, true),
  };
}

/** Applies the policy before a message enters either repository backend. */
export function redactSessionMessage(
  draft: SessionMessageDraft,
  policy: PersistenceRedactionPolicy,
): SessionMessageDraft {
  const result: SessionMessageDraft = {
    ...draft,
    content: redactContent(draft.content, policy, draft.role === "tool"),
  };
  if (policy.retainProviderPayloads && draft.apiContent !== undefined) {
    result.apiContent = redactContent(draft.apiContent, policy);
  } else {
    delete result.apiContent;
  }
  if (draft.displayMetadata !== undefined) {
    result.displayMetadata = redactJsonValue(draft.displayMetadata, policy) as JsonObject;
  }
  if (draft.context !== undefined) result.context = redactJsonValue(draft.context, policy);
  if (draft.metadata !== undefined) result.metadata = redactJsonValue(draft.metadata, policy) as JsonObject;
  if (draft.toolCalls !== undefined) result.toolCalls = draft.toolCalls.map((call) => redactToolCall(call, policy));
  if (draft.toolResult !== undefined) result.toolResult = redactToolResult(draft.toolResult, policy);
  if (!policy.retainReasoning) delete result.reasoning;
  else if (draft.reasoning !== undefined) result.reasoning = redactText(draft.reasoning, policy);
  if (draft.finishReason === "error" && !policy.retainErrorDetails) result.content = "[error details redacted]";
  return result;
}

export function redactCheckpoint(
  checkpoint: CheckpointRecord,
  policy: PersistenceRedactionPolicy,
): CheckpointRecord {
  return { ...checkpoint, snapshot: redactJsonValue(checkpoint.snapshot, policy) as JsonObject };
}

export function redactPendingApproval(
  approval: PendingApprovalRecord,
  policy: PersistenceRedactionPolicy,
): PendingApprovalRecord {
  return {
    ...approval,
    arguments: (policy.retainApprovalArguments
      ? redactJsonValue(approval.arguments, policy)
      : { redacted: true }) as JsonObject,
  };
}

export function redactErrorMessage(
  error: string,
  policy: PersistenceRedactionPolicy = DEFAULT_PERSISTENCE_REDACTION_POLICY,
): string {
  if (!policy.retainErrorDetails) {
    if (error === "Server restarted before the automation run completed") return error;
    return "Operation failed";
  }
  return redactText(error, policy);
}
