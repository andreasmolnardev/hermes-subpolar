import { strict as assert } from "node:assert";
import { test } from "bun:test";

import type { ChatProvider } from "../src/index.ts";

test("provider interface supports normalized completion results", async () => {
  const provider: ChatProvider = {
    async complete() {
      return {
        message: { role: "assistant", content: "ok" },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  };

  assert.equal((await provider.complete({ model: "fake", messages: [], tools: [] })).message.content, "ok");
});
