import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  classifyProviderError,
  type ProviderErrorClassification
} from "../src/provider-error-classifier.ts";

function category(error: unknown, options?: Parameters<typeof classifyProviderError>[1]): ProviderErrorClassification {
  return classifyProviderError(error, options);
}

test("provider error classifier follows the neutral precedence matrix", () => {
  const cases: readonly [string, unknown, Parameters<typeof classifyProviderError>[1] | undefined, string][] = [
    ["cancellation beats status", Object.assign(new Error("cancelled"), { name: "AbortError", statusCode: 500 }), undefined, "cancelled"],
    ["timeout beats status", Object.assign(new Error("timed out"), { name: "TimeoutError", statusCode: 400 }), undefined, "timeout"],
    ["content policy beats status", new Error("request violates our usage policies"), { statusCode: 400 }, "content_filter"],
    ["429 overload beats rate limit", new Error("rate limit: service is overloaded"), { statusCode: 429 }, "overloaded"],
    ["401 is authentication", new Error("unauthorized"), { statusCode: 401 }, "authentication"],
    ["403 is authorization", new Error("forbidden"), { statusCode: 403 }, "authorization"],
    ["400 is invalid request", new Error("missing required field"), { statusCode: 400 }, "invalid_request"],
    ["400 context length is context length", new Error("maximum context length exceeded"), { statusCode: 400 }, "context_length"],
    ["500 is server", new Error("internal server error"), { statusCode: 500 }, "server"],
    ["502 is server", new Error("bad gateway"), { statusCode: 502 }, "server"],
    ["503 is overload", new Error("service unavailable"), { statusCode: 503 }, "overloaded"],
    ["504 is timeout", new Error("gateway timeout"), { statusCode: 504 }, "timeout"],
    ["429 is rate limit", new Error("too many requests"), { statusCode: 429 }, "rate_limit"],
    ["message overload", new Error("the provider is overloaded"), undefined, "overloaded"],
    ["message rate limit", new Error("rate limit exceeded"), undefined, "rate_limit"],
    ["message timeout", new Error("upstream timed out"), undefined, "timeout"],
    ["message auth", new Error("invalid api key"), undefined, "authentication"],
    ["network error", Object.assign(new TypeError("fetch failed"), { name: "TypeError" }), undefined, "network"]
  ];

  for (const [label, error, options, expected] of cases) {
    assert.equal(category(error, options).category, expected, label);
  }
});

test("provider error classifier reads narrow structured fields without returning payload text", () => {
  const secret = "do-not-return-this-request-payload";
  const classified = category(new Error("provider request failed"), {
    statusCode: 400,
    body: { error: { message: `context length exceeded: ${secret}`, code: "context_length_exceeded" } }
  });

  assert.deepEqual(classified, { category: "context_length", retryable: false, statusCode: 400 });
  assert.equal(JSON.stringify(classified).includes(secret), false);
});

test("network classification can be supplied by an adapter without exposing its cause", () => {
  const classified = category(new Error("secret network payload"), { network: true });
  assert.deepEqual(classified, { category: "network", retryable: true });
  assert.equal(JSON.stringify(classified).includes("secret network payload"), false);
});
