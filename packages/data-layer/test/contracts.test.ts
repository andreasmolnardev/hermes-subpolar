import { strict as assert } from "node:assert";
import { describe, test } from "bun:test";

import {
  PERSISTENCE_SCHEMA_VERSION,
  parseTransportEvent,
  validateMessageOrdering,
  validateSchemaVersion,
  validateSessionMessages,
  validateToolCorrelations,
} from "../src/contracts.ts";

describe("browser-safe transport contracts", () => {
  test("accepts valid streaming events", () => {
    assert.deepEqual(parseTransportEvent({
      type: "message.delta",
      sessionId: "session-1",
      delta: "hello"
    }), {
      type: "message.delta",
      sessionId: "session-1",
      delta: "hello"
    });
  });

  test("rejects malformed or unknown events", () => {
    assert.equal(parseTransportEvent({ type: "message.delta", sessionId: 1, delta: "hello" }), null);
    assert.equal(parseTransportEvent({ type: "database.query", sql: "select 1" }), null);
    assert.equal(parseTransportEvent(null), null);
  });

  test("accepts structured completed messages and tool events", () => {
    assert.deepEqual(parseTransportEvent({
      type: "message.completed",
      sessionId: "session-1",
      message: {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", imageUrl: { url: "https://example.test/image" } },
        ],
      },
    }), {
      type: "message.completed",
      sessionId: "session-1",
      message: {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", imageUrl: { url: "https://example.test/image" } },
        ],
      },
    });
    assert.deepEqual(parseTransportEvent({
      type: "tool.result",
      sessionId: "session-1",
      messageId: "message-2",
      result: { toolCallId: "call-1", content: "done", isError: false },
    }), {
      type: "tool.result",
      sessionId: "session-1",
      messageId: "message-2",
      result: { toolCallId: "call-1", content: "done", isError: false },
    });
  });

  test("keeps string completed messages valid", () => {
    assert.deepEqual(parseTransportEvent({
      type: "message.completed",
      sessionId: "session-1",
      message: { role: "assistant", content: "done" },
    }), {
      type: "message.completed",
      sessionId: "session-1",
      message: { role: "assistant", content: "done" },
    });
  });
});

describe("persistence invariants", () => {
  const call = {
    id: "call-1",
    name: "terminal",
    arguments: { command: "pwd" },
  } as const;

  const messages = [
    {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: "message-1",
      sessionId: "session-1",
      sequence: 0,
      role: "assistant" as const,
      content: "checking",
      createdAt: "2026-01-01T00:00:00.000Z",
      toolCalls: [call],
    },
    {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: "message-2",
      sessionId: "session-1",
      sequence: 1,
      role: "tool" as const,
      content: "done",
      createdAt: "2026-01-01T00:00:01.000Z",
      toolResult: { toolCallId: "call-1", content: "done", isError: false },
    },
  ];

  test("requires contiguous ordered message sequences", () => {
    assert.deepEqual(validateMessageOrdering(messages, "session-1"), { valid: true });
    assert.equal(validateMessageOrdering([
      messages[0],
      { ...messages[1], sequence: 3 },
    ], "session-1").valid, false);
    assert.equal(validateMessageOrdering(messages, "other-session").valid, false);
  });

  test("requires tool results to correlate to one preceding call", () => {
    assert.deepEqual(validateToolCorrelations(messages), { valid: true });
    assert.deepEqual(validateToolCorrelations([
      messages[0],
      {
        ...messages[1],
        toolCallId: "call-1",
      },
    ]), { valid: true });
    assert.equal(validateToolCorrelations([
      { ...messages[1], toolResult: { toolCallId: "missing", content: "x", isError: true } },
    ]).valid, false);
    assert.equal(validateToolCorrelations([
      messages[0],
      { ...messages[1], toolCallId: "call-1", toolResult: { toolCallId: "other", content: "x", isError: true } },
    ]).valid, false);
  });

  test("validates persisted message fields", () => {
    assert.deepEqual(validateSessionMessages(messages, "session-1"), { valid: true });

    const invalidMessages = [
      { ...messages[0], id: "" },
      { ...messages[0], sessionId: "" },
      { ...messages[0], role: "invalid" },
      { ...messages[0], content: { text: "not a content part" } },
      { ...messages[0], createdAt: "not-a-timestamp" },
      { ...messages[0], toolCalls: [{ ...call, id: "" }] },
      { ...messages[0], toolResult: { toolCallId: "call-1", content: "done", isError: "no" } },
      { ...messages[0], usage: { inputTokens: -1, outputTokens: 1 } },
    ];

    for (const message of invalidMessages) {
      assert.equal(validateSessionMessages([message as never]).valid, false);
    }
  });

  test("accepts only current schema version", () => {
    assert.equal(validateSchemaVersion(PERSISTENCE_SCHEMA_VERSION), true);
    assert.equal(validateSchemaVersion(0), false);
    assert.equal(validateSchemaVersion("1"), false);
  });
});
