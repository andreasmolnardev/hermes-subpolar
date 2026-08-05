import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { resolveTools } from "../src/index.ts";

test("resolver excludes denied tools without mutating snapshot", () => {
  const snapshot = [
    { toolName: "browser.search", policy: "allow" as const },
    { toolName: "shell.exec", policy: "deny" as const }
  ];

  assert.deepEqual(resolveTools(snapshot), [{ name: "browser.search", policy: "allow" }]);
  assert.deepEqual(snapshot, [
    { toolName: "browser.search", policy: "allow" },
    { toolName: "shell.exec", policy: "deny" }
  ]);
});
