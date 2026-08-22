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
  /** Stable authorization identity; defaults to the model-facing name. */
  readonly capabilityId?: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly source: string;
  /** Normalized integration inventory metadata; never contains credentials. */
  readonly integrationId?: string;
  readonly integrationName?: string;
  readonly integrationType?: string;
  readonly nativeName?: string;
  readonly displayName?: string;
  readonly capabilities?: ToolCapabilityMetadata;
  readonly executable: ToolExecutable;
  readonly policy?: ToolPolicy;
  readonly disabled?: boolean;
  readonly enabled?: boolean;
};

export type ToolDescriptor = {
  readonly name: string;
  readonly capabilityId: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly policy: Exclude<ToolPolicy, "deny">;
  readonly source: string;
  readonly integrationId?: string;
  readonly integrationName?: string;
  readonly integrationType?: string;
  readonly nativeName?: string;
  readonly displayName?: string;
  readonly capabilities: ToolCapabilityMetadata;
  readonly executable: ToolExecutable;
};

export type ToolPolicyInput = ToolPolicySnapshot & {
  readonly disabled?: boolean;
};

export type SchemaSanitizationOptions = {
  readonly stripPatternAndFormat?: boolean;
  readonly stripSlashEnum?: boolean;
};

export type ResolvedTool = {
  readonly name: string;
  readonly policy: Exclude<ToolPolicySnapshot["policy"], "deny">;
};

export type PermissionMode = "full" | "ask" | "read-only";
export type PermissionResolutionContext = {
  readonly userId: string;
  readonly sessionId: string;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly enabledCapabilityIds: readonly string[];
  readonly agentPolicies: readonly { readonly capabilityId: string; readonly policy: Exclude<ToolPolicy, "auto"> }[];
  readonly sessionMode?: PermissionMode;
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

function cloneUnknown(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneUnknown);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]));
}

const PROPERTY_KEY_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const PROPERTY_KEY_BAD_CHARS = /[^a-zA-Z0-9_.-]/g;

export function sanitizePropertyKey(key: string): string {
  const sanitized = key.replace(PROPERTY_KEY_BAD_CHARS, "_").slice(0, 64);
  return sanitized || "param";
}

function renamePropertyKeys(properties: Record<string, unknown>): Map<string, string> {
  const taken = new Set(Object.keys(properties).filter(key => PROPERTY_KEY_PATTERN.test(key)));
  const renames = new Map<string, string>();
  for (const key of Object.keys(properties)) {
    if (PROPERTY_KEY_PATTERN.test(key)) continue;
    const base = sanitizePropertyKey(key);
    let candidate = base;
    let suffixNumber = 2;
    while (taken.has(candidate)) {
      const suffix = `_${suffixNumber++}`;
      candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    }
    taken.add(candidate);
    renames.set(key, candidate);
  }
  return renames;
}

function isNullSchema(schema: unknown): boolean {
  return isRecord(schema) && schema.type === "null";
}

export function stripNullableUnions(schema: unknown, keepNullableHint = true): unknown {
  if (Array.isArray(schema)) return schema.map(item => stripNullableUnions(item, keepNullableHint));
  if (!isRecord(schema)) return schema;

  const stripped = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, stripNullableUnions(value, keepNullableHint)])
  ) as Record<string, unknown>;

  for (const key of ["anyOf", "oneOf"] as const) {
    const variants = stripped[key];
    if (!Array.isArray(variants)) continue;
    const nonNull = variants.filter(variant => !isNullSchema(variant));
    if (nonNull.length !== 1 || nonNull.length === variants.length) continue;

    const replacement = isRecord(nonNull[0])
      ? { ...nonNull[0] }
      : {};
    if (keepNullableHint && replacement.nullable === undefined) replacement.nullable = true;
    for (const metadataKey of ["title", "description", "default", "examples"] as const) {
      if (stripped[metadataKey] === undefined || replacement[metadataKey] !== undefined) continue;
      if (metadataKey === "default" && "$ref" in replacement) continue;
      replacement[metadataKey] = stripped[metadataKey];
    }
    return stripNullableUnions(replacement, keepNullableHint);
  }
  return stripped;
}

