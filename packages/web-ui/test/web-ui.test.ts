import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMessageRequest } from "../src/index.ts";
import { defaultTheme } from "../src/themes/presets.ts";

test("web UI creates transport request from browser-safe workspace data", () => {
  assert.deepEqual(createMessageRequest({ id: "workspace-1", name: "Demo" }, "hello"), {
    workspaceId: "workspace-1",
    message: "hello"
  });
});

test("web UI defaults to Tokyo Night", () => {
  assert.equal(defaultTheme.label, "Tokyo Night");
  assert.equal(defaultTheme.palette.background.hex, "#1a1b26");
  assert.equal(defaultTheme.colorOverrides?.primary, "#7aa2f7");
});
