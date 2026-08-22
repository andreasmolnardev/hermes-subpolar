import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as protocol from "@earendil-works/pi-protocol";

test("vendored protocol resolves from the workspace", () => {
  assert.ok(Object.keys(protocol).length > 0);
});
