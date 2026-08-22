import type { ModelProviderDefinition } from "@hermes/shared/model-providers";

export type SubpolarUser = { readonly id: string; readonly username: string };
export type SubpolarProjectRepository = { readonly url: string; readonly credentialId?: string; readonly defaultBranch?: string; readonly remoteName: string };
export type SubpolarProject = { readonly id: string; readonly ownerId: string; readonly name: string; readonly description: string; readonly workspace: string; readonly instructions: string; readonly repository?: SubpolarProjectRepository; readonly defaultAgentId?: string; readonly settings: Record<string, unknown>; readonly createdAt: string };
export type SubpolarGitCredential = { readonly id: string; readonly ownerId: string; readonly name: string; readonly provider: 'github' | 'gitlab' | 'gitea' | 'generic'; readonly username?: string; readonly createdAt: string; readonly updatedAt: string };
export type SubpolarGitStatus = { readonly branch: string; readonly clean: boolean; readonly entries: readonly { readonly path: string; readonly status: string; readonly staged: boolean; readonly unstaged: boolean; readonly added: boolean; readonly modified: boolean; readonly deleted: boolean; readonly untracked: boolean }[] };
export type AgentCapabilityAssignment = { readonly capabilityId: string; readonly enabled: boolean };
export type AgentPermissionPolicy = { readonly capabilityId: string; readonly policy: "allow" | "ask" | "deny" };
export type SubpolarCapability = { readonly capabilityId: string; readonly name: string; readonly description: string; readonly source: string; readonly capabilities: readonly unknown[] | Record<string, unknown>; readonly defaultPolicy: "allow" | "ask" | "deny"; readonly integrationId?: string; readonly integrationName?: string; readonly integrationType?: string; readonly nativeName?: string; readonly displayName?: string };
export type SubpolarIntegrationCapability = { readonly capabilityId: string; readonly name: string; readonly description: string; readonly source: string; readonly capabilities: readonly string[] | Record<string, unknown>; readonly integrationId: string; readonly nativeName?: string; readonly displayName?: string };
export type SubpolarIntegration = { readonly id: string; readonly ownerId: string; readonly name: string; readonly type: string; readonly enabled: boolean; readonly status: "connected" | "disconnected" | "authentication_required" | "configuration_error" | "unknown"; readonly config: Record<string, unknown>; readonly capabilities: readonly SubpolarIntegrationCapability[]; readonly lastSuccessfulDiscovery?: string; readonly lastError?: string; readonly createdAt: string; readonly updatedAt: string };
export type SubpolarIntegrationInput = { readonly name: string; readonly type: string; readonly enabled?: boolean; readonly config: Record<string, unknown>; readonly secrets?: Record<string, unknown> };
export type SubpolarAgent = { readonly id: string; readonly ownerId: string; readonly projectId: string; readonly name: string; readonly description: string; readonly icon: string; readonly instructions: string; readonly model?: string; readonly reasoningEffort?: string; readonly capabilities: readonly AgentCapabilityAssignment[]; readonly permissions: readonly AgentPermissionPolicy[]; readonly skillIds: readonly string[]; readonly createdAt: string };
export type SubpolarAgentUpdate = Partial<Pick<SubpolarAgent, "name" | "description" | "icon" | "instructions" | "capabilities" | "permissions" | "skillIds">> & { readonly model?: string | null; readonly reasoningEffort?: string | null };
export type SubpolarSkill = { readonly id: string; readonly ownerId: string; readonly name: string; readonly description: string; readonly instructions: string; readonly enabled: boolean; readonly createdAt: string; readonly updatedAt: string; readonly assignmentCount?: number };
export type SubpolarSkillInput = { readonly name: string; readonly description: string; readonly instructions: string; readonly enabled: boolean };
export type SubpolarPromptCommand = { readonly id: string; readonly ownerId: string; readonly name: string; readonly description: string; readonly prompt: string; readonly enabled: boolean; readonly createdAt: string; readonly updatedAt: string };
export type SubpolarPromptCommandInput = { readonly name: string; readonly description: string; readonly prompt: string; readonly enabled: boolean };
export type SubpolarSession = { readonly sessionId: string; readonly ownerId: string; readonly projectId?: string; readonly agentId?: string; readonly createdAt: string };
export type SubpolarMessage = { readonly role: "system" | "user" | "assistant" | "tool"; readonly content: string | readonly Record<string, unknown>[]; readonly sequence?: number };
export type SubpolarSetupStatus = { readonly complete: boolean; readonly providerConfigured: boolean };
export type SubpolarModelDefaults = { readonly conversation: string; readonly internal: string; readonly voice: string; readonly image: string };

export class SubpolarApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SubpolarApiError";
    this.status = status;
  }
}

function csrfToken(): string {
  const cookie = typeof document === "undefined" ? "" : document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith("subpolar_csrf="));
  return cookie === undefined ? "" : decodeURIComponent(cookie.slice("subpolar_csrf=".length));
}

