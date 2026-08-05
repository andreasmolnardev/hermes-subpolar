import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { execute } from "../src/index.ts";

test("harness passes explicit request state to provider", async () => {
  const result = await execute({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    tools: []
  }, {
    async complete(request) {
      assert.equal(request.model, "fake");
      assert.deepEqual(request.messages, [{ role: "user", content: "hello" }]);
      assert.deepEqual(request.tools, []);
      return {
        message: { role: "assistant", content: "world" },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  });

  assert.equal(result.message.content, "world");
});