const TOP_LEVEL_FORBIDDEN_KEYS = ["allOf", "anyOf", "oneOf", "enum", "not"] as const;

function stripTopLevelCombinators(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema };
  for (const key of TOP_LEVEL_FORBIDDEN_KEYS) delete result[key];
  return result;
}

function stripRefSiblings(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripRefSiblings);
  if (!isRecord(schema)) return schema;
  const result = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, stripRefSiblings(value)])
  ) as Record<string, unknown>;
  if ("$ref" in result) delete result.default;
  return result;
}

function sanitizeSchemaNode(node: unknown): unknown {
  if (typeof node === "string") {
    if (node === "object") return { type: "object", properties: {} };
    if (JSON_SCHEMA_TYPES.has(node)) return { type: node };
    return { type: "object", properties: {} };
  }
  if (Array.isArray(node)) return node.map(sanitizeSchemaNode);
  if (!isRecord(node)) return node;

  const propertyRenames = isRecord(node.properties) ? renamePropertyKeys(node.properties) : new Map<string, string>();
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" && Array.isArray(value)) {
      const hasNull = value.includes("null");
      const nonNull = value.filter(item => typeof item === "string" && item !== "null");
      if (nonNull.length === 1) {
        entries.push(["type", nonNull[0]]);
        if (hasNull) entries.push(["nullable", true]);
      } else if (nonNull.length >= 2) {
        entries.push(["anyOf", nonNull.map(item => ({ type: item }))]);
        if (hasNull) entries.push(["nullable", true]);
      } else {
        entries.push(["type", hasNull ? "null" : "object"]);
      }
      continue;
    }

    if ((key === "properties" || key === "$defs" || key === "definitions") && isRecord(value)) {
      entries.push([key, Object.fromEntries(
        Object.entries(value).map(([subKey, subValue]) => [
          key === "properties" ? (propertyRenames.get(subKey) ?? subKey) : subKey,
          sanitizeSchemaNode(subValue)
        ])
      )]);
      continue;
    }

    if (key === "items" || key === "additionalProperties") {
      entries.push([key, typeof value === "boolean" ? value : sanitizeSchemaNode(value)]);
      continue;
    }

    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      entries.push([key, value.map(sanitizeSchemaNode)]);
      continue;
    }

    if (key === "required") {
      entries.push([key, Array.isArray(value)
        ? value.map(item => typeof item === "string" ? (propertyRenames.get(item) ?? item) : item)
        : cloneUnknown(value)]);
      continue;
    }

    if (key === "enum" || key === "examples" || key === "dependentRequired") {
      entries.push([key, cloneUnknown(value)]);
      continue;
    }

    entries.push([key, Array.isArray(value) || isRecord(value) ? sanitizeSchemaNode(value) : value]);
  }

  const result = Object.fromEntries(entries) as Record<string, unknown>;
  if (result.type === "object" && !isRecord(result.properties)) result.properties = {};
  if (result.type === "object" && Array.isArray(result.required) && isRecord(result.properties)) {
    const properties = result.properties;
    const valid = result.required.filter(item => typeof item === "string" && Object.hasOwn(properties, item));
    if (valid.length === 0) delete result.required;
    else if (valid.length !== result.required.length) result.required = valid;
  }
  return result;
}

function stripPatternAndFormatFromSchema(schema: unknown): [unknown, number] {
  let stripped = 0;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isRecord(node)) return node;
    const schemaNode = "type" in node || "anyOf" in node || "oneOf" in node || "allOf" in node;
    const result = Object.fromEntries(Object.entries(node).flatMap(([key, value]) => {
      if (schemaNode && (key === "pattern" || key === "format")) {
        stripped += 1;
        return [];
      }
      return [[key, walk(value)]];
    })) as Record<string, unknown>;
    return result;
  };
  return [walk(schema), stripped];
}

function stripSlashEnumsFromSchema(schema: unknown): [unknown, number] {
  let stripped = 0;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isRecord(node)) return node;
    const entries = Object.entries(node).flatMap(([key, value]) => {
      if (key === "enum" && Array.isArray(value) && value.some(item => typeof item === "string" && item.includes("/"))) {
        stripped += 1;
        return [];
      }
      return [[key, walk(value)]];
    });
    return Object.fromEntries(entries);
  };
  return [walk(schema), stripped];
}

