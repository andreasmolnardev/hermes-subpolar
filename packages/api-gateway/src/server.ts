import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createGateway, createGatewayPersistenceAdapter, type GatewayProtocolEvent } from "./index";
import { type ChatProvider, type ProviderContent, type ProviderMessage } from "chat-provider-interface";
import {
  AuthenticationError,
  IdempotencyConflictError,
  OwnershipError,
  SQLiteIdentityRepository,
  SQLiteSessionRepository,
  type JsonValue,
  type AuthenticatedPrincipal,
  type AuthSession,
  type SessionRecord,
  type AgentConfigurationInput,
  type IntegrationInput,
  type SkillInput,
  type PromptCommandInput,
  type ProjectInput,
  type GitCredentialInput,
  type AutomationInput,
  type AutomationPermissionMode,
} from "data-layer";
import { assembleHarnessContext, type HarnessApprovalPolicy, type HarnessContextAssembler } from "harness";
import { resolveAgentToolDescriptors, type PermissionMode, type ToolDefinition, type ToolPolicyInput } from "tool-resolver";
import { serveStatic } from "./static";
import { modelProvider } from "@hermes/shared/model-providers";
import { createProvider, listProviderModels, listProviderProfiles, resolveProvider } from "./provider-runtime";
import { IntegrationManager } from "./integrations";
import { cloneRepository, createEmptyWorkspace, createNativeGitTools, gitBranches, gitDiff, gitStatus, validateExistingWorkspace, validateRuntimeWorkspace } from "./git";
import {
  beginDeviceOAuth,
  beginProviderOAuth,
  completeDeviceOAuth,
  completeProviderOAuth,
  refreshProviderCredential,
  resolveAwsCredential,
  resolveGcpCredential
} from "./provider-auth";
import { AutomationRunError, AutomationScheduler, nextAutomationRun, normalizeAutomationSchedule } from "./automation";

export type ApiGatewayServerOptions = {
  readonly provider?: ChatProvider;
  readonly hostname?: string;
  readonly port?: number;
  readonly staticRoot?: string;
  readonly maxRequestBytes?: number;
  readonly dataDir?: string;
  readonly workspaceRoot?: string;
  readonly shutdownTimeoutMs?: number;
  readonly toolDefinitions?: readonly ToolDefinition[];
  readonly toolPolicyOverrides?: readonly ToolPolicyInput[];
  readonly approvalPolicy?: HarnessApprovalPolicy;
  readonly automationPollMs?: number;
};

export type ApiGatewayServer = ReturnType<typeof Bun.serve> & {
  shutdown(): Promise<void>;
};

type WebSocketData = { readonly principal: AuthenticatedPrincipal; readonly token: string };
type TurnInput = { readonly model: string; readonly messages: readonly ProviderMessage[]; readonly sessionId?: string; readonly projectId?: string; readonly agentId?: string; readonly requestId?: string; readonly permissionMode?: PermissionMode; readonly reasoningEffort?: "low" | "medium" | "high" };

const SESSION_COOKIE = "subpolar_session";
const CSRF_COOKIE = "subpolar_csrf";
const CHAT_REQUEST_FIELDS = new Set(["model", "messages", "sessionId", "projectId", "agentId", "requestId", "permissionMode", "reasoningEffort", "stream"]);

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

function parseCookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    try {
      result.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
    } catch {
      // Ignore malformed cookies and let authentication fail closed.
    }
  }
  return result;
}

