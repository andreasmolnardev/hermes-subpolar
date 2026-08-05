import type { ToolPolicy, ToolPolicySnapshot } from "data-layer/contracts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonSchema = boolean | { readonly [key: string]: JsonValue };

const TOOL_HANDLE_BRAND: unique symbol = Symbol("ToolHandle");

export type ToolHandle = {
  readonly [TOOL_HANDLE_BRAND]: true;
  readonly execute: (...args: readonly unknown[]) => unknown;
};

export type ToolExecutable =
  | { readonly handle: ToolHandle; readonly reference?: never }
  | { readonly reference: string; readonly handle?: never };

export type ToolCapabilityMetadata = readonly string[] | { readonly [key: string]: JsonValue };

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly source: string;
  readonly capabilities?: ToolCapabilityMetadata;
  readonly executable: ToolExecutable;
  readonly policy?: ToolPolicy;
  readonly disabled?: boolean;
  readonly enabled?: boolean;
};

export type ToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly policy: Exclude<ToolPolicy, "deny">;
  readonly source: string;
  readonly capabilities: ToolCapabilityMetadata;
  readonly executable: ToolExecutable;
};

export type ToolPolicyInput = ToolPolicySnapshot & {
  readonly disabled?: boolean;
};

export type ResolvedTool = {
  readonly name: string;
  readonly policy: Exclude<ToolPolicySnapshot["policy"], "deny">;
};

export const TOOL_POLICY_PRECEDENCE: readonly ToolPolicy[] = ["deny", "ask", "allow", "auto"];

export function createToolHandle(execute: (...args: readonly unknown[]) => unknown): ToolHandle {
  if (typeof execute !== "function") throw new TypeError("Tool handle must be callable");
  return Object.freeze({ [TOOL_HANDLE_BRAND]: true, execute });
}

