import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { SQLiteSessionRepository, UnsupportedSchemaError } from "../src/sqlite.js";
import type { SessionRecord, SessionMessageDraft } from "../src/contracts.js";

function homePath(): { home: string; database: string } {
  const home = mkdtempSync(join(tmpdir(), "hermes-home-"));
  return { home, database: join(home, "state.db") };
}

function session(id = "session-1"): SessionRecord {
  return {
    schemaVersion: 1,
    id,
    workspaceId: "workspace-1",
    status: "active",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    runtime: { runtimeVersion: "test", schemaVersion: 1 },
  };
}

function message(content: SessionMessageDraft["content"], extra: Partial<SessionMessageDraft> = {}): SessionMessageDraft {
  return { role: "user", content, createdAt: "2026-08-05T00:00:01.000Z", ...extra };
}

async function withRepo<T>(operation: (repo: SQLiteSessionRepository, database: string) => Promise<T>): Promise<T> {
  const paths = homePath();
  const repo = new SQLiteSessionRepository(paths.database);
  try {
    return await operation(repo, paths.database);
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
}

test("SQLite repository orders messages and correlates tools", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    await repo.appendMessages("session-1", [
      message([{ type: "text", text: "structured" }], {
        role: "assistant",
        toolCalls: [{ id: "call-1", name: "lookup", arguments: { q: "hermes" } }],
      }),
      message("result", { role: "tool", toolCallId: "call-1", toolResult: {
        toolCallId: "call-1", content: "result", isError: false, toolName: "lookup",
      } }),
      message("done"),
    ]);
    const messages = await repo.listMessages("session-1");
    expect(messages.map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
    expect(messages[0]?.content).toEqual([{ type: "text", text: "structured" }]);
    expect((await repo.listToolCalls("session-1"))[0]?.id).toBe("call-1");
    expect((await repo.listToolResults("session-1"))[0]?.toolCallId).toBe("call-1");
  });
});

test("SQLite round-trips structured content and every message sidecar exactly", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    const message: SessionMessageDraft = {
      role: "assistant",
      content: [
        { type: "text", text: "visible" },
        { type: "image_url", imageUrl: { url: "https://example.test/image", detail: "high" } },
      ],
      apiContent: [{ type: "text", text: "provider" }],
      displayKind: "hidden",
      displayMetadata: { reason: "retry", count: 2 },
      synthetic: true,
      context: { source: "gateway", values: [1, true, null] },
      reasoning: "provider reasoning",
      metadata: { provider: "recorded", cache: "hit" },
      usage: {
        inputTokens: 8,
        outputTokens: 3,
        totalTokens: 11,
        cachedInputTokens: 2,
        reasoningTokens: 1,
        cacheCreationInputTokens: 4,
        cacheReadInputTokens: 5,
      },
      createdAt: "2026-08-05T00:00:01.000Z",
    };

    const result = await repo.appendMessages("session-1", [message]);
    (message.content[0] as { type: "text"; text: string }).text = "changed caller content";
    (result.messages[0]!.apiContent![0] as { type: "text"; text: string }).text = "changed returned API content";
    expect(await repo.listMessages("session-1")).toEqual([{
      schemaVersion: 1,
      id: "session-1:message:0",
      sessionId: "session-1",
      sequence: 0,
      role: "assistant",
      content: [
        { type: "text", text: "visible" },
        { type: "image_url", imageUrl: { url: "https://example.test/image", detail: "high" } },
      ],
      apiContent: message.apiContent,
      displayKind: "hidden",
      displayMetadata: message.displayMetadata,
      synthetic: true,
      context: message.context,
      reasoning: message.reasoning,
      metadata: message.metadata,
      usage: message.usage,
      createdAt: message.createdAt,
    }]);
  });
});

test("SQLite transaction rolls back all writes", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    await expect(repo.transaction(async (transaction) => {
      await transaction.appendMessages("session-1", [message("not committed")]);
      await transaction.claimIdempotency("rollback-request", "rollback-fingerprint");
      await transaction.savePendingApproval({
        requestId: "rollback-approval", sessionId: "session-1", callId: "rollback-call",
        toolName: "write", arguments: {}, status: "pending",
        createdAt: "2026-08-05T00:00:01.000Z", updatedAt: "2026-08-05T00:00:01.000Z",
      });
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await repo.listMessages("session-1")).toEqual([]);
    expect(await repo.getIdempotency("rollback-request")).toBeNull();
    expect(await repo.getPendingApproval("rollback-approval")).toBeNull();
  });
});