export function sanitizeJsonSchema(schema: unknown, options: SchemaSanitizationOptions = {}): JsonSchema {
  if (typeof schema === "boolean") return schema;
  const sanitized = sanitizeSchemaNode(schema);
  if (!isRecord(sanitized)) return { type: "object", properties: {} };

  const top = { ...sanitized };
  if (top.type !== "object") top.type = "object";
  if (!isRecord(top.properties)) top.properties = {};
  let result: unknown = stripNullableUnions(top);
  if (!isRecord(result)) result = { type: "object", properties: {} };
  result = stripTopLevelCombinators(result as Record<string, unknown>);
  result = stripRefSiblings(result);
  if (options.stripPatternAndFormat) [result] = stripPatternAndFormatFromSchema(result);
  if (options.stripSlashEnum) [result] = stripSlashEnumsFromSchema(result);
  return result as JsonSchema;
}

type ProviderTool = Record<string, unknown>;

function parameterSchema(tool: ProviderTool): { owner: ProviderTool; key: "parameters" } | undefined {
  const fn = isRecord(tool.function) ? tool.function : undefined;
  if (fn !== undefined) return { owner: fn, key: "parameters" };
  if ("parameters" in tool) return { owner: tool, key: "parameters" };
  return undefined;
}

export function sanitizeToolSchemas(
  tools: readonly ProviderTool[],
  options: SchemaSanitizationOptions = {}
): ProviderTool[] {
  return tools.map(tool => {
    const result = cloneUnknown(tool) as ProviderTool;
    const target = parameterSchema(result);
    if (target === undefined) return result;
    const params = target.owner[target.key];
    target.owner[target.key] = isRecord(params)
      ? sanitizeJsonSchema(params, options)
      : { type: "object", properties: {} };
    return result;
  });
}

function toolParameterSchemas(tools: readonly ProviderTool[]): ProviderTool[] {
  return tools.map(tool => cloneUnknown(tool) as ProviderTool);
}

export function stripPatternAndFormat(tools: readonly ProviderTool[]): readonly [ProviderTool[], number] {
  const result = toolParameterSchemas(tools);
  let stripped = 0;
  for (const tool of result) {
    const target = parameterSchema(tool);
    const params = target?.owner[target.key];
    if (target === undefined || !isRecord(params)) continue;
    const [sanitized, count] = stripPatternAndFormatFromSchema(params);
    target.owner[target.key] = sanitized;
    stripped += count;
  }
  return [result, stripped];
}

export function stripSlashEnum(tools: readonly ProviderTool[]): readonly [ProviderTool[], number] {
  const result = toolParameterSchemas(tools);
  let stripped = 0;
  for (const tool of result) {
    const target = parameterSchema(tool);
    const params = target?.owner[target.key];
    if (target === undefined || !isRecord(params)) continue;
    const [sanitized, count] = stripSlashEnumsFromSchema(params);
    target.owner[target.key] = sanitized;
    stripped += count;
  }
  return [result, stripped];
}

export function unrenameToolArgs(paramsSchema: unknown, args: unknown): unknown {
  if (!isRecord(paramsSchema) || !isRecord(args) || !isRecord(paramsSchema.properties)) return args;
  const properties = paramsSchema.properties;
  const renames = renamePropertyKeys(properties);
  const reverse = new Map([...renames].map(([original, sanitized]) => [sanitized, original]));
  return Object.fromEntries(Object.entries(args).map(([key, value]) => {
    const original = reverse.get(key) ?? key;
    const subschema = Object.hasOwn(properties, original) ? properties[original] : undefined;
    let unrenamed = value;
    if (isRecord(subschema) && isRecord(value)) unrenamed = unrenameToolArgs(subschema, value);
    else if (isRecord(subschema) && Array.isArray(value) && isRecord(subschema.items)) {
      unrenamed = value.map(item => isRecord(item) ? unrenameToolArgs(subschema.items, item) : item);
    }
    return [original, unrenamed];
  }));
}

