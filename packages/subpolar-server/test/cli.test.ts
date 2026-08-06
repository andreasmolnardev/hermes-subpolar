import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { parseSubpolarArgs, parseSubpolarConfig } from "../src/cli.ts";

test("CLI accepts only the serve command and documented options", () => {
  assert.deepEqual(parseSubpolarArgs(["serve", "--host", "127.0.0.1", "--port", "8081", "--config", "config.json", "--data-dir", "/tmp/data"]), {
    host: "127.0.0.1",
    port: 8081,
    configPath: "config.json",
    dataDir: "/tmp/data",
  });
  assert.deepEqual(parseSubpolarArgs([]), { host: "127.0.0.1", port: 8080 });
});

test("CLI rejects unknown commands, options, and invalid ports", () => {
  assert.throws(() => parseSubpolarArgs(["dashboard"]), /unknown command/);
  assert.throws(() => parseSubpolarArgs(["serve", "--host"]), /requires a value/);
  assert.throws(() => parseSubpolarArgs(["serve", "--wat", "yes"]), /unknown option/);
  assert.throws(() => parseSubpolarArgs(["serve", "--port", "0"]), /valid TCP port/);
});

test("config accepts strict JSON or simple YAML and rejects unknown keys", () => {
  assert.deepEqual(parseSubpolarConfig("providerBaseUrl: https://api.example.test\nport: 9000\n"), {
    providerBaseUrl: "https://api.example.test",
    port: 9000,
  });
  assert.throws(() => parseSubpolarConfig('{"debug":true}'), /unknown key/);
  assert.throws(() => parseSubpolarConfig("providerBaseUrl: https://api.example.test\nproviderBaseUrl: https://other.example.test"), /duplicate key/);
});
