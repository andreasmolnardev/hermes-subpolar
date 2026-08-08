import { assert } from "./assert.ts";

import {
  HARNESS_PROMPT_SECTION_ORDER,
  HarnessUnsupportedContextSourceError,
  assembleHarnessContext,
  createHarnessContextAssembler,
  type HarnessContext,
  type HarnessMessage
} from "../src/index.ts";

function context(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    requestId: "request-1",
    sessionId: "session-1",
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    signal: new AbortController().signal,
    ...overrides
  };
}

const sources = [
  { kind: "turn" as const, content: "turn", sessionId: "session-1" },
  { kind: "instructions" as const, content: "instructions" },
  { kind: "session" as const, content: "session", sessionId: "session-1" },
  { kind: "workspace" as const, content: "workspace", workspaceId: "workspace-1" },
  { kind: "tool-guidance" as const, content: "tools" },
  { kind: "identity" as const, content: "identity" }
];

test("prompt sections are emitted in the fixed TypeScript order", () => {
  const result = assembleHarnessContext(context({ workspaceId: "workspace-1" }), { sources });

  assert.deepEqual(result.sections.map(section => section.name), [...HARNESS_PROMPT_SECTION_ORDER]);
  assert.deepEqual(result.sections.map(section => section.content.match(/name="([^"]+)/)?.[1]), [
    "identity",
    "tool-guidance",
    "workspace",
    "session",
    "instructions",
    "turn"
  ]);
  assert.deepEqual(result.messages.map(message => message.role), ["system", "user"]);
});

test("equivalent turns produce byte-identical prompt serialization", () => {
  const options = { sources: sources.map(source => ({ ...source, content: source.content.replace("turn", "same") })) };
  const first = assembleHarnessContext(context({ workspaceId: "workspace-1", requestId: "request-a" }), options);
  const second = assembleHarnessContext(context({ workspaceId: "workspace-1", requestId: "request-b" }), options);

  assert.equal(first.serialized, second.serialized);
  assert.equal(first.byteLength, second.byteLength);
  assert.deepEqual(first.cache, second.cache);
});

test("cache markers describe the stable prefix only when caching is enabled", () => {
  const enabled = assembleHarnessContext(context({ workspaceId: "workspace-1" }), { sources, cache: true });
  const disabled = assembleHarnessContext(context({ workspaceId: "workspace-1" }), { sources, cache: false });

  assert.equal(enabled.cache.enabled, true);
  assert.equal(enabled.cache.markers.length, 2);
  assert.equal(enabled.cache.markers[0]?.byteOffset, 0);
  assert.equal(enabled.cache.markers[0]?.section, "identity");
  assert.equal(enabled.cache.markers[1]?.section, "tool-guidance");
  assert.equal(enabled.cache.markers[1]?.byteOffset, enabled.cache.prefixEndByte);
  assert.deepEqual(disabled.cache, { enabled: false, prefixEndByte: undefined, markers: [] });
});

test("byte and token budgets truncate without exceeding the smaller bound", () => {
  const result = assembleHarnessContext(context(), {
    sources: [
      { kind: "identity", content: "😀".repeat(100) },
      { kind: "turn", content: "tail", sessionId: "session-1" }
    ],
    budget: { maxBytes: 100, maxTokens: 25, bytesPerToken: 4 }
  });

  assert.ok(result.byteLength <= 100);
  assert.ok(result.estimatedTokens <= 25);
  assert.equal(result.sections[0]?.truncated, true);
  assert.equal(result.sections.length, 1);
});

test("session and workspace sources cannot leak across scopes", () => {
  assert.throws(
    () => assembleHarnessContext(context({ workspaceId: "workspace-1" }), {
      sources: [{ kind: "session", content: "private", sessionId: "session-2" }]
    }),
    /another session/
  );
  assert.throws(
    () => assembleHarnessContext(context({ workspaceId: "workspace-1" }), {
      sources: [{ kind: "workspace", content: "private", workspaceId: "workspace-2" }]
    }),
    /another workspace/
  );
});

test("unsupported sources expose a typed terminal error", () => {
  assert.throws(
    () => assembleHarnessContext(context(), {
      sources: [{ kind: "memory", content: "not supported" }]
    }),
    (error: unknown) => {
      assert.ok(error instanceof HarnessUnsupportedContextSourceError);
      assert.equal(error.reason, "unsupported-context-source");
      assert.equal(error.sourceKind, "memory");
      return true;
    }
  );
});

test("caller-provided assembled messages remain unchanged through the seam", async () => {
  const assembled: readonly HarnessMessage[] = [
    { role: "system", content: "caller assembled" },
    { role: "user", content: "hello" }
  ];
  const assembler = createHarnessContextAssembler({
    sources: [{ kind: "identity", content: "must not replace caller prompt" }]
  });
  const result = await assembler(context({ messages: assembled }));

  assert.strictEqual(result, assembled);
  assert.deepEqual(result, assembled);
});