function schemaHasRenamedProperties(schema: unknown, seen = new Set<object>()): boolean {
  if (!isRecord(schema) || seen.has(schema)) return false;
  seen.add(schema);
  if (isRecord(schema.properties)) {
    if (renamePropertyKeys(schema.properties).size > 0) return true;
    if (Object.values(schema.properties).some(value => schemaHasRenamedProperties(value, seen))) return true;
  }
  for (const key of ["$defs", "definitions", "patternProperties", "dependentSchemas"] as const) {
    if (isRecord(schema[key]) && Object.values(schema[key]).some(value => schemaHasRenamedProperties(value, seen))) return true;
  }
  for (const key of ["additionalProperties", "additionalItems", "contains", "else", "if", "items", "not", "propertyNames", "then", "unevaluatedItems", "unevaluatedProperties"] as const) {
    if (schemaHasRenamedProperties(schema[key], seen)) return true;
  }
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
    if (Array.isArray(schema[key]) && schema[key].some(value => schemaHasRenamedProperties(value, seen))) return true;
  }
  return false;
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
  const originalSchema = validateJsonSchema(definition.inputSchema, definition.name);
  let executable: ToolExecutable;
  if ("handle" in definition.executable) {
    const originalHandle = definition.executable.handle;
    executable = schemaHasRenamedProperties(originalSchema)
      ? {
        handle: createToolHandle((...args: readonly unknown[]) => {
          if (args.length === 0) return originalHandle.execute();
          const [input, ...rest] = args;
          return originalHandle.execute(unrenameToolArgs(originalSchema, input), ...rest);
        })
      }
      : { handle: originalHandle };
  } else {
    executable = { reference: definition.executable.reference };
  }
  return {
    name: definition.name,
    capabilityId: definition.capabilityId ?? definition.name,
    description: definition.description,
    inputSchema: sanitizeJsonSchema(originalSchema),
    policy,
    source: definition.source,
    ...(definition.integrationId === undefined ? {} : { integrationId: definition.integrationId }),
    ...(definition.integrationName === undefined ? {} : { integrationName: definition.integrationName }),
    ...(definition.integrationType === undefined ? {} : { integrationType: definition.integrationType }),
    ...(definition.nativeName === undefined ? {} : { nativeName: definition.nativeName }),
    ...(definition.displayName === undefined ? {} : { displayName: definition.displayName }),
    capabilities: cloneCapabilities(definition.capabilities, definition.name),
    executable
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

export function resolveAgentToolDescriptors(
  definitions: readonly ToolDefinition[],
  context: PermissionResolutionContext,
): readonly ToolDescriptor[] {
  const enabled = new Set(context.enabledCapabilityIds);
  const policies = new Map(context.agentPolicies.map(item => [item.capabilityId, item.policy]));
  const overrides: ToolPolicyInput[] = [];
  for (const definition of definitions) {
    const capabilityId = definition.capabilityId ?? definition.name;
    if (!enabled.has(capabilityId)) {
      overrides.push({ toolName: definition.name, policy: "deny" });
      continue;
    }
    const configured = policies.get(capabilityId);
    // A definition-level deny is authoritative (system/admin policy).
    let policy: ToolPolicy = definition.policy === "deny" ? "deny" : configured ?? definition.policy ?? "deny";
    const mutating = isMutatingCapability(capabilityId, definition);
    if (context.sessionMode === "read-only" && mutating) policy = "deny";
    else if (context.sessionMode === "ask" && policy === "allow" && mutating) policy = "ask";
    else if (context.sessionMode === "full" && policy === "ask" && configured !== "deny") policy = "allow";
    overrides.push({ toolName: definition.name, policy });
  }
  return resolveToolDescriptors(definitions, overrides);
}

function isMutatingCapability(capabilityId: string, definition: ToolDefinition): boolean {
  if (/\.(write|delete|push|execute)$/.test(capabilityId)) return true;
  const capabilities = definition.capabilities;
  return !Array.isArray(capabilities) && isRecord(capabilities) && capabilities.mutating === true;
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