test("SQLite commitTurn atomically persists recovery metadata and usage", async () => {
  await withRepo(async (repo, database) => {
    await repo.createSession(session());
    await repo.commitTurn({
      sessionId: "session-1",
      messages: [{
        role: "assistant",
        content: "run",
        createdAt: "2026-08-05T00:00:01.000Z",
        toolCalls: [{ id: "call-1", name: "terminal", arguments: { command: "true" } }],
      }],
      usage: {
        schemaVersion: 1,
        sessionId: "session-1",
        recordedAt: "2026-08-05T00:00:02.000Z",
        usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
      },
      checkpoint: {
        schemaVersion: 1,
        id: "checkpoint-1",
        sessionId: "session-1",
        messageSequence: 0,
        createdAt: "2026-08-05T00:00:02.000Z",
        reason: "before-tool",
        runtime: { runtimeVersion: "test", schemaVersion: 1 },
        snapshot: { pending: "call-1" },
      },
      migrationState: {
        schemaVersion: 1,
        sessionId: "session-1",
        updatedAt: "2026-08-05T00:00:02.000Z",
        runtime: { runtimeVersion: "test", schemaVersion: 1 },
        recovery: {
          turnId: "turn-1",
          status: "interrupted",
          startedAt: "2026-08-05T00:00:01.000Z",
          updatedAt: "2026-08-05T00:00:02.000Z",
          checkpointId: "checkpoint-1",
          pendingToolCallIds: ["call-1"],
        },
      },
    });

    expect((await repo.listUsage("session-1"))[0]?.usage).toEqual({
      inputTokens: 4, outputTokens: 1, totalTokens: 5,
    });
    expect((await repo.getCheckpoint("session-1", "checkpoint-1"))?.formatVersion).toBe(1);
    expect((await repo.getMigrationState("session-1"))?.recovery?.pendingToolCallIds).toEqual(["call-1"]);

    const restarted = new SQLiteSessionRepository(database);
    try {
      expect((await restarted.listUsage("session-1"))[0]?.usage.totalTokens).toBe(5);
      expect((await restarted.getCheckpoint("session-1", "checkpoint-1"))?.runtime.runtimeVersion)
        .toBe("test");
      const migration = await restarted.getMigrationState("session-1");
      expect(migration?.recovery?.status).toBe("interrupted");
      expect((await restarted.listMessages("session-1"))[0]?.sequence).toBe(0);

      await restarted.appendMessages("session-1", [
        message("tool output", {
          role: "tool",
          toolCallId: "call-1",
          toolResult: { toolCallId: "call-1", content: "tool output", isError: false },
        }),
        message("resumed answer", { role: "assistant", finishReason: "stop" }),
      ], { expectedNextSequence: 1 });
      await restarted.saveMigrationState({
        ...migration!,
        updatedAt: "2026-08-05T00:00:03.000Z",
        recovery: {
          ...migration!.recovery!,
          status: "recoverable",
          pendingToolCallIds: [],
          updatedAt: "2026-08-05T00:00:03.000Z",
        },
      });

      expect((await restarted.listMessages("session-1")).map(({ sequence, content }) => ({ sequence, content })))
        .toEqual([
          { sequence: 0, content: "run" },
          { sequence: 1, content: "tool output" },
          { sequence: 2, content: "resumed answer" },
        ]);
      expect((await restarted.listToolResults("session-1"))[0]?.toolCallId).toBe("call-1");
      expect((await restarted.getMigrationState("session-1"))?.recovery?.status).toBe("recoverable");
    } finally {
      restarted.close();
    }
  });
});

