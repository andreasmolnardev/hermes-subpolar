import type { SubpolarSocketEvent } from "./subpolar-client";

export type SubpolarActivityKind = "reasoning" | "tool" | "approval" | "diff" | "status" | "error" | "terminal";

export type SubpolarActivity = {
  readonly kind: SubpolarActivityKind;
  readonly type: string;
  readonly text: string;
  readonly requestId?: string;
  readonly sequence?: number;
  readonly runId?: string;
  readonly parentRunId?: string;
  readonly childRunId?: string;
  readonly depth?: number;
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

function firstText(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = text(data[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function runMetadata(event: SubpolarSocketEvent, data: Record<string, unknown>): Pick<SubpolarActivity, "runId" | "parentRunId" | "childRunId" | "depth"> {
  const eventData = record(event.event) ?? {};
  const runId = firstText(data, "run_id", "runId") ?? firstText(eventData, "run_id", "runId");
  const parentRunId = firstText(data, "parent_run_id", "parentRunId") ?? firstText(eventData, "parent_run_id", "parentRunId");
  const childRunId = firstText(data, "child_run_id", "childRunId") ?? firstText(eventData, "child_run_id", "childRunId");
  const rawDepth = data.depth ?? eventData.depth;
  const depth = typeof rawDepth === "number" && Number.isInteger(rawDepth) && rawDepth > 0
    ? Math.min(rawDepth, 8)
    : parentRunId !== undefined || childRunId !== undefined ? 1 : undefined;
  return {
    ...(runId === undefined ? {} : { runId }),
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(childRunId === undefined ? {} : { childRunId }),
    ...(depth === undefined ? {} : { depth }),
  };
}

function runPrefix(metadata: Pick<SubpolarActivity, "runId" | "parentRunId" | "childRunId">): string {
  if (metadata.childRunId !== undefined || metadata.parentRunId !== undefined) return "Child run: ";
  return "";
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
    "compaction.started": "Context compaction started",
    "compaction.completed": "Context compaction completed",
    "context.compaction_started": "Context compaction started",
    "context.compaction_completed": "Context compaction completed",
    "run.cancelled": "Run cancelled",
    "request.cancelled": "Run cancelled",
  };
  return labels[phase] ?? phase.replace(/[._-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function projectSubpolarActivity(event: SubpolarSocketEvent): SubpolarActivity | undefined {
  const type = subpolarEventType(event);
  const data = payload(event);
  const name = firstText(data, "name", "tool_name", "toolName") ?? "tool";
  const metadata = runMetadata(event, data);
  const prefix = runPrefix(metadata);
  let kind: SubpolarActivityKind | undefined;
  let detail: string | undefined;

  if (type === "reasoning.delta" || type === "thinking.delta" || type === "assistant.thinking_delta" || type === "assistant.reasoning_delta") {
    kind = "reasoning";
    detail = firstText(data, "text", "delta");
  } else if (type === "tool.start" || type === "tool.started" || type === "tool.generating" || type === "tool.updated" || type === "tool.complete" || type === "tool.completed") {
    kind = "tool";
    detail = type === "tool.complete" || type === "tool.completed"
      ? `${name} ${data.is_error === true ? "failed" : "completed"}`
      : type === "tool.generating" || type === "tool.updated" ? `${name} is preparing` : `${name} started`;
  } else if (type === "approval.request" || type === "approval.requested") {
    kind = "approval";
    detail = `Approval requested for ${name}`;
  } else if (type === "workspace.diff.created" || type === "diff.created" || type === "tool.diff") {
    kind = "diff";
    const path = firstText(data, "path", "file", "filename");
    detail = path === undefined ? "Workspace diff created" : `Diff created for ${path}`;
  } else if (type === "status.update") {
    kind = "status";
    detail = statusText(data.phase);
  } else if (type === "run.retrying" || type === "retry.scheduled") {
    kind = "status";
    const attempt = typeof data.attempt === "number" ? ` (attempt ${data.attempt})` : "";
    detail = `Retrying${attempt}`;
  } else if (type === "compaction.started" || type === "compaction.completed" || type === "context.compaction_started" || type === "context.compaction_completed") {
    kind = "status";
    detail = statusText(type);
  } else if (type === "run.cancelled" || type === "request.cancelled") {
    kind = "status";
    detail = "Run cancelled";
  } else if (type === "error") {
    kind = "error";
    detail = text(data.message) ?? text(event.message) ?? text(event.code) ?? "Request failed";
  } else if (type === "terminal" || type === "message.complete" || type === "run.completed") {
    kind = "terminal";
    const outcome = text(data.outcome);
    detail = outcome === "cancelled" ? "Cancelled" : outcome === "completed" || type === "message.complete" || type === "run.completed" ? "Completed" : outcome ?? "Finished";
  }

  if (kind === undefined || detail === undefined) return undefined;
  return {
    kind,
    type: type as string,
    text: `${prefix}${detail}`,
    ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    ...metadata,
  };
}
