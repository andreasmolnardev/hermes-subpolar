import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as client from "@earendil-works/pi-client";

test("vendored client resolves from the workspace", () => {
  assert.ok(Object.keys(client).length > 0);
});
