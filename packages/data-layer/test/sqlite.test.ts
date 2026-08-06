import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { SQLiteSessionRepository } from "../src/sqlite.js";
import {
  createDefaultRuntimeSelectionStore,
  getHermesStateDatabasePath,
  SQLiteRuntimeSelectionStore
} from "../src/runtime-selection.js";
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

test("SQLite runtime selection survives store recreation and remains validated", async () => {
  const paths = homePath();
  const first = new SQLiteRuntimeSelectionStore(paths.database);
  try {
    await first.save("session-runtime", "harness");
    expect(await first.load("session-runtime")).toBe("harness");
  } finally {
    first.close();
  }

  const restarted = new SQLiteRuntimeSelectionStore(paths.database);
  try {
    expect(await restarted.load("session-runtime")).toBe("harness");
    await expect(restarted.load(" ")).rejects.toThrow("session id");
    await expect(restarted.save("session-runtime", "invalid" as never)).rejects.toThrow("invalid");
    await restarted.clear("session-runtime");
    expect(await restarted.load("session-runtime")).toBeUndefined();
  } finally {
    restarted.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("default runtime selection store follows HERMES_HOME state.db", async () => {
  const home = mkdtempSync(join(tmpdir(), "hermes-runtime-home-"));
  const previous = process.env.HERMES_HOME;
  process.env.HERMES_HOME = home;
  const store = createDefaultRuntimeSelectionStore();
  try {
    expect(getHermesStateDatabasePath()).toBe(join(home, "state.db"));
    await store.save("default-runtime-session", "harness");
    expect(await store.load("default-runtime-session")).toBe("harness");
  } finally {
    store.close();
    if (previous === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
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

test("SQLite preserves Python insertion order and normalizes persisted tool calls", async () => {
  const paths = homePath();
  const database = new Database(paths.database);
  database.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version VALUES (25);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, tool_call_id TEXT, tool_calls TEXT,
      tool_name TEXT, timestamp REAL NOT NULL
    );
    INSERT INTO sessions VALUES ('legacy-1', 'cli', 1785888000);
    INSERT INTO messages (session_id, role, content, tool_calls, timestamp)
      VALUES ('legacy-1', 'assistant', 'working',
        '[{"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{\\"q\\":\\"hermes\\"}"}}]',
        1785888003);
    INSERT INTO messages (session_id, role, content, tool_call_id, tool_name, timestamp)
      VALUES ('legacy-1', 'tool', 'done', 'call-1', 'lookup', 1785888002);
  `);
  database.close();

  const repo = new SQLiteSessionRepository(paths.database);
  try {
    expect((await repo.listMessages("legacy-1")).map(({ id }) => id)).toEqual(["1", "2"]);
    expect(await repo.listToolCalls("legacy-1")).toMatchObject([{
      id: "call-1", name: "lookup", arguments: '{"q":"hermes"}', sequence: 0,
    }]);
    expect(await repo.listToolResults("legacy-1")).toMatchObject([{
      toolCallId: "call-1", toolName: "lookup", sequence: 1,
    }]);
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite reads Python-shaped sidecars and preserves structured row order", async () => {
  const paths = homePath();
  const database = new Database(paths.database);
  database.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version VALUES (25);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, api_content TEXT, display_kind TEXT,
      display_metadata TEXT, synthetic INTEGER, context TEXT, timestamp REAL NOT NULL
    );
    INSERT INTO sessions VALUES ('legacy-1', 'cli', 1785888000);
    INSERT INTO messages (session_id, role, content, api_content, display_kind,
      display_metadata, synthetic, context, timestamp)
      VALUES ('legacy-1', 'user',
        '[{"type":"text","text":"visible"},{"type":"image_url","imageUrl":{"url":"https://example.test/a"}}]',
        '[{"type":"text","text":"provider"}]', 'model_switch',
        '{"model":"next","attempt":2}', 1, '{"source":"gateway","tags":["one"]}', 1785888002);
    INSERT INTO messages (session_id, role, content, api_content, context, timestamp)
      VALUES ('legacy-1', 'assistant', 'answer', 'provider answer', 'plain-context', 1785888001);
  `);
  database.close();

  const repo = new SQLiteSessionRepository(paths.database);
  try {
    expect(await repo.listMessages("legacy-1")).toEqual([{
      schemaVersion: 1,
      id: "1",
      sessionId: "legacy-1",
      sequence: 0,
      role: "user",
      content: [
        { type: "text", text: "visible" },
        { type: "image_url", imageUrl: { url: "https://example.test/a" } },
      ],
      apiContent: [{ type: "text", text: "provider" }],
      displayKind: "model_switch",
      displayMetadata: { model: "next", attempt: 2 },
      synthetic: true,
      context: { source: "gateway", tags: ["one"] },
      createdAt: "2026-08-05T00:00:02.000Z",
    }, {
      schemaVersion: 1,
      id: "2",
      sessionId: "legacy-1",
      sequence: 1,
      role: "assistant",
      content: "answer",
      apiContent: "provider answer",
      context: "plain-context",
      createdAt: "2026-08-05T00:00:01.000Z",
    }]);
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});

test("SQLite adds missing contract metadata columns without rewriting an older database", async () => {
  const paths = homePath();
  const database = new Database(paths.database);
  database.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version VALUES (1);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, workspace_id TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      runtime_json TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
      sequence INTEGER NOT NULL, role TEXT NOT NULL, content_json TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
    );
    CREATE TABLE migration (
      session_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL, runtime_json TEXT NOT NULL
    );
    CREATE TABLE checkpoints (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
      message_sequence INTEGER NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL,
      runtime_json TEXT NOT NULL, snapshot_json TEXT NOT NULL, label TEXT
    );
    INSERT INTO sessions VALUES (
      'old-1', 1, 'workspace-1', 'active',
      '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z',
      '{"runtimeVersion":"old","schemaVersion":1}'
    );
    INSERT INTO messages VALUES (
      'old-message', 'old-1', 1, 0, 'user', '"hello"', '2026-08-05T00:00:01.000Z'
    );
  `);
  database.close();

  const repo = new SQLiteSessionRepository(paths.database);
  try {
    await repo.appendMessages("old-1", [message("reply", { role: "assistant" })]);
    await repo.appendMessages("old-1", [message("sidecar", {
      role: "assistant",
      apiContent: [{ type: "text", text: "provider" }],
      displayKind: "hidden",
      displayMetadata: { source: "test" },
      synthetic: true,
      context: { retry: 1 },
    })]);
    expect((await repo.listMessages("old-1"))[2]).toMatchObject({
      apiContent: [{ type: "text", text: "provider" }],
      displayKind: "hidden",
      displayMetadata: { source: "test" },
      synthetic: true,
      context: { retry: 1 },
    });
    await repo.saveCheckpoint({
      schemaVersion: 1, id: "old-checkpoint", sessionId: "old-1", messageSequence: 2,
      createdAt: "2026-08-05T00:00:02.000Z", reason: "migration",
      runtime: { runtimeVersion: "typescript", schemaVersion: 1 }, snapshot: { old: true },
    });
    await repo.saveMigrationState({
      schemaVersion: 1, sessionId: "old-1", updatedAt: "2026-08-05T00:00:02.000Z",
      runtime: { runtimeVersion: "typescript", schemaVersion: 1 },
      recovery: {
        turnId: "turn-1", status: "interrupted", startedAt: "2026-08-05T00:00:01.000Z",
        updatedAt: "2026-08-05T00:00:02.000Z", checkpointId: "old-checkpoint",
      },
    });
    expect((await repo.listMessages("old-1")).map(({ content }) => content)).toEqual(["hello", "reply", "sidecar"]);
    expect((await repo.getCheckpoint("old-1", "old-checkpoint"))?.formatVersion).toBe(1);
    expect((await repo.getMigrationState("old-1"))?.recovery?.checkpointId).toBe("old-checkpoint");
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
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

    const verification = new Database(paths.database);
    try {
      expect(verification.query("SELECT content FROM messages WHERE id = 1").get()).toEqual({ content: "hello" });
      expect(verification.query("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 1 });
      expect(verification.query("PRAGMA table_info(sessions)").all().map((row) => row.name))
        .toEqual(["id", "source", "started_at"]);
    } finally {
      verification.close();
    }
  } finally {
    repo.close();
    rmSync(paths.home, { recursive: true, force: true });
  }
});
