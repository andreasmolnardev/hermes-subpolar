import type { ModelProviderDefinition } from "@hermes/shared/model-providers";
import type { SubpolarChatRequest } from "./subpolar-client";

export type SubpolarUser = { readonly id: string; readonly username: string };
export type SubpolarProject = { readonly id: string; readonly ownerId: string; readonly name: string; readonly createdAt: string };
export type SubpolarAgent = { readonly id: string; readonly ownerId: string; readonly projectId: string; readonly name: string; readonly description: string; readonly icon?: string; readonly instructions: string; readonly model?: string; readonly reasoningEffort?: string; readonly capabilities: readonly { readonly capabilityId: string; readonly enabled: boolean }[]; readonly permissions: readonly { readonly capabilityId: string; readonly policy: "allow" | "ask" | "deny" }[]; readonly skillIds: readonly string[]; readonly createdAt: string };
export type SubpolarAgentUpdate = Partial<Pick<SubpolarAgent, "name" | "description" | "icon" | "instructions" | "model" | "reasoningEffort" | "capabilities" | "permissions" | "skillIds">>;
export type SubpolarSession = { readonly sessionId: string; readonly ownerId: string; readonly projectId?: string; readonly agentId?: string; readonly createdAt: string };
export type SubpolarMessage = { readonly role: "system" | "user" | "assistant" | "tool"; readonly content: string | readonly Record<string, unknown>[]; readonly sequence?: number };
export type SubpolarSetupStatus = { readonly complete: boolean; readonly providerConfigured: boolean };
export type SubpolarRequestInit = RequestInit & { readonly requestId?: string };

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

export async function subpolarRequest<T>(path: string, init: SubpolarRequestInit = {}): Promise<T> {
  const { requestId, ...requestInit } = init;
  const method = (requestInit.method ?? "GET").toUpperCase();
  const headers = new Headers(requestInit.headers);
  if (method !== "GET" && method !== "HEAD") {
    headers.set("x-csrf-token", csrfToken());
    if (!headers.has("content-type") && requestInit.body !== undefined) headers.set("content-type", "application/json");
  }
  if (requestId !== undefined && requestId.length > 0) headers.set("Idempotency-Key", requestId);
  const response = await fetch(path, { ...requestInit, method, headers, credentials: "include" });
  if (!response.ok) {
    let message = response.statusText || "Request failed";
    try { message = ((await response.json()) as { error?: string }).error ?? message; } catch { /* keep status text */ }
    throw new SubpolarApiError(response.status, message);
  }
  return await response.json() as T;
}

export function chatCompletion(request: SubpolarChatRequest, stream = false): Promise<unknown> {
  return subpolarRequest("/v1/chat/completions", {
    method: "POST",
    requestId: request.requestId,
    body: JSON.stringify({ ...request, ...(stream ? { stream: true } : {}) }),
  });
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

export function setupProviders(): Promise<{ readonly providers: readonly ModelProviderDefinition[] }> {
  return subpolarRequest("/v1/setup/providers");
}

export function configureProvider(provider: string, baseUrl: string, apiKey: string, model: string): Promise<{ readonly configured: true }> {
  return subpolarRequest("/v1/setup/provider", { method: "POST", body: JSON.stringify({ provider, baseUrl, apiKey, model }) });
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

export function createAgent(projectId: string, name: string, instructions: string): Promise<{ readonly agent: SubpolarAgent }> {
  return subpolarRequest("/v1/agents", { method: "POST", body: JSON.stringify({ projectId, name, instructions }) });
}

export function agent(agentId: string): Promise<{ readonly agent: SubpolarAgent }> { return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`); }
export function updateAgent(agentId: string, update: SubpolarAgentUpdate): Promise<{ readonly agent: SubpolarAgent }> { return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(update) }); }
export function deleteAgent(agentId: string): Promise<{ readonly deleted: true }> { return subpolarRequest(`/v1/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" }); }

export function sessions(): Promise<{ readonly sessions: readonly SubpolarSession[] }> {
  return subpolarRequest("/v1/sessions");
}

export function sessionTranscript(sessionId: string): Promise<{ readonly session: unknown; readonly messages: readonly SubpolarMessage[] }> {
  return subpolarRequest(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}
