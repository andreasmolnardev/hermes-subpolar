import type {
  HarnessEvent,
  HarnessToolCall,
  HarnessToolResult,
  HarnessUsage,
  HarnessFinishReason,
  HarnessProviderMetadata
} from "harness";
import type { TransportEvent, WorkspaceSummary } from "data-layer/contracts";

type GatewayUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

export type GatewayClientRequest = {
  workspaceId: WorkspaceSummary["id"];
  message: string;
};

/** Existing JSON gateway event names, kept local so browser clients need no shared implementation import. */
export type GatewayProtocolEvent =
  | { type: "message.start"; session_id: string; payload: { request_id: string } }
  | { type: "message.delta"; session_id: string; payload: { text: string } }
  | { type: "message.complete"; session_id: string; payload: { outcome: "completed" } }
  | { type: "reasoning.delta"; session_id: string; payload: { text: string } }
  | { type: "status.update"; session_id: string; payload: {
    phase: string;
    usage?: GatewayUsage;
    finish_reason?: HarnessFinishReason;
    reasoning?: string;
    provider_request_id?: string;
    metadata?: HarnessProviderMetadata;
  } }
  | { type: "approval.request"; session_id: string; payload: { call_id: string; name: string } }
  | { type: "tool.start"; session_id: string; payload: { call_id: string; name: string } }
  | { type: "tool.generating"; session_id: string; payload: { call_id: string; name: string; arguments?: string } }
  | { type: "tool.complete"; session_id: string; payload: { call_id: string; is_error: boolean } }
  | { type: "error"; session_id: string; payload: { code: string; message: "Request failed" } };

export type GatewayClientEvent = TransportEvent;
export type GatewayProtocolEventSink = (event: GatewayProtocolEvent) => void | Promise<void>;
export type GatewayClientEventSink = (event: GatewayClientEvent) => void | Promise<void>;

export type GatewayProjectionBase = {
  readonly id: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly at: number;
};

/** Provider stream events are promoted to the gateway stream without changing harness contracts. */
export type GatewayProviderProjectionEvent = GatewayProjectionBase & (
  | { readonly type: "provider.started"; readonly providerIndex: number }
  | { readonly type: "provider.failed"; readonly providerIndex: number; readonly category?: string }
  | { readonly type: "provider.text.delta"; readonly text: string }
  | { readonly type: "provider.reasoning.delta"; readonly text: string }
  | { readonly type: "provider.tool-call.delta"; readonly callId?: string; readonly name?: string; readonly arguments?: string }
  | { readonly type: "provider.tool-call"; readonly call: HarnessToolCall }
  | { readonly type: "provider.tool-result"; readonly callId: string; readonly result: HarnessToolResult }
  | { readonly type: "provider.usage"; readonly usage: HarnessUsage; readonly metadata?: HarnessProviderMetadata }
  | {
    readonly type: "provider.finished";
    readonly usage?: HarnessUsage;
    readonly finishReason?: HarnessFinishReason;
    readonly metadata?: HarnessProviderMetadata;
    readonly providerRequestId?: string;
  }
);

export type GatewayDeltaProjectionEvent = GatewayProjectionBase & (
  | { readonly type: "message.delta"; readonly text: string }
  | { readonly type: "reasoning.delta"; readonly text: string }
);

export type GatewayEventProjectionInput = HarnessEvent | GatewayProviderProjectionEvent | GatewayDeltaProjectionEvent;

function usage(value: HarnessUsage): GatewayUsage {
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    ...(value.totalTokens === undefined ? {} : { totalTokens: value.totalTokens }),
    ...(value.cachedInputTokens === undefined ? {} : { cachedInputTokens: value.cachedInputTokens }),
    ...(value.reasoningTokens === undefined ? {} : { reasoningTokens: value.reasoningTokens }),
    ...(value.cacheCreationInputTokens === undefined ? {} : { cacheCreationInputTokens: value.cacheCreationInputTokens }),
    ...(value.cacheReadInputTokens === undefined ? {} : { cacheReadInputTokens: value.cacheReadInputTokens })
  };
}

function transportFinishReason(
  value: HarnessFinishReason
): "stop" | "length" | "tool_calls" | "content_filter" | "error" | undefined {
  if (value === "unknown" || value === "cancelled") return value === "cancelled" ? "error" : undefined;
  return value === "tool_call" ? "tool_calls" : value;
}

function generatingEvent(
  event: GatewayProjectionBase,
  callId: string | undefined,
  name: string | undefined,
  argumentsText?: string
): GatewayProtocolEvent | undefined {
  if (callId === undefined || name === undefined) return undefined;
  return {
    type: "tool.generating",
    session_id: event.sessionId,
    payload: {
      call_id: callId,
      name,
      ...(argumentsText === undefined ? {} : { arguments: argumentsText })
    }
  };
}

