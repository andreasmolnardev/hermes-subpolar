import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMessageRequest } from "../src/index.ts";

test("web UI creates transport request from browser-safe workspace data", () => {
  assert.deepEqual(createMessageRequest({ id: "workspace-1", name: "Demo" }, "hello"), {
    workspaceId: "workspace-1",
    message: "hello"
  });
});
