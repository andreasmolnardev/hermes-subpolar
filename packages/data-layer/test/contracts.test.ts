import { strict as assert } from "node:assert";
import { describe, test } from "bun:test";

import { parseTransportEvent } from "../src/contracts.ts";

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
});
