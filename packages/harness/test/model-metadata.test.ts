import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  HARNESS_IMAGE_TOKEN_COST,
  HARNESS_TOKEN_APPROXIMATION_VERSION,
  estimateContentPartTokensRough,
  estimateMessageTokensRough,
  estimateMessagesTokensRough,
  estimateRequestTokensRough,
  estimateTokensRough,
  estimateToolsTokensRough,
  parseAvailableOutputTokensFromError,
  parseAvailableOutputTokensFromErrorResult,
  parseContextLimitFromError,
  parseContextLimitFromErrorResult
} from "../src/index.ts";

function tokens(value: ReturnType<typeof estimateTokensRough>): number {
  assert.equal(value.supported, true);
  return value.tokens;
}

test("rough text estimation is versioned and uses ceiling boundaries", () => {
  assert.equal(HARNESS_TOKEN_APPROXIMATION_VERSION, "rough-v1");
  assert.equal(tokens(estimateTokensRough("")), 0);
  assert.equal(tokens(estimateTokensRough("a")), 1);
  assert.equal(tokens(estimateTokensRough("a".repeat(4))), 1);
  assert.equal(tokens(estimateTokensRough("a".repeat(5))), 2);
  assert.equal(tokens(estimateTokensRough("设置")), 2);
  assert.equal(tokens(estimateTokensRough("设置ab")), 3);
});

test("content parts charge images flat and retain text estimates", () => {
  const text = estimateContentPartTokensRough({ type: "text", text: "describe" });
  const smallImage = estimateContentPartTokensRough({
    type: "image_url",
    imageUrl: { url: "data:image/png;base64,A" }
  });
  const largeImage = estimateContentPartTokensRough({
    type: "image_url",
    imageUrl: { url: `data:image/png;base64,${"A".repeat(500_000)}` }
  });

  assert.equal(text.supported, true);
  assert.equal(smallImage.supported, true);
  assert.equal(largeImage.supported, true);
  assert.ok(smallImage.tokens >= HARNESS_IMAGE_TOKEN_COST);
  assert.equal(largeImage.tokens, smallImage.tokens);
  assert.equal(
    estimateContentPartTokensRough({ type: "audio", url: "https://example.invalid/audio" }).supported,
    false
  );
});

test("message estimates follow wire content and do not double-count sidecars", () => {
  const body = "cached prompt bytes ".repeat(2000);
  const wire = { role: "user", content: body };
  const sidecar = { role: "user", content: "short", api_content: body };
  const duplicated = { role: "user", content: body, api_content: body };
  const image = {
    role: "user",
    content: [{ type: "text", text: "describe" }, { type: "image", url: "A" }]
  };
  const stashedImage = {
    role: "user",
    content: "describe",
    _anthropic_content_blocks: [{ type: "image", source: { data: "large" } }]
  };

  assert.equal(tokens(estimateMessageTokensRough(sidecar)), tokens(estimateMessageTokensRough(wire)));
  assert.equal(tokens(estimateMessageTokensRough(duplicated)), tokens(estimateMessageTokensRough(wire)));
  assert.ok(tokens(estimateMessageTokensRough(image)) >= HARNESS_IMAGE_TOKEN_COST);
  assert.ok(tokens(estimateMessageTokensRough(stashedImage)) >= HARNESS_IMAGE_TOKEN_COST);
  assert.deepEqual(estimateMessageTokensRough({ role: "user", content: [{ type: "unknown" }] }), {
    supported: false,
    approximationVersion: HARNESS_TOKEN_APPROXIMATION_VERSION,
    reason: "unsupported-content",
    fallback: "python"
  });
});

test("request totals include system text, messages, and tool schemas", () => {
  const messages = [{ role: "user", content: "hello" }];
  const smallTools = [{ name: "lookup", description: "Find one item", parameters: { type: "object" } }];
  const largeTools = [{
    name: "lookup",
    description: "Find one item with a detailed explanation".repeat(10),
    parameters: { type: "object", properties: { query: { type: "string", description: "q".repeat(100) } } }
  }];
  const withoutTools = estimateRequestTokensRough(messages, { systemPrompt: "system" });
  const withTools = estimateRequestTokensRough(messages, { systemPrompt: "system", tools: smallTools });
  const larger = estimateRequestTokensRough(messages, { tools: largeTools });

  assert.equal(withoutTools.supported, true);
  assert.equal(withTools.supported, true);
  assert.equal(larger.supported, true);
  assert.ok(withTools.tokens > withoutTools.tokens);
  assert.ok(larger.tokens > tokens(estimateRequestTokensRough(messages)));
  assert.equal(estimateMessagesTokensRough(messages).supported, true);
});

test("unknown request content returns an explicit Python fallback", () => {
  const result = estimateRequestTokensRough([{ role: "user", content: [{ type: "file", url: "x" }] }]);
  assert.deepEqual(result, {
    supported: false,
    approximationVersion: HARNESS_TOKEN_APPROXIMATION_VERSION,
    reason: "unsupported-media",
    fallback: "python"
  });
});

test("context-limit parser accepts explicit boundaries but not guessed limits", () => {
  assert.equal(parseContextLimitFromError("maximum context length is 1024 tokens"), 1024);
  assert.equal(parseContextLimitFromError("context_length_exceeded: 32768"), 32_768);
  assert.equal(parseContextLimitFromError("maximum context length is 1023 tokens"), undefined);
  assert.equal(parseContextLimitFromError("maximum context length is 10000000 tokens"), 10_000_000);
  assert.equal(parseContextLimitFromError("maximum context length is 10000001 tokens"), undefined);
  assert.equal(parseContextLimitFromError("input exceeds the context window"), undefined);
  assert.deepEqual(parseContextLimitFromErrorResult("input exceeds the context window"), {
    supported: false,
    parserVersion: "provider-error-v1",
    reason: "unreported-limit",
    fallback: "python"
  });
});

test("available-output parser handles provider formats and conservative boundaries", () => {
  assert.equal(parseAvailableOutputTokensFromError(
    "max_tokens: 32768 > context_window: 200000 - input_tokens: 190000 = available_tokens: 10000"
  ), 10_000);
  assert.equal(parseAvailableOutputTokensFromError("Range of max_tokens should be [ 1 , 32768 ]"), 32_768);
  assert.equal(parseAvailableOutputTokensFromError(
    "maximum context length is 65536 tokens. requested 65536 output tokens and prompt contains 77409 characters"
  ), 39_733);
  assert.equal(parseAvailableOutputTokensFromError(
    "maximum context length is 131072 tokens. requested 65536 output tokens and prompt contains at least 65537 input tokens"
  ), 65_535);
  assert.equal(parseAvailableOutputTokensFromError("prompt is too long: 205000 tokens > 200000 maximum"), undefined);
  assert.deepEqual(parseAvailableOutputTokensFromErrorResult("unrelated provider error"), {
    supported: false,
    parserVersion: "provider-error-v1",
    reason: "unreported-output-cap",
    fallback: "python"
  });
});
