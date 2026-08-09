import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { projectSubpolarActivity } from "../src/lib/subpolar-events.ts";
import { SETTINGS_SECTIONS, settingsSection } from "../src/lib/settings-sections.ts";
import { defaultTheme } from "../src/themes/presets.ts";

test("web UI projects an active Bun gateway tool event", () => {
  assert.deepEqual(projectSubpolarActivity({
    protocol: "subpolar.v1",
    requestId: "request-1",
    sequence: 1,
    event: { type: "tool.start", payload: { name: "search" } },
  }), {
    kind: "tool",
    type: "tool.start",
    text: "search started",
    requestId: "request-1",
    sequence: 1,
  });
});

test("web UI defaults to Tokyo Night", () => {
  assert.equal(defaultTheme.label, "Tokyo Night");
  assert.equal(defaultTheme.palette.background.hex, "#1a1b26");
  assert.equal(defaultTheme.colorOverrides?.primary, "#7aa2f7");
});

test("settings separate user preferences from agent infrastructure", () => {
  assert.equal(settingsSection("user", "appearance")?.label, "Appearance");
  assert.equal(settingsSection("agent", "models")?.label, "Models");
  assert.equal(settingsSection("user", "models"), undefined);
  assert.equal(settingsSection("agent", "account"), undefined);
  assert.deepEqual(SETTINGS_SECTIONS.user.map(section => section.id), [
    "account", "appearance", "chat", "voice", "notifications", "keybinds", "about",
  ]);
  assert.deepEqual(SETTINGS_SECTIONS.agent.map(section => section.id), [
    "models", "tools", "skills", "plugins", "memory",
  ]);
});
