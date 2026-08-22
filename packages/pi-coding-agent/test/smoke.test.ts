import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as codingAgent from "@earendil-works/pi-coding-agent";

test("vendored coding-agent SDK resolves from the workspace", () => {
  assert.equal(typeof codingAgent.createAgentSession, "function");
});