test("SQLite rolls back the complete turn write set on a failed recovery check", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    await expect(repo.commitTurn({
      sessionId: "session-1",
      messages: [{
        role: "assistant",
        content: "pending",
        createdAt: "2026-08-05T00:00:01.000Z",
        toolCalls: [{ id: "call-1", name: "terminal", arguments: "{}" }],
      }],
      usage: {
        schemaVersion: 1,
        sessionId: "session-1",
        recordedAt: "2026-08-05T00:00:02.000Z",
        usage: { inputTokens: 1, outputTokens: 1 },
      },
      checkpoint: {
        schemaVersion: 1,
        id: "checkpoint-1",
        sessionId: "session-1",
        messageSequence: 0,
        createdAt: "2026-08-05T00:00:02.000Z",
        reason: "before-tool",
        runtime: { runtimeVersion: "test", schemaVersion: 1 },
        snapshot: { pending: true },
      },
      migrationState: {
        schemaVersion: 1,
        sessionId: "session-1",
        updatedAt: "2026-08-05T00:00:02.000Z",
        runtime: { runtimeVersion: "test", schemaVersion: 1 },
        recovery: {
          turnId: "turn-1",
          status: "interrupted",
          startedAt: "2026-08-05T00:00:01.000Z",
          updatedAt: "2026-08-05T00:00:02.000Z",
          pendingToolCallIds: ["missing"],
        },
      },
    })).rejects.toThrow("unknown tool call");

    expect(await repo.listMessages("session-1")).toEqual([]);
    expect(await repo.listUsage("session-1")).toEqual([]);
    expect(await repo.listCheckpoints("session-1")).toEqual([]);
    expect(await repo.getMigrationState("session-1")).toBeNull();
  });
});

test("SQLite WAL readers see committed snapshots during concurrent write", async () => {
  await withRepo(async (writer, database) => {
    const reader = new SQLiteSessionRepository(database);
    try {
      await writer.createSession(session());
      let release!: () => void;
      const paused = new Promise<void>((resolve) => { release = resolve; });
      const writing = writer.transaction(async (transaction) => {
        await transaction.appendMessages("session-1", [message("pending")]);
        await paused;
      });
      expect(await reader.listMessages("session-1")).toEqual([]);
      release();
      await writing;
      expect((await reader.listMessages("session-1"))[0]?.content).toBe("pending");
    } finally {
      reader.close();
    }
  });
});

test("SQLite state survives close and restart", async () => {
  const paths = homePath();
  const first = new SQLiteSessionRepository(paths.database);
  await first.createSession(session());
  await first.appendMessages("session-1", [message("durable")]);
  for (const [status, updatedAt] of [
    ["completed", "2026-08-05T00:00:02.000Z"],
    ["failed", "2026-08-05T00:00:03.000Z"],
    ["cancelled", "2026-08-05T00:00:04.000Z"],
  ] as const) {
    const updated = await first.updateSession("session-1", { status, updatedAt });
    expect(updated.status).toBe(status);
    expect(updated.updatedAt).toBe(updatedAt);
  }
  first.close();
  const second = new SQLiteSessionRepository(paths.database);
  try {
    expect(await second.getSession("session-1")).not.toBeNull();
    expect((await second.listMessages("session-1"))[0]?.content).toBe("durable");
    expect(await second.getSession("session-1")).toMatchObject({
      status: "cancelled",
      updatedAt: "2026-08-05T00:00:04.000Z",
      workspaceId: "workspace-1",
    });
  } finally {
    second.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite validates session updates and rolls them back with the transaction", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());

    await expect(repo.updateSession("missing", {
      status: "completed", updatedAt: "2026-08-05T00:00:01.000Z",
    })).rejects.toThrow("Session not found: missing");
    await expect(repo.updateSession("session-1", {
      status: "unknown" as never, updatedAt: "2026-08-05T00:00:01.000Z",
    })).rejects.toThrow("Invalid session status");
    await expect(repo.updateSession("session-1", {
      updatedAt: "not-a-timestamp",
    })).rejects.toThrow("Invalid session timestamp");
    await expect(repo.transaction(async (transaction) => {
      await transaction.updateSession("session-1", {
        status: "failed", updatedAt: "2026-08-05T00:00:01.000Z",
      });
      throw new Error("abort");
    })).rejects.toThrow("abort");

    expect(await repo.getSession("session-1")).toMatchObject({
      status: "active",
      updatedAt: "2026-08-05T00:00:00.000Z",
    });
  });
});

test("SQLite rejects orphan recovery checkpoints and rolls back the attempted metadata write", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    await expect(repo.transaction(async (transaction) => {
      await transaction.appendMessages("session-1", [message("pending")]);
      await transaction.saveMigrationState({
        schemaVersion: 1, sessionId: "session-1", updatedAt: "2026-08-05T00:00:02.000Z",
        runtime: { runtimeVersion: "typescript", schemaVersion: 1 },
        recovery: {
          turnId: "turn-1", status: "interrupted", startedAt: "2026-08-05T00:00:01.000Z",
          updatedAt: "2026-08-05T00:00:02.000Z", checkpointId: "missing-checkpoint",
        },
      });
    })).rejects.toThrow("unknown checkpoint");
    expect(await repo.listMessages("session-1")).toEqual([]);
    expect(await repo.getMigrationState("session-1")).toBeNull();
  });
});

