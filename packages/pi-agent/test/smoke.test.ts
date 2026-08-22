import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as agent from "@earendil-works/pi-agent-core";

test("vendored agent core resolves from the workspace", () => {
  assert.equal(typeof agent.Agent, "function");
});
