import type { SubpolarSocketEvent } from "./subpolar-client";

export type SubpolarActivityKind = "reasoning" | "tool" | "approval" | "status" | "error" | "terminal";

export type SubpolarActivity = {
  readonly kind: SubpolarActivityKind;
  readonly type: string;
  readonly text: string;
  readonly requestId?: string;
  readonly sequence?: number;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function subpolarEventType(event: SubpolarSocketEvent): string | undefined {
  const inner = record(event.event);
  return typeof inner?.type === "string" ? inner.type : event.type;
}

function payload(event: SubpolarSocketEvent): Record<string, unknown> {
  return record(record(event.event)?.payload) ?? {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function statusText(phase: unknown): string | undefined {
  if (typeof phase !== "string" || phase.length === 0) return undefined;
  const labels: Record<string, string> = {
    "provider.requested": "Model request queued",
    "provider.started": "Model started",
    "provider.completed": "Model completed",
    "provider.failed": "Model failed",
    "provider.usage": "Usage updated",
    "provider.finished": "Model finished",
    "approval.allow": "Tool approval granted",
    "approval.deny": "Tool approval denied",
    "retry.scheduled": "Retry scheduled",
    "fallback.selected": "Fallback model selected",
  };
  return labels[phase] ?? phase.replace(/[._-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function projectSubpolarActivity(event: SubpolarSocketEvent): SubpolarActivity | undefined {
  const type = subpolarEventType(event);
  const data = payload(event);
  const name = text(data.name) ?? "tool";
  let kind: SubpolarActivityKind | undefined;
  let detail: string | undefined;

  if (type === "reasoning.delta" || type === "thinking.delta") {
    kind = "reasoning";
    detail = text(data.text);
  } else if (type === "tool.start" || type === "tool.generating" || type === "tool.complete") {
    kind = "tool";
    detail = type === "tool.complete"
      ? `${name} ${data.is_error === true ? "failed" : "completed"}`
      : type === "tool.generating" ? `${name} is preparing` : `${name} started`;
  } else if (type === "approval.request" || type === "approval.requested") {
    kind = "approval";
    detail = `Approval requested for ${name}`;
  } else if (type === "status.update") {
    kind = "status";
    detail = statusText(data.phase);
  } else if (type === "error") {
    kind = "error";
    detail = text(data.message) ?? text(event.message) ?? text(event.code) ?? "Request failed";
  } else if (type === "terminal" || type === "message.complete") {
    kind = "terminal";
    detail = text(data.outcome) === "completed" || type === "message.complete" ? "Completed" : text(data.outcome) ?? "Finished";
  }

  if (kind === undefined || detail === undefined) return undefined;
  return {
    kind,
    type: type as string,
    text: detail,
    ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
  };
}
