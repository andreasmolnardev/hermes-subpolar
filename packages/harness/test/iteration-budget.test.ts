import { assert } from "./assert.ts";

import { IterationBudget } from "../src/index.ts";

test("iteration budget tracks bounded counters and explicit exhaustion reasons", () => {
  const budget = new IterationBudget({
    maxTurns: 1,
    maxProviderCalls: 2,
    maxToolCalls: 1,
    maxTokens: 3
  });

  assert.equal(budget.remaining("turns"), 1);
  assert.equal(budget.consume("turns"), true);
  assert.equal(budget.consume("turns"), false);
  assert.equal(budget.exhaustionReason("turns"), "max_turns");
  assert.equal(budget.used("turns"), 1);
  assert.equal(budget.remaining("turns"), 0);

  assert.equal(budget.consume("providerCalls", 2), true);
  assert.equal(budget.tryConsume("providerCalls").reason, "max_provider_calls");
  assert.equal(budget.consume("toolCalls"), true);
  assert.equal(budget.tryConsume("toolCalls").reason, "max_tool_calls");
  assert.equal(budget.consume("tokens", 3), true);
  assert.equal(budget.tryConsume("tokens").reason, "max_tokens");
  assert.deepEqual(budget.snapshot(), {
    turns: 1,
    providerCalls: 2,
    toolCalls: 1,
    tokens: 3,
    remaining: { turns: 0, providerCalls: 0, toolCalls: 0, tokens: 0 }
  });
});

test("refund restores capacity without allowing counters below zero", () => {
  const budget = new IterationBudget({ maxTurns: 2, maxTokens: 5 });

  budget.consume("turns", 2);
  budget.refund("turns");
  assert.equal(budget.used("turns"), 1);
  assert.equal(budget.remaining("turns"), 1);
  assert.equal(budget.consume("turns"), true);
  budget.refund("turns", 10);
  assert.equal(budget.used("turns"), 0);

  budget.refund("tokens");
  assert.equal(budget.used("tokens"), 0);
});

test("synchronous updates remain deterministic when scheduled concurrently", async () => {
  const budget = new IterationBudget({ maxProviderCalls: 17 });
  const results = await Promise.all(
    Array.from({ length: 100 }, () => Promise.resolve(budget.consume("providerCalls")))
  );

  assert.equal(results.filter(Boolean).length, 17);
  assert.equal(budget.used("providerCalls"), 17);
  assert.equal(budget.remaining("providerCalls"), 0);
});
