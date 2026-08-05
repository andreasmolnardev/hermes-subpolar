import type { HarnessEvent } from "harness";
import type { TransportEvent, WorkspaceSummary } from "data-layer/contracts";

type GatewayUsage = { inputTokens: number; outputTokens: number; totalTokens?: number };

export type GatewayClientRequest = {
  workspaceId: WorkspaceSummary["id"];
  message: string;
};

/** Existing JSON gateway event names, kept local so browser clients need no shared implementation import. */
export type GatewayProtocolEvent =
  | { type: "message.start"; session_id: string; payload: { request_id: string } }
  | { type: "message.complete"; session_id: string; payload: { outcome: "completed" } }
  | { type: "status.update"; session_id: string; payload: { phase: string; usage?: GatewayUsage } }
  | { type: "approval.request"; session_id: string; payload: { call_id: string; name: string } }
  | { type: "tool.start"; session_id: string; payload: { call_id: string; name: string } }
  | { type: "tool.complete"; session_id: string; payload: { call_id: string; is_error: boolean } }
  | { type: "error"; session_id: string; payload: { code: string; message: "Request failed" } };

export type GatewayClientEvent = TransportEvent;
export type GatewayProtocolEventSink = (event: GatewayProtocolEvent) => void | Promise<void>;
export type GatewayClientEventSink = (event: GatewayClientEvent) => void | Promise<void>;

export function mapHarnessEventToGatewayEvent(event: HarnessEvent): GatewayProtocolEvent | undefined {
  switch (event.type) {
    case "request.started":
      return {
        type: "message.start",
        session_id: event.sessionId,
        payload: { request_id: event.requestId }
      };
    case "provider.requested":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: "provider.requested" }
      };
    case "provider.completed":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: {
          phase: "provider.completed",
          usage: {
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            ...(event.usage.totalTokens === undefined ? {} : { totalTokens: event.usage.totalTokens })
          }
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
    case "fallback.selected":
      return {
        type: "status.update",
        session_id: event.sessionId,
        payload: { phase: "fallback.selected" }
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

export function mapHarnessEventToTransportEvent(event: HarnessEvent): TransportEvent | undefined {
  switch (event.type) {
    case "request.started":
      return { type: "session.started", sessionId: event.sessionId };
    case "provider.completed":
      return {
        type: "usage.updated",
        sessionId: event.sessionId,
        usage: {
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          ...(event.usage.totalTokens === undefined ? {} : { totalTokens: event.usage.totalTokens })
        }
      };
    case "tool.called":
      return {
        type: "tool.call",
        sessionId: event.sessionId,
        messageId: event.call.id,
        call: { id: event.call.id, name: event.call.name, arguments: "" }
      };
    case "tool.completed":
      return {
        type: "tool.result",
        sessionId: event.sessionId,
        messageId: event.callId,
        result: { toolCallId: event.callId, content: "", isError: event.result.isError === true }
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
  map: (event: HarnessEvent) => T | undefined
): (event: HarnessEvent) => Promise<void> {
  const terminated = new Set<string>();
  return async event => {
    const key = `${event.requestId}\u0000${event.sessionId}`;
    if (terminated.has(key)) return;
    if (event.type === "terminal") terminated.add(key);
    const mapped = map(event);
    if (mapped !== undefined) await sink(mapped);
  };
}

export function createGatewayEventMapper(sink: GatewayProtocolEventSink): (event: HarnessEvent) => Promise<void> {
  return createDedupeMapper(sink, mapHarnessEventToGatewayEvent);
}

export function createTransportEventMapper(sink: GatewayClientEventSink): (event: HarnessEvent) => Promise<void> {
  return createDedupeMapper(sink, mapHarnessEventToTransportEvent);
}
