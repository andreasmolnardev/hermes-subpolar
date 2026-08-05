import { strict as assert } from "node:assert";
import { describe, test } from "bun:test";

import {
  InMemorySessionRepository,
  PERSISTENCE_SCHEMA_VERSION,
  type CheckpointRecord,
  type SessionRecord,
} from "../src/index.ts";

const runtime = {
  runtimeVersion: "test-runtime",
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  migrationId: "migration-1",
};

function session(id = "session-1"): SessionRecord {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    id,
    workspaceId: "workspace-1",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime,
    metadata: { source: "test", nested: { value: 1 } },
  };
}

function message(content: string | readonly { type: "text"; text: string }[]) {
  return {
    role: "user" as const,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("InMemorySessionRepository", () => {
  test("creates sessions and assigns contiguous ordered sequences", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());

    const first = await repository.appendMessages("session-1", [message("one"), message("two")]);
    const second = await repository.appendMessages(
      "session-1",
      [message("three")],
      { expectedNextSequence: 2 },
    );

    assert.deepEqual([first.firstSequence, first.lastSequence], [0, 1]);
    assert.deepEqual([second.firstSequence, second.lastSequence], [2, 2]);
    await assert.rejects(
      repository.appendMessages("session-1", [message("stale")], { expectedNextSequence: 2 }),
      /Expected next sequence 2, actual 3/,
    );
    assert.deepEqual((await repository.listMessages("session-1")).map(({ sequence }) => sequence), [0, 1, 2]);
    assert.equal((await repository.getSession("session-1"))?.id, "session-1");
  });

  test("rolls back every transaction mutation on failure", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());

    await assert.rejects(repository.transaction(async (transaction) => {
      await transaction.appendMessages("session-1", [message("not committed")]);
      await transaction.saveMigrationState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        sessionId: "session-1",
        updatedAt: "2026-01-01T00:00:00.000Z",
        runtime,
      });
      throw new Error("abort");
    }), /abort/);

    assert.deepEqual(await repository.listMessages("session-1"), []);
    assert.equal(await repository.getMigrationState("session-1"), null);
  });

  test("serializes concurrent transactions in invocation order", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());
    let release!: () => void;
    const pause = new Promise<void>((resolve) => { release = resolve; });

    const first = repository.transaction(async (transaction) => {
      const result = await transaction.appendMessages("session-1", [message("first")]);
      await pause;
      return result.firstSequence;
    });
    const second = repository.transaction((transaction) =>
      transaction.appendMessages("session-1", [message("second")]),
    );

    let secondCompleted = false;
    void second.then(() => { secondCompleted = true; });
    await Promise.resolve();
    assert.equal(secondCompleted, false);
    release();
    assert.equal(await first, 0);
    assert.equal((await second).firstSequence, 1);
  });

  test("indexes correlated tool calls and results", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());
    await repository.appendMessages("session-1", [{
      ...message("run command"),
      role: "assistant",
      toolCalls: [{ id: "call-1", name: "terminal", arguments: { command: "pwd" } }],
    }, {
      ...message("/tmp"),
      role: "tool",
      toolResult: { toolCallId: "call-1", content: "/tmp", isError: false, toolName: "terminal" },
    }]);

    assert.deepEqual((await repository.listToolCalls("session-1")).map(({ id, sequence }) => ({ id, sequence })), [
      { id: "call-1", sequence: 0 },
    ]);
    assert.deepEqual((await repository.listToolResults("session-1")).map(({ toolCallId, messageId }) => ({
      toolCallId,
      messageId,
    })), [{ toolCallId: "call-1", messageId: "session-1:message:1" }]);
  });

  test("preserves runtime metadata and checkpoints with defensive copies", async () => {
    const repository = new InMemorySessionRepository();
    const original = session();
    await repository.createSession(original);
    original.metadata!.nested = { value: 99 };
    assert.deepEqual((await repository.getSession("session-1"))?.metadata, {
      source: "test",
      nested: { value: 1 },
    });

    await repository.saveMigrationState({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      sessionId: "session-1",
      updatedAt: "2026-01-01T00:00:01.000Z",
      runtime,
    });
    assert.deepEqual(await repository.getMigrationState("session-1"), {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      sessionId: "session-1",
      updatedAt: "2026-01-01T00:00:01.000Z",
      runtime,
    });

    const checkpoint: CheckpointRecord = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: "checkpoint-1",
      sessionId: "session-1",
      messageSequence: 0,
      createdAt: "2026-01-01T00:00:01.000Z",
      reason: "manual",
      runtime,
      snapshot: { messages: ["one"], state: { ready: true } },
      label: "before change",
    };
    await repository.saveCheckpoint(checkpoint);
    (checkpoint.snapshot.state as { ready: boolean }).ready = false;
    const read = await repository.getCheckpoint("session-1", "checkpoint-1");
    assert.equal((read?.snapshot.state as { ready: boolean }).ready, true);
    assert.deepEqual((await repository.listCheckpoints("session-1")).map(({ id }) => id), ["checkpoint-1"]);
  });

  test("commits assistant, tool, usage, checkpoint, and recovery metadata atomically", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());
    const checkpoint = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: "checkpoint-turn-1",
      sessionId: "session-1",
      messageSequence: 2,
      createdAt: "2026-01-01T00:00:02.000Z",
      reason: "turn" as const,
      runtime,
      snapshot: { next: "resume" },
    };

    await repository.commitTurn({
      sessionId: "session-1",
      messages: [{
        ...message("calling"),
        role: "assistant",
        toolCalls: [{ id: "call-atomic", name: "lookup", arguments: { q: "x" } }],
      }, {
        ...message("answer"),
        role: "tool",
        toolCallId: "call-atomic",
        toolResult: { toolCallId: "call-atomic", content: "answer", isError: false },
      }],
      usage: { schemaVersion: 1, sessionId: "session-1", recordedAt: "2026-01-01T00:00:02.000Z", usage: {
        inputTokens: 3, outputTokens: 2,
      } },
      checkpoint,
      migrationState: {
        schemaVersion: 1,
        sessionId: "session-1",
        updatedAt: "2026-01-01T00:00:02.000Z",
        runtime,
        recovery: {
          turnId: "turn-1",
          status: "running",
          startedAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:02.000Z",
        },
      },
    });

    assert.equal((await repository.listMessages("session-1")).length, 2);
    assert.equal((await repository.listToolCalls("session-1"))[0]?.id, "call-atomic");
    assert.equal((await repository.listToolResults("session-1"))[0]?.toolCallId, "call-atomic");
    assert.equal((await repository.listUsage("session-1"))[0]?.usage.totalTokens, undefined);
    assert.equal((await repository.getCheckpoint("session-1", "checkpoint-turn-1"))?.formatVersion, 1);
    assert.equal((await repository.getMigrationState("session-1"))?.recovery?.status, "running");
  });

  test("rolls back an interrupted-turn write set when recovery metadata is invalid", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());

    await assert.rejects(repository.commitTurn({
      sessionId: "session-1",
      messages: [{
        ...message("pending"),
        role: "assistant",
        toolCalls: [{ id: "call-pending", name: "terminal", arguments: "{}" }],
      }],
      usage: { schemaVersion: 1, sessionId: "session-1", recordedAt: "2026-01-01T00:00:02.000Z", usage: {
        inputTokens: 1, outputTokens: 1,
      } },
      checkpoint: {
        schemaVersion: 1,
        id: "checkpoint-pending",
        sessionId: "session-1",
        messageSequence: 0,
        createdAt: "2026-01-01T00:00:02.000Z",
        reason: "before-tool",
        runtime,
        snapshot: { pending: true },
      },
      migrationState: {
        schemaVersion: 1,
        sessionId: "session-1",
        updatedAt: "2026-01-01T00:00:02.000Z",
        runtime,
        recovery: {
          turnId: "turn-invalid",
          status: "interrupted",
          startedAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:02.000Z",
          checkpointId: "checkpoint-pending",
          pendingToolCallIds: ["call-missing"],
        },
      },
    }), /unknown tool call/);

    assert.deepEqual(await repository.listMessages("session-1"), []);
    assert.deepEqual(await repository.listUsage("session-1"), []);
    assert.deepEqual(await repository.listCheckpoints("session-1"), []);
    assert.equal(await repository.getMigrationState("session-1"), null);
  });

  test("round-trips Python-compatible structured content", async () => {
    const repository = new InMemorySessionRepository();
    await repository.createSession(session());
    const content = [
      { type: "text" as const, text: "inspect image" },
      { type: "image_url" as const, imageUrl: { url: "https://example.test/a.png", detail: "high" as const } },
    ];
    await repository.appendMessages("session-1", [message(content)]);
    content[0].text = "mutated caller value";
    const read = await repository.listMessages("session-1");
    assert.deepEqual(read[0]?.content, [
      { type: "text", text: "inspect image" },
      { type: "image_url", imageUrl: { url: "https://example.test/a.png", detail: "high" } },
    ]);
    (read[0]?.content as { type: "text"; text: string }[])[0].text = "mutated returned value";
    assert.equal((await repository.listMessages("session-1"))[0]?.content instanceof Array, true);
    assert.equal(((await repository.listMessages("session-1"))[0]?.content as { text: string }[])[0]?.text, "inspect image");
  });
});
