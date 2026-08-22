import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as telemetry from "@earendil-works/pi-telemetry";

test("vendored telemetry resolves from the workspace", () => {
  assert.ok(Object.keys(telemetry).length > 0);
});
