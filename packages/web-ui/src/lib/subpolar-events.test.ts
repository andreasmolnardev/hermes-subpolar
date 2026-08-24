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
