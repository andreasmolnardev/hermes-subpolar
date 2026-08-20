import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createToolHandle,
  resolveToolDescriptors,
  resolveAgentToolDescriptors,
  resolveTools,
  sanitizeJsonSchema,
  sanitizeToolSchemas,
  stripPatternAndFormat,
  stripSlashEnum,
  unrenameToolArgs,
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

test("agent resolution denies unassigned tools and tightens mutating tools", () => {
  const definitions = [
    tool("shell.read"),
    tool("shell.execute"),
  ];
  const resolved = resolveAgentToolDescriptors(definitions, {
    enabledCapabilityIds: ["shell.execute"],
    agentPolicies: [{ capabilityId: "shell.execute", policy: "allow" }],
    sessionMode: "ask",
  });
  assert.deepEqual(resolved.map(item => [item.name, item.policy]), [["shell.execute", "ask"]]);
  assert.deepEqual(resolveAgentToolDescriptors(definitions, {
    enabledCapabilityIds: ["shell.execute"],
    agentPolicies: [{ capabilityId: "shell.execute", policy: "allow" }],
    sessionMode: "read-only",
  }), []);
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

test("resolveTools orders concrete callers deterministically", () => {
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

test("sanitizes nullable unions and strict top-level schema keywords without mutation", () => {
  const schema = {
    type: "object",
    properties: {
      optional: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "optional value",
        default: null
      },
      reference: { $ref: "#/$defs/Reference", default: null }
    },
    anyOf: [{ type: "object" }, { type: "string" }],
    allOf: [{ required: ["optional"] }],
    oneOf: [{ type: "object" }, { type: "string" }],
    enum: ["discarded"],
    not: { type: "null" },
    $defs: { Reference: { type: "string" } }
  } as const;
  const before = structuredClone(schema);

  const sanitized = sanitizeJsonSchema(schema);
  assert.deepEqual(schema, before);
  assert.deepEqual(sanitized, {
    type: "object",
    properties: {
      optional: {
        type: "string",
        nullable: true,
        description: "optional value",
        default: null
      },
      reference: { $ref: "#/$defs/Reference" }
    },
    $defs: { Reference: { type: "string" } }
  });
});

test("normalizes property keys and required values deterministically", () => {
  const schema = {
    type: "object",
    properties: {
      "a_": { type: "string" },
      "a~": { type: "string" },
      "nested key": {
        type: "object",
        properties: { "deep/key": { type: "string" } },
        required: ["deep/key"]
      },
      values: {
        type: "array",
        items: {
          type: "object",
          properties: { "item key": { type: "string" } },
          required: ["item key"]
        }
      }
    },
    required: ["a~", "nested key", "missing"]
  } as const;

  const sanitized = sanitizeJsonSchema(schema);
  assert.deepEqual(Object.keys(sanitized.properties as Record<string, unknown>), [
    "a_",
    "a__2",
    "nested_key",
    "values"
  ]);
  const properties = sanitized.properties as Record<string, any>;
  assert.deepEqual(sanitized.required, ["a__2", "nested_key"]);
  assert.deepEqual(properties.nested_key.required, ["deep_key"]);
  assert.ok(properties.values.items.properties["item_key"]);

  const args = {
    a__2: "first",
    nested_key: { deep_key: "second" },
    values: [{ item_key: "third" }]
  };
  assert.deepEqual(unrenameToolArgs(schema, args), {
    "a~": "first",
    "nested key": { "deep/key": "second" },
    values: [{ "item key": "third" }]
  });
  assert.deepEqual(schema.required, ["a~", "nested key", "missing"]);
});

test("sanitizes malformed schema fragments and preserves meaningful type branches", () => {
  const sanitized = sanitizeJsonSchema({
    type: "object",
    properties: {
      payload: "object",
      value: { type: ["number", "string"] },
      maybe: { type: ["string", "null"] },
      nullValue: { type: ["null"] }
    }
  });
  const properties = sanitized.properties as Record<string, any>;
  assert.deepEqual(properties.payload, { type: "object", properties: {} });
  assert.deepEqual(properties.value, {
    anyOf: [{ type: "number" }, { type: "string" }]
  });
  assert.deepEqual(properties.maybe, { type: "string", nullable: true });
  assert.deepEqual(properties.nullValue, { type: "null" });
});

test("recovery strippers are pure and do not strip literal property names", () => {
  const tools = [
    {
      type: "function",
      function: {
        name: "search",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", pattern: "^[a-z]+$" },
            query: { type: "string", format: "date-time" },
            model: { type: "string", enum: ["Qwen/Qwen3.5", "safe"] }
          }
        }
      }
    },
    {
      type: "function",
      name: "get_time",
      parameters: {
        type: "object",
        properties: { timezone: { type: "string", format: "date-time" } }
      }
    }
  ] as const;
  const before = structuredClone(tools);

  const [withoutPattern, patternCount] = stripPatternAndFormat(tools);
  assert.equal(patternCount, 3);
  assert.deepEqual(tools, before);
  const firstProperties = (withoutPattern[0].function as any).parameters.properties;
  assert.ok(firstProperties.pattern);
  assert.equal(firstProperties.pattern.pattern, undefined);
  assert.equal(firstProperties.query.format, undefined);
  assert.equal((withoutPattern[1] as any).parameters.properties.timezone.format, undefined);

  const [withoutSlash, slashCount] = stripSlashEnum(tools);
  assert.equal(slashCount, 1);
  assert.deepEqual(tools, before);
  assert.equal((withoutSlash[0].function as any).parameters.properties.model.enum, undefined);

  const sanitizedTools = sanitizeToolSchemas([
    ...tools,
    { type: "function", function: { name: "empty" } }
  ], { stripPatternAndFormat: true, stripSlashEnum: true });
  assert.equal((sanitizedTools[0].function as any).parameters.properties.query.format, undefined);
  assert.equal((sanitizedTools[0].function as any).parameters.properties.model.enum, undefined);
  assert.deepEqual((sanitizedTools[2].function as any).parameters, { type: "object", properties: {} });
  assert.deepEqual(tools, before);
});

test("resolver exposes sanitized schemas and reverses renamed arguments before handle execution", () => {
  let received: unknown;
  const handle = createToolHandle((args: unknown) => {
    received = args;
    return "ok";
  });
  const inputSchema = {
    type: "object",
    properties: { "query~neq": { type: "string" } },
    required: ["query~neq"]
  } as const;

  const [resolved] = resolveToolDescriptors([tool("renamed", {
    inputSchema,
    executable: { handle }
  })]);
  assert.ok(resolved && "handle" in resolved.executable);
  assert.deepEqual((resolved?.inputSchema as any).properties, { query_neq: { type: "string" } });
  assert.deepEqual((resolved?.inputSchema as any).required, ["query_neq"]);
  assert.notEqual(resolved?.executable.handle, handle);
  resolved?.executable.handle.execute({ query_neq: "value" });
  assert.deepEqual(received, { "query~neq": "value" });
  assert.deepEqual(inputSchema.properties, { "query~neq": { type: "string" } });
});
