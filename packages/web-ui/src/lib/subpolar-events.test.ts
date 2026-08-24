import { expect, test } from "vitest";

import { projectSubpolarActivity } from "./subpolar-events";

test("projects supported reasoning, tool, approval, error, and terminal events", () => {
  const events = [
    { protocol: "subpolar.v1", sequence: 1, event: { type: "reasoning.delta", payload: { text: "thinking" } } },
    { protocol: "subpolar.v1", sequence: 2, event: { type: "tool.start", payload: { name: "search" } } },
    { protocol: "subpolar.v1", sequence: 3, event: { type: "approval.request", payload: { name: "search" } } },
    { protocol: "subpolar.v1", sequence: 4, type: "error", code: "request_failed" },
    { protocol: "subpolar.v1", sequence: 5, event: { type: "message.complete", payload: { outcome: "completed" } } },
  ] as const;

  expect(events.map(event => projectSubpolarActivity(event))).toMatchObject([
    { kind: "reasoning", text: "thinking", sequence: 1 },
    { kind: "tool", text: "search started", sequence: 2 },
    { kind: "approval", text: "Approval requested for search", sequence: 3 },
    { kind: "error", text: "request_failed", sequence: 4 },
    { kind: "terminal", text: "Completed", sequence: 5 },
  ]);
});

test("projects native Pi status updates into stable timeline activity", () => {
  const events = [
    { protocol: "subpolar.v1", requestId: "request-status", sequence: 1, event: { type: "status.update", payload: { phase: "provider.started" } } },
    { protocol: "subpolar.v1", requestId: "request-status", sequence: 2, event: { type: "status.update", payload: { phase: "retry.scheduled" } } },
    { protocol: "subpolar.v1", requestId: "request-status", sequence: 3, event: { type: "status.update", payload: { phase: "unknown.phase" } } },
  ] as const;

  expect(events.map(event => projectSubpolarActivity(event))).toMatchObject([
    { kind: "status", type: "status.update", text: "Model started", sequence: 1 },
    { kind: "status", type: "status.update", text: "Retry scheduled", sequence: 2 },
    { kind: "status", type: "status.update", text: "Unknown Phase", sequence: 3 },
  ]);
});

test("projects approval resolution status into the timeline", () => {
  expect(projectSubpolarActivity({
    protocol: "subpolar.v1",
    requestId: "request-approval",
    sequence: 4,
    event: { type: "status.update", payload: { phase: "approval.allow" } },
  })).toMatchObject({ kind: "status", text: "Tool approval granted", sequence: 4 });
});

test("projects native Pi child-run events with lineage and nested depth", () => {
  const activity = projectSubpolarActivity({
    protocol: "subpolar.v1",
    requestId: "request-child",
    sequence: 7,
    event: {
      type: "tool.started",
      payload: {
        run_id: "child-run",
        parent_run_id: "parent-run",
        name: "read",
        depth: 2,
      },
    },
  });

  expect(activity).toMatchObject({
    kind: "tool",
    text: "Child run: read started",
    runId: "child-run",
    parentRunId: "parent-run",
    depth: 2,
  });
});

test("projects Pi diff, retry, compaction, and cancellation events", () => {
  const events = [
    { protocol: "subpolar.v1", event: { type: "workspace.diff.created", payload: { path: "src/app.ts" } } },
    { protocol: "subpolar.v1", event: { type: "run.retrying", payload: { attempt: 2 } } },
    { protocol: "subpolar.v1", event: { type: "compaction.completed", payload: {} } },
    { protocol: "subpolar.v1", event: { type: "run.cancelled", payload: {} } },
  ] as const;

  expect(events.map(event => projectSubpolarActivity(event))).toMatchObject([
    { kind: "diff", text: "Diff created for src/app.ts" },
    { kind: "status", text: "Retrying (attempt 2)" },
    { kind: "status", text: "Context compaction completed" },
    { kind: "status", text: "Run cancelled" },
  ]);
});

test("projects a cancelled terminal outcome without losing the terminal state", () => {
  expect(projectSubpolarActivity({
    protocol: "subpolar.v1",
    event: { type: "terminal", payload: { outcome: "cancelled" } },
  })).toMatchObject({ kind: "terminal", text: "Cancelled" });
});