test("SQLite rejects an unmarked database before mutation", async () => {
  const paths = homePath();
  const database = new Database(paths.database);
  database.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version VALUES (25);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT, timestamp REAL NOT NULL
    );
    INSERT INTO sessions VALUES ('old-1', 'cli', 1785888000);
    INSERT INTO messages VALUES (1, 'old-1', 'user', 'hello', 1785888001);
  `);
  database.close();
  try {
    expect(() => new SQLiteSessionRepository(paths.database)).toThrow(UnsupportedSchemaError);
    const verification = new Database(paths.database);
    try {
      expect(verification.query("SELECT content FROM messages WHERE id = 1").get()).toEqual({ content: "hello" });
      expect(verification.query("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 1 });
      expect(verification.query("PRAGMA table_info(sessions)").all().map((row) => row.name))
        .toEqual(["id", "source", "started_at"]);
      expect(verification.query("SELECT name FROM sqlite_master WHERE name = 'data_layer_schema'").get()).toBeNull();
    } finally {
      verification.close();
    }
  } finally {
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite replays completed idempotency records and rejects mismatches", async () => {
  await withRepo(async (repo, database) => {
    const first = await repo.claimIdempotency("request-1", "fingerprint-a");
    expect(first.status).toBe("claimed");
    await repo.completeIdempotency("request-1", "fingerprint-a", { result: "done", count: 1 });
    const restarted = new SQLiteSessionRepository(database);
    try {
      await expect(restarted.claimIdempotency("request-1", "fingerprint-b")).rejects.toThrow("fingerprint");
      const replay = await restarted.claimIdempotency("request-1", "fingerprint-a");
      expect(replay).toMatchObject({ status: "replay", terminalPayload: { result: "done", count: 1 } });
    } finally {
      restarted.close();
    }
  });
});

test("SQLite persists pending approvals, reconnects decisions, and prunes retained records", async () => {
  const paths = homePath();
  const now = Date.now();
  const firstCreatedAt = new Date(now - 100).toISOString();
  const secondCreatedAt = new Date(now - 50).toISOString();
  const firstResolvedAt = new Date(now).toISOString();
  const secondResolvedAt = new Date(now + 1).toISOString();
  const first = new SQLiteSessionRepository({
    path: paths.database, idempotencyRetentionMs: 60_000, approvalRetentionMs: 60_000,
  });
  try {
    await first.savePendingApproval({
      requestId: "approval-1", sessionId: "session-1", callId: "call-1", toolName: "write",
      arguments: { path: "file" }, status: "pending", createdAt: firstCreatedAt,
      updatedAt: firstCreatedAt,
    });
    await first.savePendingApproval({
      requestId: "approval-2", sessionId: "session-1", callId: "call-2", toolName: "bash",
      arguments: { command: "dangerous" }, status: "pending", createdAt: secondCreatedAt,
      updatedAt: secondCreatedAt,
    });
    const restarted = new SQLiteSessionRepository({
      path: paths.database, idempotencyRetentionMs: 60_000, approvalRetentionMs: 60_000,
    });
    try {
      expect((await restarted.listPendingApprovals("session-1")).map(({ requestId }) => requestId))
        .toEqual(["approval-1", "approval-2"]);
      const allowed = await restarted.resolvePendingApproval("approval-1", "allow", firstResolvedAt);
      expect(allowed.status).toBe("allowed");
      expect(await restarted.resolvePendingApproval("approval-1", "allow", secondResolvedAt))
        .toEqual(allowed);
      await expect(restarted.resolvePendingApproval("approval-1", "deny")).rejects
        .toThrow("already resolved: approval-1");
      expect((await restarted.resolvePendingApproval("approval-2", "deny", firstResolvedAt)).status)
        .toBe("denied");
      expect(await restarted.listPendingApprovals("session-1")).toEqual([]);
      await restarted.prune(new Date(now + 120_000).toISOString());
      expect(await restarted.getPendingApproval("approval-1")).toBeNull();
      expect(await restarted.getPendingApproval("approval-2")).toBeNull();
    } finally {
      restarted.close();
    }
  } finally {
    first.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});