function cookie(name: string, value: string, request: Request, maxAge = 604800, httpOnly = true): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure}`;
}

function authHeaders(request: Request, session: AuthSession): Headers {
  const headers = new Headers();
  headers.append("set-cookie", cookie(SESSION_COOKIE, session.token, request));
  headers.append("set-cookie", cookie(CSRF_COOKIE, session.csrfToken, request, 604800, false));
  return headers;
}

function clearAuthHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.append("set-cookie", cookie(SESSION_COOKIE, "", request, 0));
  headers.append("set-cookie", cookie(CSRF_COOKIE, "", request, 0, false));
  return headers;
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function parseMessages(value: unknown): readonly ProviderMessage[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("messages must be a non-empty array");
  return value.map(message => {
    if (typeof message !== "object" || message === null || Array.isArray(message)) throw new TypeError("message must be an object");
    const record = message as Record<string, unknown>;
    if ((record.role !== "system" && record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") {
      throw new TypeError("message role and content are invalid");
    }
    return { role: record.role, content: record.content };
  });
}

function turnInput(value: unknown): TurnInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("request body must be an object");
  const body = value as Record<string, unknown>;
  const unsupported = Object.keys(body).find(field => !CHAT_REQUEST_FIELDS.has(field));
  if (unsupported !== undefined) throw new TypeError(`Gateway field is unsupported: ${unsupported}`);
  if (typeof body.model !== "string" || !body.model.trim()) throw new TypeError("model must be a non-empty string");
  const stringField = (key: string): string | undefined => body[key] === undefined ? undefined : typeof body[key] === "string" && body[key] ? body[key] : (() => { throw new TypeError(`${key} is invalid`); })();
  const sessionId = stringField("sessionId");
  const projectId = stringField("projectId");
  const agentId = stringField("agentId");
  const requestId = stringField("requestId");
  const permissionMode = body.permissionMode === undefined ? undefined : ["full", "ask", "read-only"].includes(String(body.permissionMode)) ? body.permissionMode as PermissionMode : (() => { throw new TypeError("permissionMode is invalid"); })();
  const reasoningEffort = body.reasoningEffort === undefined ? undefined : ["low", "medium", "high"].includes(String(body.reasoningEffort)) ? body.reasoningEffort as "low" | "medium" | "high" : (() => { throw new TypeError("reasoningEffort is invalid"); })();
  return {
    model: body.model,
    messages: parseMessages(body.messages),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  };
}

function parseAgentUpdate(value: unknown): AgentConfigurationInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("agent update must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "description", "icon", "instructions", "model", "reasoningEffort", "capabilities", "permissions", "skillIds"]);
  const unsupported = Object.keys(record).find(key => !allowed.has(key));
  if (unsupported !== undefined) throw new TypeError("agent field is unsupported");
  const optionalString = (key: string, max: number): string | undefined => {
    if (record[key] === undefined) return undefined;
    if (typeof record[key] !== "string" || record[key].length > max) throw new TypeError("agent string field is invalid");
    return record[key];
  };
  const optionalNullableString = (key: string, max: number): string | null | undefined => {
    if (record[key] === undefined) return undefined;
    if (record[key] === null) return null;
    if (typeof record[key] !== "string" || record[key].length > max) throw new TypeError("agent string field is invalid");
    return record[key];
  };
  const capabilities = record.capabilities === undefined ? undefined : (() => {
    if (!Array.isArray(record.capabilities)) throw new TypeError("capabilities are invalid");
    return record.capabilities.map(item => {
      if (typeof item !== "object" || item === null || Array.isArray(item) || typeof (item as Record<string, unknown>).capabilityId !== "string" || typeof (item as Record<string, unknown>).enabled !== "boolean") throw new TypeError("capability assignment is invalid");
      return { capabilityId: (item as Record<string, unknown>).capabilityId as string, enabled: (item as Record<string, unknown>).enabled as boolean };
    });
  })();
  const permissions = record.permissions === undefined ? undefined : (() => {
    if (!Array.isArray(record.permissions)) throw new TypeError("permissions are invalid");
    return record.permissions.map(item => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) throw new TypeError("permission is invalid");
      const entry = item as Record<string, unknown>;
      if (typeof entry.capabilityId !== "string" || !["allow", "ask", "deny"].includes(String(entry.policy))) throw new TypeError("permission is invalid");
      return { capabilityId: entry.capabilityId, policy: entry.policy as "allow" | "ask" | "deny" };
    });
  })();
  const skillIds = record.skillIds === undefined ? undefined : (() => {
    if (!Array.isArray(record.skillIds) || record.skillIds.some(item => typeof item !== "string")) throw new TypeError("skills are invalid");
    return record.skillIds as string[];
  })();
  const name = optionalString("name", 128);
  const description = optionalString("description", 10_000);
  const icon = optionalString("icon", 64);
  const instructions = optionalString("instructions", 100_000);
  const model = optionalNullableString("model", 256);
  const reasoningEffort = optionalNullableString("reasoningEffort", 32);
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(icon === undefined ? {} : { icon }),
    ...(instructions === undefined ? {} : { instructions }),
    ...(model === undefined ? {} : { model }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(skillIds === undefined ? {} : { skillIds }),
  };
}

function parseIntegrationInput(value: unknown, partial = false): IntegrationInput | Partial<IntegrationInput> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("integration must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "type", "enabled", "config", "secrets"]);
  if (Object.keys(record).some(key => !allowed.has(key))) throw new TypeError("integration field is unsupported");
  if (!partial && (typeof record.name !== "string" || typeof record.type !== "string" || typeof record.config !== "object" || record.config === null || Array.isArray(record.config))) throw new TypeError("integration name, type, and config are required");
  if (record.name !== undefined && (typeof record.name !== "string" || record.name.length > 128)) throw new TypeError("integration name is invalid");
  if (record.type !== undefined && (typeof record.type !== "string" || record.type.length > 64)) throw new TypeError("integration type is invalid");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") throw new TypeError("integration enabled state is invalid");
  for (const key of ["config", "secrets"] as const) if (record[key] !== undefined && (typeof record[key] !== "object" || record[key] === null || Array.isArray(record[key]))) throw new TypeError("integration data is invalid");
  return {
    ...(record.name === undefined ? {} : { name: record.name as string }),
    ...(record.type === undefined ? {} : { type: record.type as string }),
    ...(record.enabled === undefined ? {} : { enabled: record.enabled as boolean }),
    ...(record.config === undefined ? {} : { config: record.config as Record<string, unknown> }),
    ...(record.secrets === undefined ? {} : { secrets: record.secrets as Record<string, unknown> }),
  } as IntegrationInput | Partial<IntegrationInput>;
}

function parseSkillInput(value: unknown, partial = false): SkillInput | Partial<SkillInput> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("skill must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "description", "instructions", "enabled"]);
  const unsupported = Object.keys(record).find(key => !allowed.has(key));
  if (unsupported !== undefined) throw new TypeError("skill field is unsupported");
  if (!partial && (typeof record.name !== "string" || typeof record.instructions !== "string")) throw new TypeError("skill name and instructions are required");
  if (record.name !== undefined && (typeof record.name !== "string" || record.name.length > 128)) throw new TypeError("skill name is invalid");
  if (record.description !== undefined && (typeof record.description !== "string" || record.description.length > 10_000)) throw new TypeError("skill description is invalid");
  if (record.instructions !== undefined && (typeof record.instructions !== "string" || record.instructions.length > 100_000)) throw new TypeError("skill instructions are invalid");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") throw new TypeError("skill enabled state is invalid");
  return {
    ...(record.name === undefined ? {} : { name: record.name }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.instructions === undefined ? {} : { instructions: record.instructions }),
    ...(record.enabled === undefined ? {} : { enabled: record.enabled }),
  } as SkillInput | Partial<SkillInput>;
}

function parsePromptCommandInput(value: unknown, partial = false): PromptCommandInput | Partial<PromptCommandInput> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("prompt command must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "description", "prompt", "enabled"]);
  const unsupported = Object.keys(record).find(key => !allowed.has(key));
  if (unsupported !== undefined) throw new TypeError("prompt command field is unsupported");
  if (!partial && (typeof record.name !== "string" || typeof record.prompt !== "string")) throw new TypeError("prompt command name and prompt are required");
  if (record.name !== undefined && (typeof record.name !== "string" || record.name.length > 64)) throw new TypeError("prompt command name is invalid");
  if (record.description !== undefined && (typeof record.description !== "string" || record.description.length > 10_000)) throw new TypeError("prompt command description is invalid");
  if (record.prompt !== undefined && (typeof record.prompt !== "string" || record.prompt.length > 100_000)) throw new TypeError("prompt command prompt is invalid");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") throw new TypeError("prompt command enabled state is invalid");
  return {
    ...(record.name === undefined ? {} : { name: record.name }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.prompt === undefined ? {} : { prompt: record.prompt }),
    ...(record.enabled === undefined ? {} : { enabled: record.enabled }),
  } as PromptCommandInput | Partial<PromptCommandInput>;
}

function parseAutomationInput(value: unknown, partial = false): Omit<AutomationInput, "nextRunAt"> | Partial<Omit<AutomationInput, "nextRunAt">> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("automation must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "enabled", "schedule", "prompt", "agentId", "projectId", "model", "permissionMode", "metadata"]);
  const unsupported = Object.keys(record).find(key => !allowed.has(key));
  if (unsupported !== undefined) throw new TypeError("automation field is unsupported");
  if (!partial && (typeof record.name !== "string" || typeof record.prompt !== "string" || typeof record.agentId !== "string" || record.schedule === undefined)) throw new TypeError("automation name, prompt, agent, and schedule are required");
  if (record.name !== undefined && (typeof record.name !== "string" || record.name.length > 128)) throw new TypeError("automation name is invalid");
  if (record.prompt !== undefined && (typeof record.prompt !== "string" || record.prompt.length > 100_000 || record.prompt.trim().length === 0)) throw new TypeError("automation prompt is invalid");
  if (record.agentId !== undefined && (typeof record.agentId !== "string" || record.agentId.length === 0)) throw new TypeError("automation agent is invalid");
  if (record.projectId !== undefined && record.projectId !== null && (typeof record.projectId !== "string" || record.projectId.length === 0)) throw new TypeError("automation project is invalid");
  if (record.model !== undefined && record.model !== null && (typeof record.model !== "string" || record.model.length > 256)) throw new TypeError("automation model is invalid");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") throw new TypeError("automation enabled state is invalid");
  if (record.permissionMode !== undefined && !["read-only", "pre-approved", "fail"].includes(String(record.permissionMode))) throw new TypeError("automation permission mode is invalid");
  if (record.metadata !== undefined && (typeof record.metadata !== "object" || record.metadata === null || Array.isArray(record.metadata))) throw new TypeError("automation metadata is invalid");
  return {
    ...(record.name === undefined ? {} : { name: record.name }),
    ...(record.enabled === undefined ? {} : { enabled: record.enabled }),
    ...(record.schedule === undefined ? {} : { schedule: normalizeAutomationSchedule(record.schedule) }),
    ...(record.prompt === undefined ? {} : { prompt: record.prompt }),
    ...(record.agentId === undefined ? {} : { agentId: record.agentId }),
    ...(record.projectId === undefined ? {} : { projectId: record.projectId === null ? null : record.projectId }),
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.permissionMode === undefined ? {} : { permissionMode: record.permissionMode as AutomationPermissionMode }),
    ...(record.metadata === undefined ? {} : { metadata: record.metadata as Record<string, unknown> }),
  } as Omit<AutomationInput, "nextRunAt"> | Partial<Omit<AutomationInput, "nextRunAt">>;
}

async function body(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) throw new TypeError("request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new TypeError("request body is too large");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("request body must be an object");
  return parsed as Record<string, unknown>;
}

function authenticated(
  request: Request,
  identity: SQLiteIdentityRepository,
  stateChanging = false,
): { principal: AuthenticatedPrincipal; token: string } | Response {
  const token = parseCookies(request).get(SESSION_COOKIE);
  const principal = identity.authenticate(token);
  if (principal === null || token === undefined) return json({ error: "unauthorized" }, 401);
  if (stateChanging) {
    if (!originAllowed(request)) return json({ error: "origin_rejected" }, 403);
    const csrf = request.headers.get("x-csrf-token");
    if (csrf === null || csrf !== identity.csrfToken(token) || csrf !== parseCookies(request).get(CSRF_COOKIE)) return json({ error: "csrf_rejected" }, 403);
  }
  return { principal, token };
}

function sessionRecord(sessionId: string, projectId: string | undefined, workspace: string | undefined, model: string): SessionRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: sessionId,
    workspaceId: workspace ?? projectId ?? "default",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    runtime: { runtimeVersion: "api-gateway", schemaVersion: 1 },
    model,
  };
}

function eventJson(requestId: string, sequence: number, event: GatewayProtocolEvent): string {
  return JSON.stringify({ protocol: "subpolar.v1", requestId, sequence, event });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

function requestFingerprint(principalId: string, input: TurnInput): string {
  return createHash("sha256")
    .update(canonicalJson({ endpoint: "subpolar.v1/chat/completions", principalId, input }))
    .digest("hex");
}

function promptAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function providerContentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map(part => "text" in part ? part.text : JSON.stringify(part)).join("\n");
}

function agentSkillInstructions(agent: { readonly instructions: string }, skills: readonly { readonly id: string; readonly name: string; readonly instructions: string }[], clientSystemMessages: readonly ProviderContent[] = [], projectInstructions = ""): string {
  const agentInstructions = `<agent-instructions>\n${agent.instructions}\n</agent-instructions>`;
  const skillInstructions = skills.map(skill => `<skill id="${promptAttribute(skill.id)}" name="${promptAttribute(skill.name)}">\n${skill.instructions}\n</skill>`).join("\n");
  const clientInstructions = clientSystemMessages.length === 0 ? "" : `\n<client-system-instructions>\n${clientSystemMessages.map(providerContentText).join("\n")}\n</client-system-instructions>`;
  const project = projectInstructions.trim() === "" ? "" : `\n<project-instructions>\n${projectInstructions}\n</project-instructions>`;
  return `${agentInstructions}${project}\n<skills>\n${skillInstructions}\n</skills>${clientInstructions}`;
}

export function startApiGatewayServer(options: ApiGatewayServerOptions): ApiGatewayServer {
  const maxRequestBytes = options.maxRequestBytes ?? 1_048_576;
  if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 1) throw new TypeError("maxRequestBytes must be positive");
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
  if (!Number.isFinite(shutdownTimeoutMs) || shutdownTimeoutMs <= 0) throw new TypeError("shutdownTimeoutMs must be positive");
  const dataDir = options.dataDir ?? process.env.SUBPOLAR_DATA_DIR ?? resolve(process.cwd(), ".subpolar");
  const workspaceRoot = options.workspaceRoot ?? process.env.SUBPOLAR_WORKSPACE_ROOT ?? join(dataDir, "workspaces");
  const databasePath = join(dataDir, "state.db");
  const sessions = new SQLiteSessionRepository(databasePath);
  const identity = new SQLiteIdentityRepository(databasePath);
  const integrations = new IntegrationManager(identity);
  const persistence = createGatewayPersistenceAdapter(sessions);
  const gateway = createGateway({ sessionRepository: persistence, persistence });
  const activeTurns = new Set<AbortController>();
  const socketTurns = new Map<object, Map<string, AbortController>>();
  const pendingApprovals = new WeakMap<object, Map<string, { readonly resolve: (decision: "allow" | "deny") => void }>>();
  const publicAgent = <T extends NonNullable<ReturnType<SQLiteIdentityRepository["getAgent"]>>>(agent: T): T => ({ ...agent, capabilities: agent.capabilities.map(item => ({ ...item, capabilityId: integrations.canonicalCapabilityId(agent.ownerId, item.capabilityId) })), permissions: agent.permissions.map(item => ({ ...item, capabilityId: integrations.canonicalCapabilityId(agent.ownerId, item.capabilityId) })) }) as T;
  let shutdownPromise: Promise<void> | undefined;

  const configuredCredential = async (connection: NonNullable<ReturnType<SQLiteIdentityRepository["providerConnection"]>>) => {
    const profile = modelProvider(connection.providerId);
    if (profile === undefined) throw new Error("provider_not_configured");
    let credentials = identity.resolveCredentialHandle(connection.credentialHandle);
    const envMarker = credentials.apiKey === "env";
    if (profile.authType === "aws_sdk" && envMarker) credentials = resolveAwsCredential(credentials);
    if (profile.authType === "gcp" && envMarker && process.env.GOOGLE_OAUTH_ACCESS_TOKEN !== undefined) {
      credentials = { accessToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN };
    }
    if (profile.authType === "external_process" && credentials.executable === undefined) {
      const executable = process.env[`SUBPOLAR_${profile.id.toUpperCase().replace(/-/g, "_")}_EXECUTABLE`];
      if (executable !== undefined) credentials = { executable, arguments: [] };
    }
    if (profile.authType === "gcp") return resolveGcpCredential(credentials);
    return profile.authType === "oauth" ? refreshProviderCredential(identity, profile.id, connection.credentialHandle, credentials) : credentials;
  };

  const trackTurn = (controller: AbortController): (() => void) => {
    activeTurns.add(controller);
    return () => activeTurns.delete(controller);
  };

  const toolDefinitionsFor = async (principal: AuthenticatedPrincipal, project: NonNullable<ReturnType<SQLiteIdentityRepository["getProject"]>> | null): Promise<readonly ToolDefinition[]> => {
    const credential = project?.repository?.credentialId === undefined ? undefined : identity.getGitCredentialRuntime(principal.id, project.repository.credentialId);
    const gitTools = project?.workspace === undefined || project.workspace === "" ? [] : createNativeGitTools(project.workspace, credential, workspaceRoot, project.repository?.remoteName ?? "origin");
    return [...(options.toolDefinitions ?? []), ...gitTools, ...(await integrations.toolsFor(principal.id))];
  };

  const resolveEffectiveAgentConfiguration = async (principal: AuthenticatedPrincipal, agent: NonNullable<ReturnType<SQLiteIdentityRepository["getAgent"]>>, sessionId: string, projectId: string | undefined, requestedModel: string, requestedReasoning: "low" | "medium" | "high" | undefined, permissionMode: PermissionMode | undefined) => {
    const project = projectId === undefined ? null : identity.getProject(principal.id, projectId);
    if (projectId !== undefined && project === null) throw new OwnershipError("Project is not owned by the authenticated user");
    const toolDefinitions = await toolDefinitionsFor(principal, project);
    const projectOverride = projectId === undefined ? null : identity.getAgentProjectOverride(principal.id, projectId, agent.id);
    const model = requestedModel !== "default" ? requestedModel : projectOverride?.model ?? agent.model;
    const effectiveCapabilities = (projectOverride?.capabilities ?? agent.capabilities).map(item => ({ ...item, capabilityId: integrations.canonicalCapabilityId(principal.id, item.capabilityId) }));
    const effectivePermissions = (projectOverride?.permissions ?? agent.permissions).map(item => ({ ...item, capabilityId: integrations.canonicalCapabilityId(principal.id, item.capabilityId) }));
    const enabledCapabilityIds = agent.capabilityMode === "legacy" && projectOverride?.capabilities === undefined
      ? toolDefinitions.map(definition => definition.capabilityId ?? definition.name)
      : effectiveCapabilities.filter(item => item.enabled).map(item => item.capabilityId);
    const tools = resolveAgentToolDescriptors(toolDefinitions, {
      userId: principal.id,
      sessionId,
      ...(projectId === undefined ? {} : { projectId }),
      agentId: agent.id,
      enabledCapabilityIds,
      agentPolicies: effectivePermissions,
      ...(permissionMode === undefined ? {} : { sessionMode: permissionMode }),
    });
    const configuredEffort = requestedReasoning ?? projectOverride?.reasoningEffort ?? agent.reasoningEffort;
    const reasoningEffort = configuredEffort === "low" || configuredEffort === "medium" || configuredEffort === "high" ? configuredEffort as "low" | "medium" | "high" : undefined;
    const skills = identity.effectiveAgentSkills(principal.id, agent.id);
    return { projectOverride, model, tools, reasoningEffort, skills, project };
  };

  const prepareTurn = async (principal: AuthenticatedPrincipal, input: TurnInput): Promise<{ input: TurnInput; sessionId: string; tools: readonly ToolDefinition[]; cwd?: string; reasoningEffort?: "low" | "medium" | "high"; contextAssembler?: HarnessContextAssembler }> => {
    const sessionId = input.sessionId ?? randomUUID();
    const ownedSession = identity.listSessions(principal.id).find(item => item.sessionId === sessionId);
    if (ownedSession?.projectId !== undefined && input.projectId !== undefined && ownedSession.projectId !== input.projectId) throw new OwnershipError("Session is assigned to another project");
    const projectId = input.projectId ?? ownedSession?.projectId;
    const project = projectId === undefined ? null : identity.getProject(principal.id, projectId);
    if (projectId !== undefined && project === null) throw new OwnershipError("Project is not owned by the authenticated user");
    const selectedAgentId = input.agentId ?? ownedSession?.agentId ?? project?.defaultAgentId;
    const agent = selectedAgentId === undefined ? null : identity.getAgent(principal.id, selectedAgentId);
    if (selectedAgentId !== undefined && agent === null) throw new OwnershipError("Agent is not owned by the authenticated user");
    if (agent !== null && projectId !== undefined && agent.projectId !== projectId) throw new OwnershipError("Agent is not assigned to this project");
    const effectiveAgent = agent === null ? null : await resolveEffectiveAgentConfiguration(principal, agent, sessionId, projectId, input.model, input.reasoningEffort, input.permissionMode);
    const selectedModel = effectiveAgent?.model ?? agent?.model;
    const effectiveModel = selectedModel ?? (options.provider === undefined ? identity.providerConnection()?.model ?? input.model : input.model);
    const explicitReasoning = input.reasoningEffort;
    const existing = await sessions.getSession(sessionId);
    if (existing !== null) {
      identity.assertSessionOwner(principal.id, sessionId);
    } else {
      identity.claimSession(principal.id, sessionId, projectId, selectedAgentId);
      await sessions.createSession(sessionRecord(sessionId, projectId, project?.workspace, effectiveModel));
    }
    if (agent !== null) {
      const tools = effectiveAgent?.tools ?? [];
      const reasoningEffort = effectiveAgent?.reasoningEffort;
      const clientSystemMessages = input.messages.filter(message => message.role === "system").map(message => message.content);
      if (agent.instructions.trim() || project?.instructions.trim() || (effectiveAgent?.skills.length ?? 0) > 0 || clientSystemMessages.length > 0) {
        const contextAssembler: HarnessContextAssembler = async context => {
          if ((effectiveAgent?.skills.length ?? 0) === 0 && clientSystemMessages.length === 0 && project?.instructions.trim() === "") return [{ role: "system", content: agent.instructions }, ...context.messages];
          // Client-provided system messages are preserved as data inside the server-owned
          // structured section. They must not bypass Agent instructions or assigned Skills.
          const messages = context.messages.filter(message => message.role !== "system");
          return assembleHarnessContext({ ...context, messages }, {
            sources: [{ kind: "instructions", content: agentSkillInstructions(agent, effectiveAgent?.skills ?? [], clientSystemMessages, project?.instructions ?? "") }],
          }).messages;
        };
        return { input: { ...input, model: effectiveModel }, sessionId, tools, ...(project?.workspace ? { cwd: project.workspace } : {}), contextAssembler, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) };
      }
      return { input: { ...input, model: effectiveModel }, sessionId, tools, ...(project?.workspace ? { cwd: project.workspace } : {}), ...(reasoningEffort === undefined ? {} : { reasoningEffort }) };
    }
    const projectTools = await toolDefinitionsFor(principal, project);
    const contextAssembler: HarnessContextAssembler | undefined = project === null || project.instructions.trim() === "" ? undefined : (async context => assembleHarnessContext({ ...context, messages: context.messages.filter(message => message.role !== "system") }, { sources: [{ kind: "instructions", content: `<project-instructions>\n${project.instructions}\n</project-instructions>` }] }).messages);
    return { input: { ...input, model: effectiveModel }, sessionId, tools: projectTools, ...(project?.workspace ? { cwd: project.workspace } : {}), ...(contextAssembler === undefined ? {} : { contextAssembler }), ...(explicitReasoning === undefined ? {} : { reasoningEffort: explicitReasoning }) };
  };

  const executeTurn = async (
    principal: AuthenticatedPrincipal,
    input: TurnInput,
    signal: AbortSignal,
    emit: (event: GatewayProtocolEvent) => void | Promise<void>,
    turnApprovalPolicy?: HarnessApprovalPolicy,
  ): Promise<unknown> => {
    const prepared = await prepareTurn(principal, input);
    const runtimeCwd = prepared.cwd === undefined ? undefined : await validateRuntimeWorkspace(workspaceRoot, prepared.cwd);
    if (runtimeCwd !== undefined) await gateway.setSessionCwd(prepared.sessionId, runtimeCwd);
    const connection = options.provider === undefined ? identity.providerConnection() : null;
    if (options.provider === undefined && connection === null) throw new Error("provider_not_configured");
    const runtime = connection === null ? null : await resolveProvider(connection, () => configuredCredential(connection));
    const approvalPolicy = turnApprovalPolicy ?? options.approvalPolicy;
    return gateway.executeRequest({
      model: prepared.input.model === "default" && runtime !== null ? runtime.model : prepared.input.model,
      messages: prepared.input.messages,
      toolPolicies: [],
      toolDefinitions: prepared.tools,
      toolPolicyOverrides: prepared.tools.length === 0 ? options.toolPolicyOverrides ?? [] : [],
      sessionId: prepared.sessionId,
      ...(runtimeCwd === undefined ? {} : { cwd: runtimeCwd }),
      requestId: prepared.input.requestId ?? randomUUID(),
      ...(prepared.reasoningEffort === undefined ? {} : { options: { reasoningEffort: prepared.reasoningEffort } }),
      signal,
      eventSink: emit,
      ...(approvalPolicy === undefined ? {} : { approvalPolicy: async approval => {
        const approvalRequestId = `${approval.requestId}:${approval.call.id}`;
        const at = new Date().toISOString();
        await sessions.savePendingApproval({
          requestId: approvalRequestId,
          sessionId: approval.sessionId,
          callId: approval.call.id,
          toolName: approval.call.name,
          arguments: approval.arguments,
          status: "pending",
          createdAt: at,
          updatedAt: at,
        });
        const decision = await approvalPolicy(approval);
        if (decision !== "allow" && decision !== "deny") {
          throw new Error("Explicit tool approval decision required");
        }
        await sessions.resolvePendingApproval(approvalRequestId, decision, new Date().toISOString());
        return decision;
      } }),
      ...(prepared.contextAssembler === undefined ? {} : { contextAssembler: prepared.contextAssembler }),
    }, options.provider ?? createProvider(runtime as NonNullable<typeof runtime>, { resolveCredential: handle => identity.resolveCredentialHandle(handle) }));
  };

  const executeAutomation = async (automation: NonNullable<ReturnType<SQLiteIdentityRepository["getAutomation"]>>, run: NonNullable<ReturnType<SQLiteIdentityRepository["getAutomationRun"]>>, signal: AbortSignal): Promise<void> => {
    const approvalRequired = { value: false };
    const approvalPolicy: HarnessApprovalPolicy = async () => {
      approvalRequired.value = true;
      throw new AutomationRunError("needs_attention", "Permission required: automation execution cannot wait for interactive approval");
    };
    try {
      await executeTurn(
        { id: automation.ownerId, username: identity.getUser(automation.ownerId)?.username ?? "automation" },
        {
          model: automation.model ?? "default",
          messages: [{ role: "user", content: automation.prompt }],
          sessionId: run.sessionId,
          agentId: automation.agentId,
          ...(automation.projectId === undefined ? {} : { projectId: automation.projectId }),
          requestId: `automation:${run.id}`,
          ...(automation.permissionMode === "read-only" ? { permissionMode: "read-only" as const } : {}),
        },
        signal,
        () => undefined,
        approvalPolicy,
      );
      if (approvalRequired.value) throw new AutomationRunError("needs_attention", "Permission required: automation execution cannot wait for interactive approval");
    } catch (error) {
      if (error instanceof AutomationRunError) throw error;
      if (approvalRequired.value) throw new AutomationRunError("needs_attention", "Permission required: automation execution cannot wait for interactive approval");
      throw error;
    }
  };

  const automationScheduler = new AutomationScheduler(identity, executeAutomation, options.automationPollMs ?? 30_000);

  const server = Bun.serve<WebSocketData>({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 8080,
    async fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok" });
      if (request.method === "GET" && url.pathname === "/api/ready") return json({ status: "ready" });

      if (url.pathname === "/v1/ws") {
        if (request.method !== "GET" || !originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        const token = parseCookies(request).get(SESSION_COOKIE);
        const principal = identity.authenticate(token);
        if (principal === null || token === undefined) return json({ error: "unauthorized" }, 401);
        if (serverInstance.upgrade(request, { data: { principal, token } })) return undefined;
        return json({ error: "upgrade_failed" }, 400);
      }

      if (url.pathname === "/v1/auth/bootstrap") {
        if (request.method === "GET") return json({ required: identity.bootstrapRequired() });
        if (request.method !== "POST" || !originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.bootstrap(String(value.username ?? ""), String(value.password ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 201, authHeaders(request, session));
        } catch { return json({ error: "bootstrap_failed" }, 400); }
      }

      if (url.pathname === "/v1/auth/login" && request.method === "POST") {
        if (!originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.login(String(value.username ?? ""), String(value.password ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 200, authHeaders(request, session));
        } catch { return json({ error: "invalid_credentials" }, 401); }
      }

      if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        identity.revoke(auth.token);
        return json({ ok: true }, 200, clearAuthHeaders(request));
      }

      if (url.pathname === "/v1/auth/password" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.changePassword(auth.principal.id, String(value.currentPassword ?? ""), String(value.newPassword ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 200, authHeaders(request, session));
        } catch (error) {
          return json({ error: error instanceof AuthenticationError ? "invalid_credentials" : "invalid_password" }, error instanceof AuthenticationError ? 401 : 400);
        }
      }

      if (url.pathname === "/v1/me" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ user: auth.principal });
      }

      if (url.pathname === "/v1/setup" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json(identity.setupStatus(auth.principal.id));
      }

      if (url.pathname === "/v1/settings/models" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json(identity.modelDefaults(auth.principal.id));
      }

      if (url.pathname === "/v1/settings/models" && request.method === "PUT") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          return json(identity.setModelDefaults(auth.principal.id, {
            conversation: value.conversation,
            internal: value.internal,
            voice: value.voice,
            image: value.image,
          }));
        } catch { return json({ error: "invalid_model_defaults" }, 400); }
      }

      if ((url.pathname === "/v1/setup/providers" || url.pathname === "/v1/providers") && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ providers: listProviderProfiles() });
      }

      if (url.pathname === "/v1/setup/provider" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const provider = String(value.providerId ?? value.provider ?? "openai-api");
          const profile = modelProvider(provider);
          if (profile === undefined) throw new Error("provider is invalid");
          identity.configureProvider(profile.id, String(value.baseUrl ?? profile.baseUrl ?? ""), String(value.apiKey ?? ""), String(value.model ?? ""));
          return json({ configured: true });
        } catch { return json({ error: "invalid_provider" }, 400); }
      }

      const providerAuthPath = /^\/v1\/providers\/([^/]+)\/auth\/(start|callback|device\/start|device\/complete)$/.exec(url.pathname);
      if (providerAuthPath !== null) {
        const provider = modelProvider(decodeURIComponent(providerAuthPath[1] as string));
        if (provider === undefined) return json({ error: "provider_not_found" }, 404);
        if (providerAuthPath[2] === "start" && request.method === "GET") {
          const auth = authenticated(request, identity);
          if (auth instanceof Response) return auth;
          try {
            const model = url.searchParams.get("model") ?? provider.fallbackModels?.[0] ?? "default";
            const baseUrl = url.searchParams.get("baseUrl") ?? provider.baseUrl ?? "";
            return json(beginProviderOAuth(identity, provider.id, baseUrl, model, url.origin, auth.principal.id));
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "provider_oauth_failed" }, 400);
          }
        }
        if (providerAuthPath[2] === "callback" && request.method === "GET") {
          const auth = authenticated(request, identity);
          if (auth instanceof Response) return auth;
          const state = url.searchParams.get("state");
          const code = url.searchParams.get("code");
          if (state === null || code === null) return json({ error: "provider_oauth_callback_invalid" }, 400);
          try {
            await completeProviderOAuth(identity, provider.id, state, code, auth.principal.id);
            return Response.redirect(`${url.origin}/setup?provider=${encodeURIComponent(provider.id)}&connected=1`, 303);
          } catch { return json({ error: "provider_oauth_exchange_failed" }, 400); }
        }
        if (providerAuthPath[2] === "device/start" && request.method === "POST") {
          const auth = authenticated(request, identity, true);
          if (auth instanceof Response) return auth;
          try { return json(await beginDeviceOAuth(provider.id)); } catch { return json({ error: "provider_device_flow_failed" }, 400); }
        }
        if (providerAuthPath[2] === "device/complete" && request.method === "POST") {
          const auth = authenticated(request, identity, true);
          if (auth instanceof Response) return auth;
          try {
            const value = await body(request, maxRequestBytes);
            if (typeof value.deviceCode !== "string" || value.deviceCode.trim().length === 0) throw new Error("device code is invalid");
            const credentials = await completeDeviceOAuth(provider.id, value.deviceCode);
            identity.configureProviderCredentials(provider.id, provider.baseUrl ?? "", credentials, provider.fallbackModels?.[0] ?? "default");
            return json({ configured: true });
          } catch { return json({ error: "provider_device_flow_failed" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/v1/models" && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const connection = identity.providerConnection();
        if (connection === null) return json({ providers: [] });
        const runtime = await resolveProvider(connection, () => configuredCredential(connection));
        const models = await listProviderModels(runtime);
        return json({ providers: [{ id: connection.providerId, models }] });
      }

      if (url.pathname === "/v1/capabilities" && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const definitions = [...(options.toolDefinitions ?? []), ...createNativeGitTools(workspaceRoot, undefined, workspaceRoot), ...(await integrations.toolsFor(auth.principal.id))];
        return json({ capabilities: definitions.map(definition => ({ capabilityId: definition.capabilityId ?? definition.name, name: definition.name, description: definition.description, source: definition.source, capabilities: definition.capabilities ?? [], defaultPolicy: definition.policy === "ask" || definition.policy === "deny" ? definition.policy : "allow", ...(definition.integrationId === undefined ? {} : { integrationId: definition.integrationId }), ...(definition.integrationName === undefined ? {} : { integrationName: definition.integrationName }), ...(definition.integrationType === undefined ? {} : { integrationType: definition.integrationType }), ...(definition.nativeName === undefined ? {} : { nativeName: definition.nativeName }), ...(definition.displayName === undefined ? {} : { displayName: definition.displayName }) })) });
      }

      if (url.pathname === "/v1/integrations" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ integrations: identity.listIntegrations(auth.principal.id) });
      }

      if (url.pathname === "/v1/integrations" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const created = identity.createIntegration(auth.principal.id, parseIntegrationInput(value) as IntegrationInput);
          return json({ integration: await integrations.discover(auth.principal.id, created.id) }, 201);
        } catch { return json({ error: "invalid_integration" }, 400); }
      }

      const integrationPath = /^\/v1\/integrations\/([^/]+)(?:\/(discover|test|oauth\/start|oauth\/callback|oauth\/revoke))?$/.exec(url.pathname);
      if (integrationPath !== null) {
        const integrationId = decodeURIComponent(integrationPath[1] as string);
        const action = integrationPath[2];
        if (action === "oauth/callback" && request.method === "GET") {
          const auth = authenticated(request, identity);
          if (auth instanceof Response) return auth;
          const state = url.searchParams.get("state");
          const code = url.searchParams.get("code");
          if (state === null || code === null) return json({ error: "oauth_callback_invalid" }, 400);
          try {
            await integrations.completeOAuth(auth.principal.id, integrationId, code, state, `${url.origin}/v1/integrations/${encodeURIComponent(integrationId)}/oauth/callback`);
            return Response.redirect(`${url.origin}/settings/agent/integrations?connected=1`, 303);
          } catch { return json({ error: "oauth_exchange_failed" }, 400); }
        }
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (action === undefined) {
          if (request.method === "GET") {
            const integration = identity.getIntegration(auth.principal.id, integrationId);
            return integration === null ? json({ error: "not_found" }, 404) : json({ integration });
          }
          if (request.method === "DELETE") {
            try { await integrations.closeTransport(`${auth.principal.id}:${integrationId}`); identity.deleteIntegration(auth.principal.id, integrationId); return json({ deleted: true }); }
            catch { return json({ error: "not_found" }, 404); }
          }
          if (request.method === "PATCH") {
            try { const value = await body(request, maxRequestBytes); const integration = identity.updateIntegration(auth.principal.id, integrationId, parseIntegrationInput(value, true)); integrations.invalidate(auth.principal.id, integrationId); return json({ integration }); }
            catch { return json({ error: "invalid_integration" }, 400); }
          }
          return json({ error: "method_not_allowed" }, 405);
        }
        if ((action === "discover" || action === "test") && (request.method === "POST" || request.method === "GET")) {
          try { return json({ integration: await integrations.test(auth.principal.id, integrationId) }); }
          catch { return json({ error: "integration_test_failed" }, 400); }
        }
        if (action === "oauth/start" && request.method === "GET") {
          try { return json(identity.beginIntegrationOAuth(auth.principal.id, integrationId, `${url.origin}/v1/integrations/${encodeURIComponent(integrationId)}/oauth/callback`)); }
          catch { return json({ error: "oauth_start_failed" }, 400); }
        }
        if (action === "oauth/revoke" && request.method === "POST") {
          try { return json({ integration: await integrations.revokeOAuth(auth.principal.id, integrationId) }); }
          catch { return json({ error: "oauth_revoke_failed" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      const providerModelsPath = /^\/v1\/providers\/([^/]+)\/models$/.exec(url.pathname);
      if (providerModelsPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const connection = identity.providerConnection();
        const profile = modelProvider(decodeURIComponent(providerModelsPath[1] as string));
        if (profile === undefined) return json({ error: "provider_not_found" }, 404);
        if (connection === null || connection.providerId !== profile.id) return json({ providerId: profile.id, models: (profile.fallbackModels ?? []).map(id => ({ id, label: id })) });
        const runtime = await resolveProvider(connection, () => configuredCredential(connection));
        return json({ providerId: profile.id, models: await listProviderModels(runtime) });
      }

      if (url.pathname === "/v1/setup/agents" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          if (!Array.isArray(value.templates) || value.templates.some(template => typeof template !== "string")) throw new Error("templates are invalid");
          const existingProjects = identity.listProjects(auth.principal.id);
          const workspace = existingProjects.length === 0 ? await createEmptyWorkspace(workspaceRoot, randomUUID()) : existingProjects[0]?.workspace ?? "";
          const result = identity.createInitialAgents(auth.principal.id, value.templates, workspace);
          if (result.project.workspace !== workspace && workspace !== "") identity.updateProject(auth.principal.id, result.project.id, { workspace });
          return json({ ...result, project: identity.getProject(auth.principal.id, result.project.id) }, 201);
        } catch { return json({ error: "invalid_templates" }, 400); }
      }

      if (url.pathname === "/v1/automations") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ automations: identity.listAutomations(auth.principal.id, url.searchParams.get("projectId") ?? undefined) });
        if (request.method === "POST") {
          try {
            const value = await body(request, maxRequestBytes);
            const input = parseAutomationInput(value) as AutomationInput;
            const schedule = input.schedule;
            const nextRunAt = input.enabled === false ? null : nextAutomationRun(schedule);
            return json({ automation: identity.createAutomation(auth.principal.id, { ...input, nextRunAt }) }, 201);
          } catch (error) {
            return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_automation" }, error instanceof OwnershipError ? 403 : 400);
          }
        }
        return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
      }

      const automationPath = /^\/v1\/automations\/([^/]+)(?:\/(runs|run))?$/.exec(url.pathname);
      if (automationPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const automationId = decodeURIComponent(automationPath[1] as string);
        const action = automationPath[2];
        if (action === "runs") {
          if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
          if (identity.getAutomation(auth.principal.id, automationId) === null) return json({ error: "not_found" }, 404);
          return json({ runs: identity.listAutomationRuns(auth.principal.id, automationId) });
        }
        if (action === "run") {
          if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
          try {
            const run = identity.triggerAutomation(auth.principal.id, automationId, { source: "api" });
            const automation = identity.getAutomation(auth.principal.id, automationId);
            if (automation !== null) void automationScheduler.dispatch(run, automation);
            return json({ run }, 202);
          } catch (error) { return json({ error: error instanceof OwnershipError ? "not_found" : "automation_run_failed" }, error instanceof OwnershipError ? 404 : 400); }
        }
        if (request.method === "GET") {
          const automation = identity.getAutomation(auth.principal.id, automationId);
          return automation === null ? json({ error: "not_found" }, 404) : json({ automation });
        }
        if (request.method === "DELETE") {
          try { identity.deleteAutomation(auth.principal.id, automationId); return json({ deleted: true }); }
          catch (error) { return json({ error: error instanceof OwnershipError ? "not_found" : "delete_failed" }, error instanceof OwnershipError ? 404 : 400); }
        }
        if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405, { allow: "GET, PATCH, DELETE" });
        try {
          const existing = identity.getAutomation(auth.principal.id, automationId);
          if (existing === null) return json({ error: "not_found" }, 404);
          const patch = parseAutomationInput(await body(request, maxRequestBytes), true) as Partial<AutomationInput>;
          const schedule = patch.schedule ?? existing.schedule;
          const enabled = patch.enabled ?? existing.enabled;
          const nextRunAt = enabled ? nextAutomationRun(schedule, new Date()) : null;
          return json({ automation: identity.updateAutomation(auth.principal.id, automationId, { ...patch, nextRunAt }) });
        } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_automation" }, error instanceof OwnershipError ? 403 : 400); }
      }

      if (url.pathname === "/v1/skills") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") {
          const skills = identity.listSkills(auth.principal.id);
          const assignments = identity.skillAssignmentCounts(auth.principal.id);
          return json({ skills: skills.map(skill => ({ ...skill, assignmentCount: assignments.get(skill.id) ?? 0 })) });
        }
        if (request.method === "POST") {
          try { const value = await body(request, maxRequestBytes); return json({ skill: identity.createSkill(auth.principal.id, parseSkillInput(value) as SkillInput) }, 201); }
          catch { return json({ error: "invalid_skill" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
      }

      const skillPath = /^\/v1\/skills\/([^/]+)$/.exec(url.pathname);
      if (skillPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const skillId = decodeURIComponent(skillPath[1] as string);
        if (request.method === "GET") {
          const skill = identity.getSkill(auth.principal.id, skillId);
          return skill === null ? json({ error: "not_found" }, 404) : json({ skill, assignmentCount: identity.skillAssignmentCount(auth.principal.id, skillId) });
        }
        if (request.method === "DELETE") {
          try { identity.deleteSkill(auth.principal.id, skillId); return json({ deleted: true }); }
          catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404); }
        }
        if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405, { allow: "GET, PATCH, DELETE" });
        try { const value = await body(request, maxRequestBytes); return json({ skill: identity.updateSkill(auth.principal.id, skillId, parseSkillInput(value, true) as Partial<SkillInput>) }); }
        catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_skill" }, error instanceof OwnershipError ? 403 : 400); }
      }

      if (url.pathname === "/v1/prompt-commands") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ commands: identity.listPromptCommands(auth.principal.id) });
        if (request.method === "POST") {
          try { const value = await body(request, maxRequestBytes); return json({ command: identity.createPromptCommand(auth.principal.id, parsePromptCommandInput(value) as PromptCommandInput) }, 201); }
          catch { return json({ error: "invalid_prompt_command" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
      }

      const promptCommandPath = /^\/v1\/prompt-commands\/([^/]+)$/.exec(url.pathname);
      if (promptCommandPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const commandId = decodeURIComponent(promptCommandPath[1] as string);
        if (request.method === "GET") {
          const command = identity.getPromptCommand(auth.principal.id, commandId);
          return command === null ? json({ error: "not_found" }, 404) : json({ command });
        }
        if (request.method === "DELETE") {
          try { identity.deletePromptCommand(auth.principal.id, commandId); return json({ deleted: true }); }
          catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404); }
        }
        if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405, { allow: "GET, PATCH, DELETE" });
        try { const value = await body(request, maxRequestBytes); return json({ command: identity.updatePromptCommand(auth.principal.id, commandId, parsePromptCommandInput(value, true) as Partial<PromptCommandInput>) }); }
        catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_prompt_command" }, error instanceof OwnershipError ? 403 : 400); }
      }

      if (url.pathname === "/v1/projects") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ projects: identity.listProjects(auth.principal.id) });
        if (request.method === "POST") {
          let workspace = "";
          let projectId = "";
          try {
            const value = await body(request, maxRequestBytes);
            const mode = value.workspaceMode === undefined ? "create" : String(value.workspaceMode);
            if (mode !== "create" && mode !== "existing" && mode !== "clone") throw new Error("workspace mode is invalid");
            projectId = randomUUID();
            const repositoryValue = value.repository;
            const repository = repositoryValue === undefined ? undefined : (() => {
              if (typeof repositoryValue !== "object" || repositoryValue === null || Array.isArray(repositoryValue)) throw new Error("repository is invalid");
              const item = repositoryValue as Record<string, unknown>;
              return { url: String(item.url ?? ""), remoteName: String(item.remoteName ?? "origin"), ...(item.credentialId === undefined ? {} : { credentialId: String(item.credentialId) }), ...(item.defaultBranch === undefined ? {} : { defaultBranch: String(item.defaultBranch) }) };
            })();
            if (mode === "existing") workspace = await validateExistingWorkspace(workspaceRoot, String(value.workspacePath ?? ""));
            else workspace = await createEmptyWorkspace(workspaceRoot, projectId);
            const credential = repository?.credentialId === undefined ? undefined : identity.getGitCredentialRuntime(auth.principal.id, repository.credentialId);
            if (mode === "clone") {
              if (repository === undefined) throw new Error("clone repository is required");
              await cloneRepository(workspace, repository, credential);
            }
            const projectInput: ProjectInput = { id: projectId, name: String(value.name ?? ""), workspace, ...(value.description === undefined ? {} : { description: String(value.description) }), ...(value.instructions === undefined ? {} : { instructions: String(value.instructions) }), ...(repository === undefined ? {} : { repository }), ...(value.defaultAgentId === undefined ? {} : { defaultAgentId: String(value.defaultAgentId) }), ...(value.settings === undefined ? {} : { settings: value.settings as Record<string, unknown> }) };
            return json({ project: identity.createProject(auth.principal.id, projectInput) }, 201);
          } catch { if (projectId && workspace && workspace.startsWith(resolve(workspaceRoot))) await rm(workspace, { recursive: true, force: true }).catch(() => undefined); return json({ error: "invalid_project" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      const gitCredentialPath = /^\/v1\/git\/credentials(?:\/([^/]+))?$/.exec(url.pathname);
      if (gitCredentialPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const credentialId = gitCredentialPath[1] === undefined ? undefined : decodeURIComponent(gitCredentialPath[1]);
        if (request.method === "GET" && credentialId === undefined) return json({ credentials: identity.listGitCredentials(auth.principal.id) });
        if (request.method === "POST" && credentialId === undefined) {
          try { return json({ credential: identity.createGitCredential(auth.principal.id, await body(request, maxRequestBytes) as GitCredentialInput) }, 201); } catch { return json({ error: "invalid_git_credential" }, 400); }
        }
        if (request.method === "DELETE" && credentialId !== undefined) {
          try { identity.deleteGitCredential(auth.principal.id, credentialId); return json({ deleted: true }); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "credential_in_use" }, error instanceof OwnershipError ? 403 : 409); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      const projectGitPath = /^\/v1\/projects\/([^/]+)\/git\/(status|diff|branches)$/.exec(url.pathname);
      if (projectGitPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const project = identity.getProject(auth.principal.id, decodeURIComponent(projectGitPath[1]!));
        if (project === null) return json({ error: "not_found" }, 404);
        if (!project.workspace) return json({ error: "workspace_unavailable" }, 400);
        try {
          const workspace = await validateRuntimeWorkspace(workspaceRoot, project.workspace);
          if (projectGitPath[2] === "status") return json(await gitStatus(workspace));
          if (projectGitPath[2] === "branches") return json({ branches: await gitBranches(workspace) });
          return json({ diff: await gitDiff(workspace, url.searchParams.get("path") ?? undefined, url.searchParams.get("staged") === "true") });
        } catch { return json({ error: "git_unavailable" }, 400); }
      }

      const projectPath = /^\/v1\/projects\/([^/]+)$/.exec(url.pathname);
      if (projectPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const projectId = decodeURIComponent(projectPath[1]!);
        if (request.method === "GET") { const project = identity.getProject(auth.principal.id, projectId); return project === null ? json({ error: "not_found" }, 404) : json({ project }); }
        if (request.method === "PATCH") { try { const patch = await body(request, maxRequestBytes) as Partial<ProjectInput>; if (Object.hasOwn(patch, "workspace")) throw new Error("workspace is immutable"); if (patch.repository?.credentialId !== undefined) identity.getGitCredentialRuntime(auth.principal.id, patch.repository.credentialId); return json({ project: identity.updateProject(auth.principal.id, projectId, patch) }); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_project" }, error instanceof OwnershipError ? 403 : 400); } }
        if (request.method === "DELETE") { try { identity.deleteProject(auth.principal.id, projectId); return json({ deleted: true }); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404); } }
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/v1/agents") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ agents: identity.listAgents(auth.principal.id, url.searchParams.get("projectId") ?? undefined).map(publicAgent) });
        if (request.method === "POST") {
          try { const value = await body(request, maxRequestBytes); return json({ agent: identity.createAgent(auth.principal.id, String(value.projectId ?? ""), String(value.name ?? ""), String(value.instructions ?? ""), String(value.icon ?? "")) }, 201); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      const agentPath = /^\/v1\/agents\/([^/]+)$/.exec(url.pathname);
      if (agentPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const agentId = decodeURIComponent(agentPath[1] as string);
        if (request.method === "GET") {
          const agent = identity.getAgent(auth.principal.id, agentId);
          return agent === null ? json({ error: "not_found" }, 404) : json({ agent: publicAgent(agent) });
        }
        if (request.method === "DELETE") {
          try { identity.deleteAgent(auth.principal.id, agentId); return json({ deleted: true }); }
          catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404); }
        }
        if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405, { allow: "GET, PATCH, DELETE" });
        try {
          const value = await body(request, maxRequestBytes);
          return json({ agent: publicAgent(identity.updateAgent(auth.principal.id, agentId, parseAgentUpdate(value))) });
        } catch (error) {
          return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400);
        }
      }

      const effectiveAgentPath = /^\/v1\/agents\/([^/]+)\/effective$/.exec(url.pathname);
      if (effectiveAgentPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const agent = identity.getAgent(auth.principal.id, decodeURIComponent(effectiveAgentPath[1] as string));
        if (agent === null) return json({ error: "not_found" }, 404);
        const sessionId = url.searchParams.get("sessionId") ?? randomUUID();
        const projectId = url.searchParams.get("projectId") ?? agent.projectId;
        if (projectId !== agent.projectId) return json({ error: "forbidden" }, 403);
        const effective = await resolveEffectiveAgentConfiguration(auth.principal, agent, sessionId, projectId, "default", undefined, undefined);
        return json({ agent: publicAgent(agent), model: effective.model ?? (identity.providerConnection()?.model ?? "default"), reasoningEffort: effective.reasoningEffort, capabilities: effective.tools.map(tool => ({ capabilityId: tool.capabilityId, name: tool.name, source: tool.source, policy: tool.policy })), skills: effective.skills.map(skill => ({ id: skill.id, name: skill.name })) });
      }

      if (url.pathname === "/v1/sessions" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ sessions: identity.listSessions(auth.principal.id) });
      }

      const sessionPath = /^\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
      if (sessionPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        try {
          const sessionId = decodeURIComponent(sessionPath[1] as string);
          identity.assertSessionOwner(auth.principal.id, sessionId);
          const session = await sessions.getSession(sessionId);
          if (session === null) return json({ error: "not_found" }, 404);
          return json({ session, messages: await sessions.listMessages(sessionId) });
        } catch (error) {
          return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404);
        }
      }

      if (url.pathname === "/v1/chat/completions") {
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
           const value = await body(request, maxRequestBytes);
           const input = turnInput(value);
           const requestId = input.requestId ?? randomUUID();
           const idempotencyKey = request.headers.get("idempotency-key");
           if (idempotencyKey !== null && idempotencyKey.length === 0) {
             return json({ error: "idempotency_key_invalid" }, 400);
           }
           if (value.stream === true) {
             if (idempotencyKey !== null) {
               return json({ error: "idempotency_streaming_unsupported" }, 400);
             }
             const encoder = new TextEncoder();
            const turnController = new AbortController();
            const untrackTurn = trackTurn(turnController);
            let sequence = 0;
            let closed = false;
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                void executeTurn(auth.principal, { ...input, requestId }, turnController.signal, event => {
                  if (!closed) controller.enqueue(encoder.encode(`data: ${eventJson(requestId, sequence++, event)}\n\n`));
                }).then(() => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
                }).catch(() => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode(`data: ${JSON.stringify({ protocol: "subpolar.v1", requestId, sequence: sequence++, type: "error", code: "request_failed" })}\n\n`)); controller.close(); }
                }).finally(untrackTurn);
              },
              cancel() { turnController.abort(); },
            });
            return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
           }
           const fingerprint = idempotencyKey === null
             ? undefined
             : requestFingerprint(auth.principal.id, input);
           if (idempotencyKey !== null && fingerprint !== undefined) {
             const claim = await sessions.claimIdempotency(idempotencyKey, fingerprint);
             if (claim.status === "replay") return json(claim.terminalPayload);
             if (claim.status === "pending") return json({ error: "idempotency_pending" }, 409);
           }
           const turnController = new AbortController();
          const untrackTurn = trackTurn(turnController);
           try {
             const result = await executeTurn(auth.principal, { ...input, requestId }, turnController.signal, () => undefined);
             if (idempotencyKey !== null && fingerprint !== undefined) {
               await sessions.completeIdempotency(idempotencyKey, fingerprint, result as JsonValue);
             }
             return json(result);
          } finally {
            untrackTurn();
          }
         } catch (error) {
           if (error instanceof IdempotencyConflictError) return json({ error: "idempotency_conflict" }, 409);
           return json({ error: error instanceof OwnershipError ? "forbidden" : "request_failed" }, error instanceof OwnershipError ? 403 : 400);
         }
      }

      if (options.staticRoot !== undefined) return serveStatic(request, { root: options.staticRoot });
      return json({ error: "not_found" }, 404);
    },
    websocket: {
      open(socket) {
        socketTurns.set(socket, new Map());
        socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "connected" }));
      },
      message(socket, message) {
        const turns = socketTurns.get(socket) ?? new Map<string, AbortController>();
        socketTurns.set(socket, turns);
        void (async () => {
          try {
            const value: unknown = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
            if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("message is invalid");
            const record = value as Record<string, unknown>;
            if (record.type === "permission_response") {
              if (typeof record.requestId !== "string" || typeof record.callId !== "string" || (record.decision !== "allow" && record.decision !== "deny")) throw new TypeError("permission response is invalid");
              const approvals = pendingApprovals.get(socket);
              const pending = approvals?.get(`${record.requestId}:${record.callId}`);
              if (pending === undefined) throw new TypeError("permission response is not pending");
              approvals?.delete(`${record.requestId}:${record.callId}`);
              pending.resolve(record.decision);
              return;
            }
            if (record.type === "chat.cancel" && typeof record.requestId === "string") { turns.get(record.requestId)?.abort(); return; }
            if (record.type !== "chat.start" || typeof record.requestId !== "string" || typeof record.csrfToken !== "string") throw new TypeError("message type is invalid");
             if (record.csrfToken !== identity.csrfToken(socket.data.token)) throw new AuthenticationError("CSRF validation failed");
             const requestId = record.requestId;
             const { type: _type, csrfToken: _csrfToken, ...chatRecord } = record;
             const input = turnInput(chatRecord);
            const controller = new AbortController();
            const untrackTurn = trackTurn(controller);
            turns.set(requestId, controller);
            try {
              let sequence = 0;
              const approvalPolicy: HarnessApprovalPolicy = approval => new Promise<"allow" | "deny">(resolveDecision => {
                const approvals = pendingApprovals.get(socket) ?? new Map();
                pendingApprovals.set(socket, approvals);
                const key = `${approval.requestId}:${approval.call.id}`;
                const finish = (decision: "allow" | "deny") => {
                  approvals.delete(key);
                  controller.signal.removeEventListener("abort", onAbort);
                  resolveDecision(decision);
                };
                const onAbort = () => finish("deny");
                approvals.set(key, { resolve: finish });
                controller.signal.addEventListener("abort", onAbort, { once: true });
                if (controller.signal.aborted) finish("deny");
              });
              await executeTurn(socket.data.principal, { ...input, requestId }, controller.signal, event => { socket.send(eventJson(requestId, sequence++, event)); }, approvalPolicy);
            } finally {
              const approvals = pendingApprovals.get(socket);
              for (const approval of approvals?.keys() ?? []) {
                if (approval.startsWith(`${requestId}:`)) approvals?.get(approval)?.resolve("deny");
              }
              turns.delete(requestId);
              untrackTurn();
            }
          } catch (error) {
            socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "error", code: error instanceof AuthenticationError ? "unauthorized" : "request_failed", message: "Request failed" }));
          }
        })();
      },
      close(socket) {
        for (const controller of socketTurns.get(socket)?.values() ?? []) controller.abort();
        for (const approval of pendingApprovals.get(socket)?.values() ?? []) approval.resolve("deny");
        pendingApprovals.delete(socket);
        socketTurns.delete(socket);
      },
    },
  });

  automationScheduler.start();

  const waitForDrain = (): Promise<void> => new Promise(resolve => {
    const deadline = Date.now() + shutdownTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (activeTurns.size === 0 || Date.now() >= deadline) {
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      } else {
        timer = setTimeout(check, 10);
      }
    };
    check();
  });
  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    shutdownPromise = (async () => {
      await automationScheduler.stop();
      void Promise.resolve(server.stop(false)).catch(() => undefined);
      for (const controller of activeTurns) controller.abort();
      await waitForDrain();
      try {
        await server.stop(true);
      } finally {
        await integrations.closeAll();
        sessions.close();
        identity.close();
      }
    })();
    return shutdownPromise;
  };
  return Object.assign(server, { shutdown });
}

if (import.meta.main) {
  const port = Number(process.env.SUBPOLAR_PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SUBPOLAR_PORT must be a valid TCP port");
  }
  const server = startApiGatewayServer({
    hostname: process.env.SUBPOLAR_HOST ?? "127.0.0.1",
    port,
    staticRoot: process.env.SUBPOLAR_STATIC_ROOT ?? resolve(process.cwd(), "packages/web-ui/dist"),
    ...(process.env.SUBPOLAR_DATA_DIR === undefined ? {} : { dataDir: process.env.SUBPOLAR_DATA_DIR }),
  });
  const shutdown = () => { void server.shutdown().then(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
