import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { executeRequest } from "../src/index.ts";

test("gateway resolves policy before invoking harness", async () => {
  const result = await executeRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "shell.exec", policy: "deny" }]
  }, {
    async complete(request) {
      assert.equal(request.model, "fake");
      assert.deepEqual(request.messages, [{ role: "user", content: "hello" }]);
      assert.deepEqual(request.tools, []);
      return {
        message: { role: "assistant", content: "safe" },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  });

  assert.equal(result.message.content, "safe");
});
