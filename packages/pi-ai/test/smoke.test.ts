import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as ai from "@earendil-works/pi-ai";

test("vendored AI runtime resolves from the workspace", () => {
  assert.equal(typeof ai.createModels, "function");
});
