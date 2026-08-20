import { expect, test } from "vitest";

import { MODEL_PROVIDER_CATALOG, modelProvider } from "./model-providers";

test("provider catalog advertises only the supported OpenAI-compatible provider", () => {
  expect(MODEL_PROVIDER_CATALOG).toEqual([{
    slug: "openai-api",
    label: "OpenAI API",
    description: "OpenAI API",
    authType: "api_key",
    baseUrl: "https://api.openai.com/v1"
  }]);
  expect(modelProvider("openai-api")).toEqual(MODEL_PROVIDER_CATALOG[0]);
});

test("unsupported provider names fail closed at catalog lookup", () => {
  for (const slug of ["anthropic", "openrouter", "openai-codex", "moa", "copilot-acp", "not-a-provider"]) {
    expect(modelProvider(slug), slug).toBeUndefined();
  }
});
