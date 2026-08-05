import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createToolHandle,
  resolveToolDescriptors,
  resolveTools,
  type ToolDefinition,
  type ToolPolicyInput
} from "../src/index.ts";

const schema = { type: "object", properties: { value: { type: "string" } } } as const;

function tool(name: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: schema,
    source: "test",
    capabilities: { network: false },
    executable: { reference: `test://${name}` },
    policy: "allow",
    ...overrides
  };
}

test("resolves complete descriptors in stable order without executing or mutating inputs", () => {
  let executed = false;
  const definitions = [
    tool("z.tool", {
      inputSchema: { type: "object", properties: { nested: { type: "string" } } },
      capabilities: ["filesystem"],
      executable: { handle: createToolHandle(() => { executed = true; }) }
    }),
    tool("a.tool")
  ] as const;
  const policies = [{ toolName: "z.tool", policy: "auto" as const }] as const;
  const definitionsBefore = structuredClone(definitions[0].inputSchema);
  const policiesBefore = structuredClone(policies);

  const resolved = resolveToolDescriptors(definitions, policies);

  assert.deepEqual(resolved.map(item => item.name), ["a.tool", "z.tool"]);
  const zTool = resolved[1];
  assert.ok(zTool && "handle" in zTool.executable);
  assert.equal(zTool.policy, "auto");
  assert.equal(typeof zTool.executable.handle.execute, "function");
  assert.equal(executed, false);
  assert.deepEqual(definitions[0].inputSchema, definitionsBefore);
  assert.deepEqual(policies, policiesBefore);
});

test("rejects descriptor name collisions", () => {
  assert.throws(
    () => resolveToolDescriptors([tool("same"), tool("same")]),
    /collision/
  );
});

test("rejects invalid JSON schemas", () => {
  assert.throws(
    () => resolveToolDescriptors([tool("bad", { inputSchema: { type: "not-a-schema" } })]),
    /Invalid JSON schema/
  );
});

test("filters denied and disabled tools fail-closed", () => {
  const policies: readonly ToolPolicyInput[] = [
    { toolName: "denied", policy: "deny" },
    { toolName: "disabled", policy: "allow", disabled: true },
    { toolName: "unknown", policy: "allow" }
  ];

  assert.deepEqual(resolveToolDescriptors([
    tool("denied"),
    tool("disabled"),
    tool("unknown-policy", { policy: undefined })
  ], policies), []);
});

test("uses restrictive policy precedence independent of input order", () => {
  const policies: readonly ToolPolicyInput[] = [
    { toolName: "one", policy: "allow" },
    { toolName: "one", policy: "deny" },
    { toolName: "two", policy: "auto" },
    { toolName: "two", policy: "ask" }
  ];

  const resolved = resolveToolDescriptors([tool("one"), tool("two")], policies);

  assert.deepEqual(resolved.map(item => [item.name, item.policy]), [["two", "ask"]]);
});

test("rejects incomplete or invalid policy precedence before reducing policies", () => {
  const policies = [
    { toolName: "target", policy: "deny" as const },
    { toolName: "target", policy: "allow" as const }
  ];

  for (const precedence of [
    ["deny", "ask", "allow"],
    ["deny", "ask", "allow", "allow"],
    ["ask", "allow", "auto", "unknown"]
  ]) {
    assert.throws(
      () => resolveToolDescriptors([tool("target")], policies, precedence as never),
      /Invalid tool policy precedence/
    );
  }
});

test("does not accept arbitrary executable handles", () => {
  for (const executable of [
    { handle: (() => undefined) as never },
    { handle: (() => undefined) as never, reference: "test://bypass" }
  ]) {
    assert.throws(
      () => resolveToolDescriptors([tool("untrusted", { executable })]),
      /Invalid executable/
    );
  }
});

test("accepts explicitly branded handles without executing them", () => {
  let executed = false;
  const handle = createToolHandle(() => { executed = true; });
  const [resolved] = resolveToolDescriptors([tool("trusted", { executable: { handle } })]);

  assert.ok(resolved && "handle" in resolved.executable);
  assert.equal(resolved.executable.handle, handle);
  assert.equal(executed, false);
});

test("legacy resolveTools keeps concrete callers compatible and orders results", () => {
  const snapshot = [
    { toolName: "z.tool", policy: "allow" as const },
    { toolName: "a.tool", policy: "auto" as const },
    { toolName: "z.tool", policy: "deny" as const }
  ];

  assert.deepEqual(resolveTools(snapshot), [{ name: "a.tool", policy: "auto" }]);
  assert.deepEqual(snapshot, [
    { toolName: "z.tool", policy: "allow" },
    { toolName: "a.tool", policy: "auto" },
    { toolName: "z.tool", policy: "deny" }
  ]);
});
