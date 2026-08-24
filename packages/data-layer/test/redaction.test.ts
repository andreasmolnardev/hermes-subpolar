import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { InMemorySessionRepository, PERSISTENCE_SCHEMA_VERSION, SQLiteSessionRepository } from "../src/index.ts";
import type { SessionRecord, SessionRepository } from "../src/contracts.ts";

const runtime = { runtimeVersion: "redaction-test", schemaVersion: PERSISTENCE_SCHEMA_VERSION } as const;

function session(): SessionRecord {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    id: "session-1",
    workspaceId: "workspace-1",
    status: "active",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    runtime,
    metadata: { apiKey: "session-secret", visible: "kept" },
  };
}

async function assertDefaultRedaction(repository: SessionRepository): Promise<void> {
  await repository.createSession(session());
  await repository.appendMessages("session-1", [
    {
      role: "assistant",
      content: "visible answer",
      apiContent: "provider-secret-payload",
      reasoning: "private chain of thought",
      metadata: { apiKey: "message-secret", error: { stack: "private stack" }, visible: true },
      context: { providerPayload: "raw-provider", credentials: { token: "context-secret" }, visible: "kept" },
      toolCalls: [{ id: "call-1", name: "shell", arguments: { command: "cat secret.txt", token: "tool-secret" } }],
      createdAt: "2026-08-24T00:00:01.000Z",
    },
    {
      role: "tool",
      content: "tool output secret",
      toolCallId: "call-1",
      toolResult: { toolCallId: "call-1", content: "tool output secret", isError: false, toolName: "shell" },
      createdAt: "2026-08-24T00:00:02.000Z",
    },
    {
      role: "assistant",
      content: "upstream error: provider-secret",
      finishReason: "error",
      createdAt: "2026-08-24T00:00:03.000Z",
    },
  ]);
  await repository.saveCheckpoint({
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    id: "checkpoint-1",
    sessionId: "session-1",
    messageSequence: 3,
    createdAt: "2026-08-24T00:00:04.000Z",
    reason: "turn",
    runtime,
    snapshot: {
      providerPayload: "checkpoint-provider-secret",
      arguments: { token: "checkpoint-tool-secret" },
      error: { details: "checkpoint-error-secret" },
      visible: "kept",
    },
  });
  await repository.claimIdempotency("request-1", "fingerprint-1");
  await repository.completeIdempotency("request-1", "fingerprint-1", {
    providerResponse: "idempotency-provider-secret",
    credentials: { apiKey: "idempotency-secret" },
    error: "idempotency-error-secret",
    visible: "kept",
  });
  await repository.savePendingApproval({
    requestId: "approval-1",
    sessionId: "session-1",
    callId: "call-approval",
    toolName: "write",
    arguments: { path: "file.txt", token: "approval-secret" },
    status: "pending",
    createdAt: "2026-08-24T00:00:05.000Z",
    updatedAt: "2026-08-24T00:00:05.000Z",
  });

  const storedSession = await repository.getSession("session-1");
  expect(storedSession?.metadata).toEqual({ visible: "kept" });
  const messages = await repository.listMessages("session-1");
  expect(messages[0]).not.toHaveProperty("apiContent");
  expect(messages[0]).not.toHaveProperty("reasoning");
  expect(messages[0]?.metadata).toEqual({ visible: true });
  expect(messages[0]?.context).toEqual({ visible: "kept" });
  expect(messages[0]?.toolCalls?.[0]?.arguments).toEqual({ redacted: true });
  expect(messages[1]?.content).toBe("[tool output redacted]");
  expect(messages[1]?.toolResult?.content).toBe("[tool output redacted]");
  expect(messages[2]?.content).toBe("[error details redacted]");
  expect((await repository.listToolCalls("session-1"))[0]?.arguments).toEqual({ redacted: true });
  expect((await repository.listToolResults("session-1"))[0]?.content).toBe("[tool output redacted]");
  expect((await repository.getCheckpoint("session-1", "checkpoint-1"))?.snapshot).toEqual({ visible: "kept" });
  expect((await repository.getIdempotency("request-1"))?.terminalPayload).toEqual({ visible: "kept" });
  expect((await repository.getPendingApproval("approval-1"))?.arguments).toEqual({ path: "file.txt" });

  const serialized = JSON.stringify({ storedSession, messages, checkpoint: await repository.getCheckpoint("session-1", "checkpoint-1"), idempotency: await repository.getIdempotency("request-1"), approval: await repository.getPendingApproval("approval-1") });
  for (const secret of ["provider-secret", "tool-secret", "context-secret", "private chain", "checkpoint-error", "idempotency-secret", "approval-secret"]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("persistence redaction policy", () => {
  test("in-memory persistence redacts provider, tool, reasoning, credential, and error details", async () => {
    await assertDefaultRedaction(new InMemorySessionRepository());
  });

  test("SQLite persistence redacts stored rows and does not leave secrets in the database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "subpolar-redaction-"));
    const path = join(directory, "state.db");
    const repository = new SQLiteSessionRepository(path);
    try {
      await assertDefaultRedaction(repository);
      const database = new Database(path, { readonly: true });
      try {
        const rows = database.query<{ value: string }, []>(
          "SELECT value FROM (SELECT content_json AS value FROM messages UNION ALL SELECT COALESCE(api_content_json, '') FROM messages UNION ALL SELECT arguments_json FROM tool_calls UNION ALL SELECT content_json FROM tool_results UNION ALL SELECT snapshot_json FROM checkpoints UNION ALL SELECT COALESCE(terminal_payload_json, '') FROM idempotency_records UNION ALL SELECT arguments_json FROM pending_approvals)",
        ).all();
        const raw = JSON.stringify(rows);
        for (const secret of ["provider-secret", "tool-secret", "context-secret", "checkpoint-provider", "idempotency-secret", "approval-secret"]) {
          expect(raw).not.toContain(secret);
        }
      } finally {
        database.close();
      }
    } finally {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("in-memory retention honors age and record-count policy like SQLite", async () => {
    const repository = new InMemorySessionRepository({
      idempotencyRetentionMs: 60 * 60 * 1000,
      approvalRetentionMs: 60 * 60 * 1000,
      maxIdempotencyRecords: 1,
      maxApprovalRecords: 1,
    });
    await repository.createSession(session());
    await repository.claimIdempotency("request-old", "fingerprint-old");
    await repository.claimIdempotency("request-new", "fingerprint-new");
    const now = new Date().toISOString();
    await repository.savePendingApproval({ requestId: "approval-old", sessionId: "session-1", callId: "old", toolName: "write", arguments: {}, status: "pending", createdAt: now, updatedAt: now });
    await repository.savePendingApproval({ requestId: "approval-new", sessionId: "session-1", callId: "new", toolName: "write", arguments: {}, status: "pending", createdAt: now, updatedAt: now });
    const retained = await repository.prune(now);
    expect(retained).toEqual({ idempotencyRecords: 1, approvalRecords: 1 });
    expect(await repository.getIdempotency("request-old")).toBeNull();
    expect(await repository.getPendingApproval("approval-old")).toBeNull();
  });
});
