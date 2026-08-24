import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createToolHandle,
  resolveAgentToolDescriptors,
  type ToolDefinition,
} from "../src/index.ts";

function definition(name: string, capabilityId: string, integrationId: string): ToolDefinition {
  return {
    name,
    capabilityId,
    description: name,
    inputSchema: { type: "object", properties: {} },
    source: "test:integration",
    integrationId,
    executable: { handle: createToolHandle(() => "should not execute") },
    policy: "allow",
  };
}

test("agent resolution hides unauthorized integrations and capabilities from Pi", () => {
  const resolved = resolveAgentToolDescriptors([
    definition("github.issue.create", "integration:github:create_issue", "github"),
    definition("homeassistant.turn_on", "integration:homeassistant:turn_on", "homeassistant"),
    definition("filesystem.read", "filesystem.read", "native-filesystem"),
  ], {
    userId: "user-1",
    sessionId: "run-1",
    projectId: "project-a",
    agentId: "agent-a",
    enabledCapabilityIds: ["integration:github:create_issue"],
    agentPolicies: [{ capabilityId: "integration:github:create_issue", policy: "allow" }],
  });

  assert.deepEqual(resolved.map((tool) => tool.name), ["github.issue.create"]);
  assert.equal(resolved.some((tool) => tool.integrationId === "homeassistant"), false);
  assert.equal(resolved.some((tool) => tool.capabilityId === "filesystem.read"), false);
});

test("revoking a capability produces a new empty resolution and cannot reuse a stale descriptor", () => {
  const tools = [definition("dangerous.execute", "integration:dangerous:execute", "dangerous")];
  const granted = resolveAgentToolDescriptors(tools, {
    userId: "user-1",
    sessionId: "run-1",
    enabledCapabilityIds: ["integration:dangerous:execute"],
    agentPolicies: [{ capabilityId: "integration:dangerous:execute", policy: "allow" }],
  });
  const revoked = resolveAgentToolDescriptors(tools, {
    userId: "user-1",
    sessionId: "run-2",
    enabledCapabilityIds: [],
    agentPolicies: [],
  });

  assert.equal(granted.length, 1);
  assert.deepEqual(revoked, []);
  assert.notEqual(granted, revoked);
});
