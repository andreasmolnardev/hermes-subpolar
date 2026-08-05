import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { SQLiteSessionRepository } from "../src/sqlite.js";
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

test("SQLite transaction rolls back all writes", async () => {
  await withRepo(async (repo) => {
    await repo.createSession(session());
    await expect(repo.transaction(async (transaction) => {
      await transaction.appendMessages("session-1", [message("not committed")]);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await repo.listMessages("session-1")).toEqual([]);
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
      expect((await restarted.getMigrationState("session-1"))?.recovery?.status).toBe("interrupted");
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
  first.close();
  const second = new SQLiteSessionRepository(paths.database);
  try {
    expect(await second.getSession("session-1")).not.toBeNull();
    expect((await second.listMessages("session-1"))[0]?.content).toBe("durable");
  } finally {
    second.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite reads supported Python-shaped sessions and messages without rewriting rows", async () => {
  const paths = homePath();
  const database = new Database(paths.database);
  database.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version VALUES (25);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, model TEXT, title TEXT,
      started_at REAL NOT NULL, ended_at REAL, end_reason TEXT, origin_json TEXT
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT, tool_call_id TEXT, tool_calls TEXT, timestamp REAL NOT NULL
    );
    INSERT INTO sessions VALUES ('legacy-1', 'cli', 'legacy-model', 'Legacy', 1785888000, NULL, NULL, '{"source":"python"}');
    INSERT INTO sessions VALUES ('unknown-row', 'future', NULL, NULL, 1785888001, NULL, NULL, NULL);
    INSERT INTO messages VALUES (2, 'legacy-1', 'user', '{"type":"not-content"}', NULL, NULL, 1785888002);
    INSERT INTO messages VALUES (1, 'legacy-1', 'user', 'first', NULL, NULL, 1785888001);
  `);
  database.close();
  const repo = new SQLiteSessionRepository(paths.database);
  try {
    const legacy = await repo.getSession("legacy-1");
    expect(legacy?.runtime.runtimeVersion).toBe("python-legacy");
    expect((await repo.listMessages("legacy-1")).map(({ content }) => content)).toEqual(["first", "{\"type\":\"not-content\"}"]);
    expect(await repo.getSession("unknown-row")).not.toBeNull();
    await expect(repo.createSession(session("new"))).rejects.toThrow();
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite writes additive metadata for legacy sessions without rewriting transcripts", async () => {
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
    INSERT INTO sessions VALUES ('legacy-1', 'cli', 1785888000);
    INSERT INTO messages VALUES (1, 'legacy-1', 'user', 'hello', 1785888001);
  `);
  database.close();
  const repo = new SQLiteSessionRepository(paths.database);
  try {
    await repo.recordUsage({
      schemaVersion: 1,
      sessionId: "legacy-1",
      recordedAt: "2026-08-05T00:00:02.000Z",
      usage: { inputTokens: 2, outputTokens: 1 },
    });
    await repo.saveCheckpoint({
      schemaVersion: 1,
      id: "legacy-checkpoint",
      sessionId: "legacy-1",
      messageSequence: 1,
      createdAt: "2026-08-05T00:00:02.000Z",
      reason: "migration",
      runtime: { runtimeVersion: "typescript", schemaVersion: 1, migratedFromSchemaVersion: 25 },
      snapshot: { legacy: true },
    });
    await repo.saveMigrationState({
      schemaVersion: 1,
      sessionId: "legacy-1",
      updatedAt: "2026-08-05T00:00:02.000Z",
      runtime: { runtimeVersion: "typescript", schemaVersion: 1, migratedFromSchemaVersion: 25 },
    });

    expect((await repo.listUsage("legacy-1"))[0]?.usage.inputTokens).toBe(2);
    expect((await repo.listCheckpoints("legacy-1"))[0]?.id).toBe("legacy-checkpoint");
    expect((await repo.getMigrationState("legacy-1"))?.runtime.migratedFromSchemaVersion).toBe(25);
    await expect(repo.appendMessages("legacy-1", [message("must not rewrite legacy")])).rejects.toThrow();
    expect((await repo.listMessages("legacy-1"))[0]?.content).toBe("hello");
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});