const JSON_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(value: JsonValue, path: string): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`));

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = cloneJsonValue(item, `${path}.${key}`);
  }
  return result;
}

function validateJsonValue(value: unknown, path: string, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`Invalid JSON schema value at ${path}`);
  }
  if (typeof value !== "object") throw new Error(`Invalid JSON schema value at ${path}`);
  if (seen.has(value)) throw new Error(`Invalid JSON schema cycle at ${path}`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, seen));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) validateJsonValue(item, `${path}.${key}`, seen);
  } else {
    throw new Error(`Invalid JSON schema value at ${path}`);
  }
  seen.delete(value);
}

function validateSchemaValue(value: unknown, path: string): asserts value is JsonSchema {
  if (typeof value === "boolean") return;
  if (!isRecord(value)) throw new Error(`Invalid JSON schema at ${path}`);
  validateJsonValue(value, path);

  const type = value.type;
  if (type !== undefined) {
    const types = Array.isArray(type) ? type : [type];
    if (types.length === 0 || types.some(item => typeof item !== "string" || !JSON_SCHEMA_TYPES.has(item))) {
      throw new Error(`Invalid JSON schema type at ${path}.type`);
    }
  }

  const required = value.required;
  if (required !== undefined) {
    if (!Array.isArray(required) || required.some(item => typeof item !== "string")) {
      throw new Error(`Invalid JSON schema required at ${path}.required`);
    }
    if (new Set(required).size !== required.length) {
      throw new Error(`Invalid JSON schema required at ${path}.required`);
    }
  }

  for (const key of ["properties", "patternProperties", "dependentSchemas"]) {
    const propertySchemas = value[key];
    if (propertySchemas === undefined) continue;
    if (!isRecord(propertySchemas)) throw new Error(`Invalid JSON schema at ${path}.${key}`);
    for (const [property, schema] of Object.entries(propertySchemas)) {
      validateSchemaValue(schema, `${path}.${key}.${property}`);
    }
  }

  for (const key of [
    "additionalProperties",
    "additionalItems",
    "contains",
    "else",
    "if",
    "items",
    "not",
    "propertyNames",
    "then",
    "unevaluatedItems",
    "unevaluatedProperties"
  ]) {
    const nestedSchema = value[key];
    if (nestedSchema !== undefined) validateSchemaValue(nestedSchema, `${path}.${key}`);
  }

  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    const schemas = value[key];
    if (schemas === undefined) continue;
    if (!Array.isArray(schemas)) throw new Error(`Invalid JSON schema at ${path}.${key}`);
    schemas.forEach((schema, index) => validateSchemaValue(schema, `${path}.${key}[${index}]`));
  }

  if (value.enum !== undefined && !Array.isArray(value.enum)) {
    throw new Error(`Invalid JSON schema enum at ${path}.enum`);
  }
}

export function validateJsonSchema(schema: unknown, toolName = "tool"): JsonSchema {
  validateSchemaValue(schema, `tool ${JSON.stringify(toolName)}`);
  return cloneJsonValue(schema, `tool ${JSON.stringify(toolName)}`) as JsonSchema;
}

function cloneCapabilities(capabilities: ToolCapabilityMetadata | undefined, toolName: string): ToolCapabilityMetadata {
  if (capabilities === undefined) return {};
  if (Array.isArray(capabilities)) {
    if (capabilities.some(capability => typeof capability !== "string")) {
      throw new Error(`Invalid capability metadata for tool ${JSON.stringify(toolName)}`);
    }
    return [...capabilities];
  }
  if (!isRecord(capabilities)) throw new Error(`Invalid capability metadata for tool ${JSON.stringify(toolName)}`);
  return cloneJsonValue(capabilities as { readonly [key: string]: JsonValue }, `tool ${JSON.stringify(toolName)}.capabilities`) as {
    readonly [key: string]: JsonValue;
  };
}

function isToolHandle(value: unknown): value is ToolHandle {
  if (!isRecord(value)) return false;
  const branded = value as { readonly [TOOL_HANDLE_BRAND]?: unknown };
  return branded[TOOL_HANDLE_BRAND] === true && typeof value.execute === "function";
}

function validatePolicyPrecedence(precedence: readonly ToolPolicy[]): void {
  if (
    precedence.length !== TOOL_POLICY_PRECEDENCE.length ||
    new Set(precedence).size !== TOOL_POLICY_PRECEDENCE.length ||
    TOOL_POLICY_PRECEDENCE.some(policy => !precedence.includes(policy))
  ) {
    throw new Error("Invalid tool policy precedence: expected exact permutation of deny, ask, allow, auto");
  }
}

function validateDefinition(definition: ToolDefinition): void {
  if (typeof definition.name !== "string" || definition.name.length === 0) {
    throw new Error("Invalid tool descriptor name");
  }
  if (typeof definition.description !== "string") {
    throw new Error(`Invalid description for tool ${JSON.stringify(definition.name)}`);
  }
  if (typeof definition.source !== "string" || definition.source.length === 0) {
    throw new Error(`Invalid source for tool ${JSON.stringify(definition.name)}`);
  }
  const executable = definition.executable;
  if (!isRecord(executable)) throw new Error(`Missing executable for tool ${JSON.stringify(definition.name)}`);
  const hasHandle = "handle" in executable;
  const hasReference = "reference" in executable;
  if (hasHandle === hasReference) {
    throw new Error(`Invalid executable for tool ${JSON.stringify(definition.name)}`);
  }
  if (hasHandle && !isToolHandle(executable.handle)) {
    throw new Error(`Invalid executable for tool ${JSON.stringify(definition.name)}`);
  }
  if (hasReference && (typeof executable.reference !== "string" || executable.reference.length === 0)) {
    throw new Error(`Invalid executable for tool ${JSON.stringify(definition.name)}`);
  }
  validateJsonSchema(definition.inputSchema, definition.name);
}

function isToolPolicy(value: unknown): value is ToolPolicy {
  return value === "allow" || value === "ask" || value === "auto" || value === "deny";
}

function effectivePolicy(
  definition: ToolDefinition,
  policies: readonly ToolPolicyInput[],
  precedence: readonly ToolPolicy[]
): ToolPolicy | undefined {
  const matching = policies.filter(policy => policy.toolName === definition.name);
  if (matching.some(policy => policy.disabled === true)) return undefined;
  if (matching.some(policy => !isToolPolicy(policy.policy))) return undefined;
  if (definition.policy !== undefined && !isToolPolicy(definition.policy)) return undefined;

  const candidates = matching.length > 0 ? matching.map(policy => policy.policy) : definition.policy === undefined ? [] : [definition.policy];
  if (candidates.length === 0) return undefined;

  return candidates.reduce<ToolPolicy | undefined>((selected, candidate) => {
    if (selected === undefined) return candidate;
    return precedence.indexOf(candidate) < precedence.indexOf(selected) ? candidate : selected;
  }, undefined);
}

function copyDescriptor(
  definition: ToolDefinition,
  policy: Exclude<ToolPolicy, "deny">
): ToolDescriptor {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: validateJsonSchema(definition.inputSchema, definition.name),
    policy,
    source: definition.source,
    capabilities: cloneCapabilities(definition.capabilities, definition.name),
    executable: "handle" in definition.executable
      ? { handle: definition.executable.handle }
      : { reference: definition.executable.reference }
  };
}

export function resolveToolDescriptors(
  definitions: readonly ToolDefinition[],
  policies: readonly ToolPolicyInput[] = [],
  policyPrecedence: readonly ToolPolicy[] = TOOL_POLICY_PRECEDENCE
): readonly ToolDescriptor[] {
  validatePolicyPrecedence(policyPrecedence);
  const names = new Set<string>();
  for (const definition of definitions) {
    if (names.has(definition.name)) throw new Error(`Tool descriptor collision for ${JSON.stringify(definition.name)}`);
    names.add(definition.name);
  }

  const resolved: ToolDescriptor[] = [];
  for (const definition of definitions) {
    const policy = effectivePolicy(definition, policies, policyPrecedence);
    if (definition.disabled === true || definition.enabled === false || policy === undefined || policy === "deny") continue;
    validateDefinition(definition);
    resolved.push(copyDescriptor(definition, policy));
  }

  return resolved.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function resolveLegacyTools(snapshot: readonly ToolPolicyInput[]): readonly ResolvedTool[] {
  const byName = new Map<string, ToolPolicyInput[]>();
  for (const policy of snapshot) {
    if (typeof policy.toolName !== "string" || !isToolPolicy(policy.policy)) continue;
    const entries = byName.get(policy.toolName) ?? [];
    entries.push(policy);
    byName.set(policy.toolName, entries);
  }

  const resolved: ResolvedTool[] = [];
  for (const [name, entries] of byName) {
    if (entries.some(entry => entry.disabled === true)) continue;
    const policy = entries.reduce<ToolPolicy | undefined>((selected, entry) => {
      if (selected === undefined) return entry.policy;
      return TOOL_POLICY_PRECEDENCE.indexOf(entry.policy) < TOOL_POLICY_PRECEDENCE.indexOf(selected)
        ? entry.policy
        : selected;
    }, undefined);
    if (policy !== undefined && policy !== "deny") resolved.push({ name, policy });
  }
  return resolved.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

// Keep this overload for callers that already pass policy snapshots to the gateway.
export function resolveTools(
  definitions: readonly ToolDefinition[],
  policies?: readonly ToolPolicyInput[]
): readonly ToolDescriptor[];
export function resolveTools(snapshot: readonly ToolPolicySnapshot[]): readonly ResolvedTool[];
export function resolveTools(
  input: readonly (ToolDefinition | ToolPolicySnapshot)[],
  policies: readonly ToolPolicyInput[] = []
): readonly ToolDescriptor[] | readonly ResolvedTool[] {
  const first = input[0];
  if (first === undefined || "toolName" in first) {
    return resolveLegacyTools(input as readonly ToolPolicyInput[]);
  }
  return resolveToolDescriptors(input as readonly ToolDefinition[], policies);
}