export async function subpolarRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    headers.set("x-csrf-token", csrfToken());
    if (!headers.has("content-type") && init.body !== undefined) headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, method, headers, credentials: "include" });
  if (!response.ok) {
    let message = response.statusText || "Request failed";
    try { message = ((await response.json()) as { error?: string }).error ?? message; } catch { /* keep status text */ }
    throw new SubpolarApiError(response.status, message);
  }
  return await response.json() as T;
}

export function bootstrapStatus(): Promise<{ readonly required: boolean }> {
  return subpolarRequest("/v1/auth/bootstrap");
}

export function bootstrap(username: string, password: string): Promise<{ readonly user: SubpolarUser }> {
  return subpolarRequest("/v1/auth/bootstrap", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function login(username: string, password: string): Promise<{ readonly user: SubpolarUser }> {
  return subpolarRequest("/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<{ readonly ok: true }> {
  return subpolarRequest("/v1/auth/logout", { method: "POST" });
}

export function currentUser(): Promise<{ readonly user: SubpolarUser }> {
  return subpolarRequest("/v1/me");
}

export function setupStatus(): Promise<SubpolarSetupStatus> {
  return subpolarRequest("/v1/setup");
}

export function modelDefaults(): Promise<SubpolarModelDefaults> {
  return subpolarRequest("/v1/settings/models");
}

export function saveModelDefaults(defaults: SubpolarModelDefaults): Promise<SubpolarModelDefaults> {
  return subpolarRequest("/v1/settings/models", { method: "PUT", body: JSON.stringify(defaults) });
}

export function setupProviders(): Promise<{ readonly providers: readonly ModelProviderDefinition[] }> {
  return subpolarRequest("/v1/setup/providers");
}

export function configureProvider(providerId: string, baseUrl: string, apiKey: string, model: string): Promise<{ readonly configured: true }> {
  return subpolarRequest("/v1/setup/provider", { method: "POST", body: JSON.stringify({ providerId, baseUrl, apiKey, model }) });
}

export function startProviderOAuth(providerId: string, baseUrl: string, model: string): Promise<{ readonly authorizationUrl: string }> {
  return subpolarRequest(`/v1/providers/${encodeURIComponent(providerId)}/auth/start?${new URLSearchParams({ baseUrl, model })}`);
}

export function startProviderDeviceAuth(providerId: string): Promise<{ readonly deviceCode: string; readonly userCode?: string; readonly verificationUri?: string; readonly verificationUriComplete?: string }> {
  return subpolarRequest(`/v1/providers/${encodeURIComponent(providerId)}/auth/device/start`, { method: "POST" });
}

export function completeProviderDeviceAuth(providerId: string, deviceCode: string): Promise<{ readonly configured: true }> {
  return subpolarRequest(`/v1/providers/${encodeURIComponent(providerId)}/auth/device/complete`, { method: "POST", body: JSON.stringify({ deviceCode }) });
}

export type SubpolarModelProvider = { readonly id: string; readonly models: readonly { readonly id: string; readonly label: string }[] };

export function availableModels(): Promise<{ readonly providers: readonly SubpolarModelProvider[] }> {
  return subpolarRequest("/v1/models");
}

export function createInitialAgents(templates: readonly string[]): Promise<{ readonly project: SubpolarProject; readonly agents: readonly SubpolarAgent[] }> {
  return subpolarRequest("/v1/setup/agents", { method: "POST", body: JSON.stringify({ templates }) });
}

export function projects(): Promise<{ readonly projects: readonly SubpolarProject[] }> {
  return subpolarRequest("/v1/projects");
}

export function createProject(name: string): Promise<{ readonly project: SubpolarProject }> {
  return subpolarRequest("/v1/projects", { method: "POST", body: JSON.stringify({ name, workspaceMode: 'create' }) });
}

export type SubpolarProjectCreateInput = { readonly name: string; readonly description?: string; readonly instructions?: string; readonly workspaceMode: 'create' | 'existing' | 'clone'; readonly workspacePath?: string; readonly repository?: SubpolarProjectRepository };
export function createProjectFromInput(input: SubpolarProjectCreateInput): Promise<{ readonly project: SubpolarProject }> { return subpolarRequest('/v1/projects', { method: 'POST', body: JSON.stringify(input) }); }
export function updateProject(projectId: string, input: Partial<SubpolarProjectCreateInput> & { readonly defaultAgentId?: string }): Promise<{ readonly project: SubpolarProject }> { return subpolarRequest(`/v1/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify(input) }); }
export function gitCredentials(): Promise<{ readonly credentials: readonly SubpolarGitCredential[] }> { return subpolarRequest('/v1/git/credentials'); }
export function createGitCredential(input: { readonly name: string; readonly provider: SubpolarGitCredential['provider']; readonly username?: string; readonly token?: string; readonly password?: string; readonly privateKey?: string; readonly passphrase?: string }): Promise<{ readonly credential: SubpolarGitCredential }> { return subpolarRequest('/v1/git/credentials', { method: 'POST', body: JSON.stringify(input) }); }
export function gitStatus(projectId: string): Promise<SubpolarGitStatus> { return subpolarRequest(`/v1/projects/${encodeURIComponent(projectId)}/git/status`); }
export function gitDiff(projectId: string, path?: string): Promise<{ readonly diff: string }> { return subpolarRequest(`/v1/projects/${encodeURIComponent(projectId)}/git/diff${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}`); }

export function agents(projectId?: string): Promise<{ readonly agents: readonly SubpolarAgent[] }> {
  return subpolarRequest(`/v1/agents${projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`}`);
}

export function createAgent(projectId: string, name: string, instructions: string, icon: string): Promise<{ readonly agent: SubpolarAgent }> {
  return subpolarRequest("/v1/agents", { method: "POST", body: JSON.stringify({ projectId, name, instructions, icon }) });
}

export function updateAgent(agentId: string, changes: SubpolarAgentUpdate): Promise<{ readonly agent: SubpolarAgent }> {
  return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function getAgent(agentId: string): Promise<{ readonly agent: SubpolarAgent }> {
  return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`);
}

export function deleteAgent(agentId: string): Promise<{ readonly deleted: true }> {
  return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}

export function skills(): Promise<{ readonly skills: readonly SubpolarSkill[] }> {
  return subpolarRequest("/v1/skills");
}

export function createSkill(input: SubpolarSkillInput): Promise<{ readonly skill: SubpolarSkill }> {
  return subpolarRequest("/v1/skills", { method: "POST", body: JSON.stringify(input) });
}

export function updateSkill(skillId: string, changes: Partial<SubpolarSkillInput>): Promise<{ readonly skill: SubpolarSkill }> {
  return subpolarRequest(`/v1/skills/${encodeURIComponent(skillId)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function deleteSkill(skillId: string): Promise<{ readonly deleted: true }> {
  return subpolarRequest(`/v1/skills/${encodeURIComponent(skillId)}`, { method: "DELETE" });
}

export function promptCommands(): Promise<{ readonly commands: readonly SubpolarPromptCommand[] }> {
  return subpolarRequest("/v1/prompt-commands");
}

export function createPromptCommand(input: SubpolarPromptCommandInput): Promise<{ readonly command: SubpolarPromptCommand }> {
  return subpolarRequest("/v1/prompt-commands", { method: "POST", body: JSON.stringify(input) });
}

export function updatePromptCommand(commandId: string, changes: Partial<SubpolarPromptCommandInput>): Promise<{ readonly command: SubpolarPromptCommand }> {
  return subpolarRequest(`/v1/prompt-commands/${encodeURIComponent(commandId)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function deletePromptCommand(commandId: string): Promise<{ readonly deleted: true }> {
  return subpolarRequest(`/v1/prompt-commands/${encodeURIComponent(commandId)}`, { method: "DELETE" });
}

export function effectiveAgent(agentId: string, projectId?: string): Promise<Record<string, unknown>> {
  const query = projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`;
  return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}/effective${query}`);
}

export function capabilities(): Promise<{ readonly capabilities: readonly SubpolarCapability[] }> {
  return subpolarRequest("/v1/capabilities");
}

export function integrations(): Promise<{ readonly integrations: readonly SubpolarIntegration[] }> {
  return subpolarRequest("/v1/integrations");
}

export function createIntegration(input: SubpolarIntegrationInput): Promise<{ readonly integration: SubpolarIntegration }> {
  return subpolarRequest("/v1/integrations", { method: "POST", body: JSON.stringify(input) });
}

export function updateIntegration(integrationId: string, input: Partial<SubpolarIntegrationInput>): Promise<{ readonly integration: SubpolarIntegration }> {
  return subpolarRequest(`/v1/integrations/${encodeURIComponent(integrationId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteIntegration(integrationId: string): Promise<{ readonly deleted: true }> {
  return subpolarRequest(`/v1/integrations/${encodeURIComponent(integrationId)}`, { method: "DELETE" });
}

export function testIntegration(integrationId: string): Promise<{ readonly integration: SubpolarIntegration }> {
  return subpolarRequest(`/v1/integrations/${encodeURIComponent(integrationId)}/test`, { method: "POST" });
}

export function startIntegrationOAuth(integrationId: string): Promise<{ readonly authorizationUrl: string }> {
  return subpolarRequest(`/v1/integrations/${encodeURIComponent(integrationId)}/oauth/start`);
}

export function revokeIntegrationOAuth(integrationId: string): Promise<{ readonly integration: SubpolarIntegration }> {
  return subpolarRequest(`/v1/integrations/${encodeURIComponent(integrationId)}/oauth/revoke`, { method: "POST" });
}

export function sessions(): Promise<{ readonly sessions: readonly SubpolarSession[] }> {
  return subpolarRequest("/v1/sessions");
}

export function sessionTranscript(sessionId: string): Promise<{ readonly session: unknown; readonly messages: readonly SubpolarMessage[] }> {
  return subpolarRequest(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}