export function mapHarnessEventToGatewayEvent(event: GatewayEventProjectionInput): GatewayProtocolEvent | undefined {
  switch (event.type) {
    case "request.started":
      return {
        type: "message.start",
        session_id: event.sessionId,
        payload: { request_id: event.requestId }
      };
    case "provider.requested":
    case "provider.started":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: event.type }
      };
    case "provider.completed":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: {
          phase: "provider.completed",
          usage: usage(event.usage),
          ...(event.finishReason === undefined ? {} : { finish_reason: event.finishReason }),
          ...(event.reasoning === undefined ? {} : { reasoning: event.reasoning }),
          ...(event.providerRequestId === undefined ? {} : { provider_request_id: event.providerRequestId }),
          ...(event.metadata === undefined ? {} : { metadata: event.metadata })
        }
      };
    case "provider.failed":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: "provider.failed" }
      };
    case "provider.text.delta":
    case "message.delta":
      return { type: "message.delta", session_id: event.sessionId, payload: { text: event.text } };
    case "provider.reasoning.delta":
    case "reasoning.delta":
      return { type: "reasoning.delta", session_id: event.sessionId, payload: { text: event.text } };
    case "provider.tool-call.delta":
      return generatingEvent(event, event.callId, event.name, event.arguments);
    case "provider.tool-call":
      return generatingEvent(event, event.call.id, event.call.name, event.call.arguments);
    case "provider.tool-result":
      return {
        type: "tool.complete",
        session_id: event.sessionId,
        payload: { call_id: event.callId, is_error: event.result.isError === true }
      };
    case "provider.usage":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: {
          phase: "provider.usage",
          usage: usage(event.usage),
          ...(event.metadata === undefined ? {} : { metadata: event.metadata })
        }
      };
    case "provider.finished":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: {
          phase: "provider.finished",
          ...(event.usage === undefined ? {} : { usage: usage(event.usage) }),
          ...(event.finishReason === undefined ? {} : { finish_reason: event.finishReason }),
          ...(event.providerRequestId === undefined ? {} : { provider_request_id: event.providerRequestId }),
          ...(event.metadata === undefined ? {} : { metadata: event.metadata })
        }
      };
    case "approval.requested":
      return {
        type: "approval.request",
        session_id: event.sessionId,
        payload: { call_id: event.call.id, name: event.call.name }
      };
    case "approval.resolved":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: `approval.${event.decision}` }
      };
    case "tool.called":
      return {
        type: "tool.start",
        session_id: event.sessionId,
        payload: { call_id: event.call.id, name: event.call.name }
      };
    case "tool.completed":
      return {
        type: "tool.complete",
        session_id: event.sessionId,
        payload: { call_id: event.callId, is_error: event.result.isError === true }
      };
    case "retry.scheduled":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: "retry.scheduled" }
      };
    case "terminal":
      return event.outcome === "completed"
        ? { type: "message.complete", session_id: event.sessionId, payload: { outcome: "completed" } }
        : {
          type: "error",
          session_id: event.sessionId,
          payload: { code: `harness.${event.outcome}`, message: "Request failed" }
        };
  }
}

function transportContent(value: HarnessToolResult["content"]): string {
  if (typeof value === "string") return value;
  return value.map(part => {
    if (part.type === "text" || part.type === "reasoning") return part.text;
    if (part.type === "tool-call") return part.arguments;
    if (part.type === "tool-result") return transportContent(part.content);
    return "";
  }).join("");
}

export function mapHarnessEventToTransportEvent(event: GatewayEventProjectionInput): TransportEvent | undefined {
  switch (event.type) {
    case "request.started":
      return { type: "session.started", sessionId: event.sessionId };
    case "provider.completed":
      {
        const finishReason = event.finishReason === undefined
          ? undefined
          : transportFinishReason(event.finishReason);
        return {
          type: "usage.updated",
          sessionId: event.sessionId,
          usage: usage(event.usage),
          ...(event.reasoning === undefined ? {} : { reasoning: event.reasoning }),
          ...(finishReason === undefined ? {} : { finishReason }),
          ...(event.metadata === undefined ? {} : { metadata: event.metadata })
        };
      }
    case "provider.usage":
      return {
        type: "usage.updated",
        sessionId: event.sessionId,
        usage: usage(event.usage),
        ...(event.metadata === undefined ? {} : { metadata: event.metadata })
      };
    case "provider.text.delta":
    case "message.delta":
      return { type: "message.delta", sessionId: event.sessionId, delta: event.text };
    case "tool.called":
      return {
        type: "tool.call",
        sessionId: event.sessionId,
        messageId: event.call.id,
        call: { id: event.call.id, name: event.call.name, arguments: event.call.arguments }
      };
    case "tool.completed":
      return {
        type: "tool.result",
        sessionId: event.sessionId,
        messageId: event.callId,
        result: {
          toolCallId: event.callId,
          content: transportContent(event.result.content),
          isError: event.result.isError === true
        }
      };
    case "terminal":
      return event.outcome === "completed"
        ? undefined
        : { type: "error", code: `harness.${event.outcome}`, message: "Request failed" };
    default:
      return undefined;
  }
}

function createDedupeMapper<T>(
  sink: (event: T) => void | Promise<void>,
  map: (event: GatewayEventProjectionInput) => T | undefined
): (event: GatewayEventProjectionInput) => Promise<void> {
  const terminated = new Set<string>();
  return async event => {
    const key = `${event.requestId}\u0000${event.sessionId}`;
    if (terminated.has(key)) return;
    if (event.type === "terminal") terminated.add(key);
    const mapped = map(event);
    if (mapped !== undefined) await sink(mapped);
  };
}

export function createGatewayEventMapper(
  sink: GatewayProtocolEventSink
): (event: GatewayEventProjectionInput) => Promise<void> {
  return createDedupeMapper(sink, mapHarnessEventToGatewayEvent);
}

export function createTransportEventMapper(
  sink: GatewayClientEventSink
): (event: GatewayEventProjectionInput) => Promise<void> {
  return createDedupeMapper(sink, mapHarnessEventToTransportEvent);
}
