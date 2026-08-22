import { strict as assert } from "node:assert";
import { test } from "bun:test";
import * as tui from "@earendil-works/pi-tui";

test("vendored TUI resolves from the workspace", () => {
  assert.equal(typeof tui.TuiAltScreen, "function");
});
