import type { ModelProviderDefinition } from "@hermes/shared/model-providers";

export type SubpolarUser = { readonly id: string; readonly username: string };
export type SubpolarProject = { readonly id: string; readonly ownerId: string; readonly name: string; readonly createdAt: string };
export type AgentCapabilityAssignment = { readonly capabilityId: string; readonly enabled: boolean };
export type AgentPermissionPolicy = { readonly capabilityId: string; readonly policy: "allow" | "ask" | "deny" };
export type SubpolarCapability = { readonly capabilityId: string; readonly name: string; readonly description: string; readonly source: string; readonly capabilities: readonly unknown[]; readonly defaultPolicy: "allow" | "ask" | "deny" };
export type SubpolarAgent = { readonly id: string; readonly ownerId: string; readonly projectId: string; readonly name: string; readonly description: string; readonly icon: string; readonly instructions: string; readonly model?: string; readonly reasoningEffort?: string; readonly capabilities: readonly AgentCapabilityAssignment[]; readonly permissions: readonly AgentPermissionPolicy[]; readonly skillIds: readonly string[]; readonly createdAt: string };
export type SubpolarAgentUpdate = Partial<Pick<SubpolarAgent, "name" | "description" | "icon" | "instructions" | "capabilities" | "permissions" | "skillIds">> & { readonly model?: string | null; readonly reasoningEffort?: string | null };
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
  return subpolarRequest("/v1/projects", { method: "POST", body: JSON.stringify({ name }) });
}

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

export function effectiveAgent(agentId: string, projectId?: string): Promise<Record<string, unknown>> {
  const query = projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`;
  return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}/effective${query}`);
}

export function capabilities(): Promise<{ readonly capabilities: readonly SubpolarCapability[] }> {
  return subpolarRequest("/v1/capabilities");
}

export function sessions(): Promise<{ readonly sessions: readonly SubpolarSession[] }> {
  return subpolarRequest("/v1/sessions");
}

export function sessionTranscript(sessionId: string): Promise<{ readonly session: unknown; readonly messages: readonly SubpolarMessage[] }> {
  return subpolarRequest(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}
