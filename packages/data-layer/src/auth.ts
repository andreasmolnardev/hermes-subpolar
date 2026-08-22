import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";

export type IdentityUser = {
  readonly id: string;
  readonly username: string;
};

export type AuthenticatedPrincipal = IdentityUser;

export type AuthSession = {
  readonly principal: IdentityUser;
  readonly token: string;
  readonly csrfToken: string;
  readonly expiresAt: string;
};

export type ProjectRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string;
  readonly workspace: string;
  readonly instructions: string;
  readonly repository?: ProjectRepositoryConfig;
  readonly defaultAgentId?: string;
  readonly settings: Record<string, unknown>;
  readonly createdAt: string;
};

export type ProjectRepositoryConfig = {
  readonly url: string;
  readonly credentialId?: string;
  readonly defaultBranch?: string;
  readonly remoteName: string;
};

export type ProjectInput = {
  readonly name: string;
  readonly description?: string;
  readonly workspace?: string;
  readonly instructions?: string;
  readonly repository?: ProjectRepositoryConfig;
  readonly defaultAgentId?: string;
  readonly settings?: Record<string, unknown>;
  readonly id?: string;
};

export type GitCredentialRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly provider: "github" | "gitlab" | "gitea" | "generic";
  readonly username?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type GitCredentialInput = {
  readonly name: string;
  readonly provider: GitCredentialRecord["provider"];
  readonly username?: string;
  readonly token?: string;
  readonly password?: string;
  readonly privateKey?: string;
  readonly passphrase?: string;
};

export type AgentRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly instructions: string;
  readonly model?: string | null;
  readonly reasoningEffort?: string | null;
  readonly capabilities: readonly AgentCapabilityAssignment[];
  readonly permissions: readonly AgentPermissionPolicy[];
  readonly skillIds: readonly string[];
  readonly createdAt: string;
  readonly capabilityMode: "legacy" | "explicit";
};

export type SkillRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SkillInput = {
  readonly name: string;
  readonly description?: string;
  readonly instructions: string;
  readonly enabled?: boolean;
};

export type PromptCommandRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PromptCommandInput = {
  readonly name: string;
  readonly description?: string;
  readonly prompt: string;
  readonly enabled?: boolean;
};

export type AgentCapabilityAssignment = { readonly capabilityId: string; readonly enabled: boolean };
export type AgentPermission = "allow" | "ask" | "deny";
export type AgentPermissionPolicy = { readonly capabilityId: string; readonly policy: AgentPermission };
export type AgentConfigurationInput = {
  readonly name?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly instructions?: string;
  readonly model?: string | null;
  readonly reasoningEffort?: string | null;
  readonly capabilities?: readonly AgentCapabilityAssignment[];
  readonly permissions?: readonly AgentPermissionPolicy[];
  readonly skillIds?: readonly string[];
};
export type AgentProjectOverride = {
  readonly projectId: string;
  readonly agentId: string;
  readonly capabilities?: readonly AgentCapabilityAssignment[];
  readonly permissions?: readonly AgentPermissionPolicy[];
  readonly model?: string;
  readonly reasoningEffort?: string;
};

export type OwnedSessionRecord = {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly createdAt: string;
};

export type AutomationSchedule =
  | { readonly kind: "cron"; readonly expression: string; readonly timezone: string }
  | { readonly kind: "once"; readonly at: string; readonly timezone: string };

export type AutomationPermissionMode = "read-only" | "pre-approved" | "fail";

export type AutomationRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly schedule: AutomationSchedule;
  readonly prompt: string;
  readonly agentId: string;
  readonly projectId?: string;
  readonly model?: string;
  readonly permissionMode: AutomationPermissionMode;
  readonly metadata: Record<string, unknown>;
  readonly lastRunAt?: string;
  readonly nextRunAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AutomationInput = {
  readonly name: string;
  readonly enabled?: boolean;
  readonly schedule: AutomationSchedule;
  readonly prompt: string;
  readonly agentId: string;
  readonly projectId?: string | null;
  readonly model?: string | null;
  readonly permissionMode: AutomationPermissionMode;
  readonly metadata?: Record<string, unknown>;
  /** Scheduler-computed next occurrence. This is never accepted from the browser. */
  readonly nextRunAt?: string | null;
};

export type AutomationRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "needs_attention";

export type AutomationRunRecord = {
  readonly id: string;
  readonly automationId: string;
  readonly ownerId: string;
  readonly status: AutomationRunStatus;
  readonly scheduledFor: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly sessionId: string;
  readonly error?: string;
  readonly triggerMetadata: Record<string, unknown>;
};

export type ProviderConnection = {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly credentialHandle: string;
  readonly model: string;
};

export type ProviderCredentials = {
  readonly apiKey?: string;
  readonly accessToken?: string;
  readonly copilotToken?: string;
  readonly refreshToken?: string;
  readonly tokenType?: string;
  readonly expiresAt?: number;
  readonly subject?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
  readonly region?: string;
  readonly projectId?: string;
  readonly clientEmail?: string;
  readonly privateKey?: string;
  readonly executable?: string;
  readonly arguments?: readonly string[];
};

export type IntegrationType = "mcp" | "openapi" | (string & {});
export type IntegrationStatus = "connected" | "disconnected" | "authentication_required" | "configuration_error" | "unknown";
export type IntegrationCapabilityRecord = {
  readonly capabilityId: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly capabilities: readonly string[] | Record<string, unknown>;
  readonly integrationId: string;
  readonly nativeName?: string;
  readonly displayName?: string;
  readonly inputSchema?: Record<string, unknown> | boolean;
  readonly discoveredAt?: string;
  readonly expiresAt?: string;
};
export type IntegrationRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly type: IntegrationType;
  readonly enabled: boolean;
  readonly status: IntegrationStatus;
  readonly protocol?: "modern" | "legacy";
  readonly config: Record<string, unknown>;
  readonly capabilities: readonly IntegrationCapabilityRecord[];
  readonly lastSuccessfulDiscovery?: string;
  readonly lastError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type IntegrationInput = {
  readonly name: string;
  readonly type: IntegrationType;
  readonly enabled?: boolean;
  readonly config: Record<string, unknown>;
  /** Never returned; values are encrypted before persistence. */
  readonly secrets?: Record<string, unknown>;
};
export type IntegrationRuntimeConfig = { readonly integration: IntegrationRecord; readonly secrets: Record<string, unknown> };
export type IntegrationOAuthState = { readonly integrationId: string; readonly ownerId: string; readonly redirectUri: string; readonly codeVerifier: string };

export type ProviderOAuthState = {
  readonly state: string;
  readonly ownerId: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
  readonly expiresAt: string;
};

export type SetupStatus = {
  readonly complete: boolean;
  readonly providerConfigured: boolean;
};

export type ModelDefaults = {
  readonly conversation: string;
  readonly internal: string;
  readonly voice: string;
  readonly image: string;
};

export type VoiceSpeechSettings = {
  readonly provider: string;
  readonly model: string;
  readonly language: string;
  readonly endpoint: string;
  readonly configured: boolean;
};

export type VoiceSynthesisSettings = {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly endpoint: string;
  readonly autoPlay: boolean;
  readonly configured: boolean;
};

export type VoiceSettings = {
  readonly stt: VoiceSpeechSettings;
  readonly tts: VoiceSynthesisSettings;
};

export type VoiceSettingsInput = {
  readonly stt: VoiceSpeechSettingsInput;
  readonly tts: VoiceSynthesisSettingsInput;
};

export type VoiceSpeechSettingsInput = {
  readonly provider: string;
  readonly model: string;
  readonly language: string;
  readonly endpoint: string;
  readonly apiKey?: string;
};

export type VoiceSynthesisSettingsInput = {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly endpoint: string;
  readonly autoPlay: boolean;
  readonly apiKey?: string;
};

export type VoiceProviderRuntime = {
  readonly settings: VoiceSettings;
  readonly sttApiKey?: string;
  readonly ttsApiKey?: string;
};

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class OwnershipError extends Error {
  constructor(message = "Resource is not owned by the authenticated user") {
    super(message);
    this.name = "OwnershipError";
  }
}

type Row = {
  id: string;
  username?: string;
  password_hash?: string;
  expires_at?: string;
  revoked?: number;
  owner_id?: string;
  project_id?: string;
  name?: string;
  description?: string;
  icon?: string;
  instructions?: string;
  capability_mode?: string;
  created_at?: string;
};

type ProjectDbRow = { id: string; owner_id: string; name: string; description: string; workspace: string; instructions: string; repository_json: string | null; default_agent_id: string | null; settings_json: string; created_at: string };
type AutomationDbRow = { id: string; owner_id: string; name: string; enabled: number; schedule_json: string; prompt: string; agent_id: string; project_id: string | null; model: string | null; permission_mode: string; metadata_json: string; last_run_at: string | null; next_run_at: string | null; created_at: string; updated_at: string };
type AutomationRunDbRow = { id: string; automation_id: string; owner_id: string; status: string; scheduled_for: string; started_at: string | null; completed_at: string | null; session_id: string; error: string | null; trigger_metadata_json: string };

const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  repository_json TEXT,
  default_agent_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE TABLE IF NOT EXISTS git_credentials (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'gitea', 'generic')),
  username TEXT,
  secrets_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_git_credentials_owner ON git_credentials(owner_id, created_at, id);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'bot',
  instructions TEXT NOT NULL,
  capability_mode TEXT NOT NULL DEFAULT 'legacy' CHECK (capability_mode IN ('legacy', 'explicit')),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, project_id, name)
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_owner_updated ON skills(owner_id, updated_at, id);
CREATE TABLE IF NOT EXISTS agent_capabilities (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (agent_id, capability_id)
);
CREATE TABLE IF NOT EXISTS agent_permissions (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy IN ('allow', 'ask', 'deny')),
  PRIMARY KEY (agent_id, capability_id)
);
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id);
CREATE TABLE IF NOT EXISTS prompt_commands (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_prompt_commands_owner_updated ON prompt_commands(owner_id, updated_at, id);
CREATE TABLE IF NOT EXISTS agent_model_config (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  model TEXT,
  reasoning_effort TEXT
);
CREATE TABLE IF NOT EXISTS agent_project_overrides (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capabilities_json TEXT,
  permissions_json TEXT,
  model TEXT,
  reasoning_effort TEXT,
  PRIMARY KEY (project_id, agent_id)
);
CREATE TABLE IF NOT EXISTS session_owners (
  session_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_owners_user ON session_owners(owner_id, created_at);
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  schedule_json TEXT NOT NULL,
  prompt TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  project_id TEXT,
  model TEXT,
  permission_mode TEXT NOT NULL CHECK (permission_mode IN ('read-only', 'pre-approved', 'fail')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_automations_due ON automations(enabled, next_run_at);
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'needs_attention')),
  scheduled_for TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  session_id TEXT NOT NULL,
  error TEXT,
  trigger_metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(automation_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_history ON automation_runs(automation_id, scheduled_for DESC);
CREATE TABLE IF NOT EXISTS provider_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai-api',
  base_url TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_verifier_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_oauth_states_expiry ON provider_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS user_model_defaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  conversation TEXT NOT NULL,
  internal TEXT NOT NULL,
  voice TEXT NOT NULL,
  image TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_voice_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stt_json TEXT NOT NULL,
  tts_json TEXT NOT NULL,
  secrets_ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  secrets_ciphertext TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'unknown',
  protocol TEXT,
  last_successful_discovery TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_integrations_owner ON integrations(owner_id, updated_at, id);
CREATE TABLE IF NOT EXISTS integration_capabilities (
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  native_name TEXT,
  display_name TEXT,
  input_schema_json TEXT,
  discovered_at TEXT,
  expires_at TEXT,
  PRIMARY KEY (integration_id, capability_id)
);
CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_verifier_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_oauth_expiry ON integration_oauth_states(expires_at);
`;

// Keep persistence independent from the runtime/profile package boundary.
const SUPPORTED_PROVIDER_IDS = new Set([
  "openai-api", "openrouter", "deepseek", "xai", "xai-oauth", "nvidia", "fireworks", "groq",
  "together", "mistral", "perplexity", "moonshot", "kimi-coding", "kimi-coding-cn",
  "ai-gateway", "novita", "zai", "arcee", "gmi", "actual-computer", "minimax", "minimax-cn",
  "minimax-oauth", "alibaba-dashscope", "alibaba-coding-plan", "kilo-code", "xiaomi-mimo",
  "tencent-tokenhub", "opencode-zen", "opencode-go", "huggingface", "gemini", "vertex-ai",
  "ollama-cloud", "stepfun", "lm-studio", "anthropic", "anthropic-oauth", "nous-portal", "qwen-oauth",
  "copilot", "copilot-acp", "relay", "moa", "openai-responses", "openai-codex", "bedrock", "custom"
]);

const CREDENTIAL_KEY_BYTES = 32;
const CREDENTIAL_IV_BYTES = 12;
const CREDENTIAL_TAG_BYTES = 16;
const CREDENTIAL_KEY_FILE = "provider-credentials.key";
const CREDENTIAL_AAD = Buffer.from("hermes.provider-credential.v1");
const INTEGRATION_CREDENTIAL_AAD = Buffer.from("hermes.integration-credential.v1");
const VOICE_CREDENTIAL_AAD = Buffer.from("hermes.voice-credential.v1");

type ProviderRow = {
  provider: string;
  base_url: string;
  credential_ciphertext: string;
  model: string;
};

type IntegrationRow = {
  id: string; owner_id: string; name: string; type: string; config_json: string; secrets_ciphertext: string;
  enabled: number; status: string; protocol: string | null; last_successful_discovery: string | null; last_error: string | null;
  created_at: string; updated_at: string;
};

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function providerCredentialKey(path: string | null, createIfMissing: boolean): Buffer {
  if (path === null) return randomBytes(CREDENTIAL_KEY_BYTES);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("invalid provider credential key");
    const key = readFileSync(path);
    if (key.length !== CREDENTIAL_KEY_BYTES) throw new Error("invalid provider credential key");
    return key;
  } catch (error) {
    if (!isFileNotFound(error)) throw new Error("provider credential key is unavailable");
    if (!createIfMissing) throw new Error("provider credential key is unavailable");
    const key = randomBytes(CREDENTIAL_KEY_BYTES);
    try {
      writeFileSync(path, key, { flag: "wx", mode: 0o600 });
      chmodSync(path, 0o600);
      return key;
    } catch (writeError) {
      if (!isFileNotFound(writeError) && !(typeof writeError === "object" && writeError !== null && "code" in writeError && writeError.code === "EEXIST")) {
        throw new Error("provider credential key is unavailable");
      }
      return providerCredentialKey(path, createIfMissing);
    }
  }
}

function encryptJson(value: object, key: Buffer, aad: Buffer): string {
  const iv = randomBytes(CREDENTIAL_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64url")).join(".");
}

function encryptCredential(credentials: ProviderCredentials, key: Buffer): string { return encryptJson(credentials, key, CREDENTIAL_AAD); }

function decryptCredential(value: string, key: Buffer): ProviderCredentials {
  return decryptJson(value, key, CREDENTIAL_AAD) as ProviderCredentials;
}

function decryptJson(value: string, key: Buffer, aad: Buffer): Record<string, unknown> {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) throw new Error("invalid credential");
    const iv = Buffer.from(parts[0] ?? "", "base64url");
    const tag = Buffer.from(parts[1] ?? "", "base64url");
    const ciphertext = Buffer.from(parts[2] ?? "", "base64url");
    if (iv.length !== CREDENTIAL_IV_BYTES || tag.length !== CREDENTIAL_TAG_BYTES || ciphertext.length === 0) {
      throw new Error("invalid credential");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    if (plaintext.trim().length === 0) throw new Error("invalid credential");
    try {
      const parsed: unknown = JSON.parse(plaintext);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Credentials written before the provider registry stored the API key directly.
    }
    return { apiKey: plaintext };
  } catch {
    throw new Error("provider credential is unavailable");
  }
}

function encryptIntegrationSecrets(secrets: Record<string, unknown>, key: Buffer): string { return encryptJson(secrets, key, INTEGRATION_CREDENTIAL_AAD); }
function decryptIntegrationSecrets(value: string, key: Buffer): Record<string, unknown> { return decryptJson(value, key, INTEGRATION_CREDENTIAL_AAD); }
function encryptVoiceSecrets(secrets: Record<string, unknown>, key: Buffer): string { return encryptJson(secrets, key, VOICE_CREDENTIAL_AAD); }
function decryptVoiceSecrets(value: string, key: Buffer): Record<string, unknown> { return decryptJson(value, key, VOICE_CREDENTIAL_AAD); }

function providerSlug(value: unknown): string {
  if (typeof value !== "string") throw new Error("provider is invalid");
  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_PROVIDER_IDS.has(normalized)) throw new Error("provider is invalid");
  return normalized;
}

function providerBaseUrl(value: unknown): string {
  const candidate = value;
  if (typeof candidate !== "string" || candidate.trim().length === 0) throw new Error("provider URL is invalid");
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error("provider URL is invalid"); }
  if (candidate.includes("@") || candidate.includes("?") || candidate.includes("#") || parsed.username.length > 0 || parsed.password.length > 0 || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error("provider URL must not contain credentials or query state");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
    throw new Error("provider URL must use HTTPS");
  }
  return parsed.toString().replace(/\/$/, "");
}

function providerCredential(value: unknown): ProviderCredentials {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("provider credential is invalid");
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as ProviderCredentials;
  } catch {
    // API keys and OAuth access tokens are intentionally opaque strings.
  }
  return { apiKey: value };
}

function validCredentials(credentials: ProviderCredentials): ProviderCredentials {
  const hasSecret = [credentials.apiKey, credentials.accessToken, credentials.secretAccessKey, credentials.executable].some(value => typeof value === "string" && value.trim().length > 0);
  if (!hasSecret) throw new Error("provider credential is invalid");
  return credentials;
}

function providerModel(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) throw new Error("provider configuration is invalid");
  return value.trim();
}

function modelDefaults(value: Record<keyof ModelDefaults, unknown>): ModelDefaults {
  const requiredModel = (model: unknown): string => {
    if (typeof model !== "string" || model.trim().length === 0 || model.length > 256) throw new Error("model defaults are invalid");
    return model.trim();
  };
  return {
    conversation: requiredModel(value.conversation),
    internal: requiredModel(value.internal),
    voice: requiredModel(value.voice),
    image: requiredModel(value.image),
  };
}

function voiceProvider(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) throw new Error("voice provider is invalid");
  return value.trim().toLowerCase();
}

function voiceModel(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) throw new Error("voice model is invalid");
  return value.trim();
}

function voiceEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) throw new Error("voice endpoint is invalid");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("voice endpoint is invalid"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) throw new Error("voice endpoint must use HTTPS");
  if (parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") throw new Error("voice endpoint must not contain credentials or query state");
  return parsed.toString();
}

function voiceLanguage(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) throw new Error("voice language is invalid");
  return value.trim() || "auto";
}

function voiceSpeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.25 || value > 4) throw new Error("voice speed is invalid");
  return value;
}

function voiceApiKey(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 4096) throw new Error("voice credential is invalid");
  return value;
}

function voiceSettings(value: { readonly stt: Record<string, unknown>; readonly tts: Record<string, unknown>; secrets?: Record<string, unknown> }): { readonly settings: VoiceSettings; readonly secrets: Record<string, unknown> } {
  const sttProvider = voiceProvider(value.stt.provider);
  const sttModel = voiceModel(value.stt.model);
  const sttEndpoint = voiceEndpoint(value.stt.endpoint);
  const ttsProvider = voiceProvider(value.tts.provider);
  const ttsModel = voiceModel(value.tts.model);
  const ttsVoice = voiceModel(value.tts.voice);
  const ttsEndpoint = voiceEndpoint(value.tts.endpoint);
  const speed = voiceSpeed(value.tts.speed);
  const sttApiKey = voiceApiKey(value.secrets?.sttApiKey);
  const ttsApiKey = voiceApiKey(value.secrets?.ttsApiKey);
  return {
    settings: {
      stt: { provider: sttProvider, model: sttModel, language: voiceLanguage(value.stt.language), endpoint: sttEndpoint, configured: sttProvider !== "none" },
      tts: { provider: ttsProvider, model: ttsModel, voice: ttsVoice, speed, endpoint: ttsEndpoint, autoPlay: value.tts.autoPlay === true, configured: ttsProvider !== "none" },
    },
    secrets: { ...(sttApiKey === undefined ? {} : { sttApiKey }), ...(ttsApiKey === undefined ? {} : { ttsApiKey }) },
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function now(): string {
  return new Date().toISOString();
}

function expires(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function integrationStatus(value: string): IntegrationStatus {
  if (value === "connected" || value === "disconnected" || value === "authentication_required" || value === "configuration_error" || value === "unknown") return value;
  return "unknown";
}

function jsonRecord(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* redacted invalid persisted data is treated as unavailable */ }
  throw new Error(`${label} is invalid`);
}

export class SQLiteIdentityRepository {
  private readonly db: Database;
  private readonly credentialKeyPath: string | null;
  private credentialKey: Buffer | undefined;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.credentialKeyPath = path === ":memory:" ? null : join(dirname(path), CREDENTIAL_KEY_FILE);
    try {
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      if (this.tableExists("provider_connections")) this.assertProviderSchema();
      this.db.exec(AUTH_SCHEMA);
      this.assertProviderSchema();
    } catch (error) {
      this.db.close();
      throw error;
    }
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN icon TEXT NOT NULL DEFAULT 'bot'");
    } catch {
      // Existing databases already have icon column.
    }
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    } catch {
      // Existing databases already have description column.
    }
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN capability_mode TEXT NOT NULL DEFAULT 'legacy'");
    } catch {
      // Existing databases already have the migration marker.
    }
    for (const statement of [
      "ALTER TABLE integrations ADD COLUMN protocol TEXT",
      "ALTER TABLE integration_capabilities ADD COLUMN native_name TEXT",
      "ALTER TABLE integration_capabilities ADD COLUMN display_name TEXT",
      "ALTER TABLE integration_capabilities ADD COLUMN input_schema_json TEXT",
      "ALTER TABLE integration_capabilities ADD COLUMN discovered_at TEXT",
      "ALTER TABLE integration_capabilities ADD COLUMN expires_at TEXT",
    ]) {
      try { this.db.exec(statement); } catch { /* existing database already has the migration */ }
    }
    this.migrateAgentSkills();
    for (const statement of [
      "ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE projects ADD COLUMN workspace TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE projects ADD COLUMN instructions TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE projects ADD COLUMN repository_json TEXT",
      "ALTER TABLE projects ADD COLUMN default_agent_id TEXT",
      "ALTER TABLE projects ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'",
    ]) {
      try { this.db.exec(statement); } catch { /* existing database already has the migration */ }
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS git_credentials (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'gitea', 'generic')),
      username TEXT,
      secrets_ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_id, name)
    ); CREATE INDEX IF NOT EXISTS idx_git_credentials_owner ON git_credentials(owner_id, created_at, id);`);
  }

  close(): void {
    this.db.close();
  }

  private tableExists(table: string): boolean {
    return this.db.query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== null;
  }

  private migrateAgentSkills(): void {
    if (!this.tableExists("agent_skills")) return;
    const foreignKeys = this.db.query<{ table: string }, []>("PRAGMA foreign_key_list(agent_skills)").all();
    const columns = new Set(this.db.query<{ name: string }, []>("PRAGMA table_info(agent_skills)").all().map(row => row.name));
    if (foreignKeys.some(row => row.table === "skills") && columns.has("position")) return;

    this.db.run("BEGIN IMMEDIATE");
    try {
      const legacy = this.db.query<{ agent_id: string; skill_id: string; position: number }, []>(
        "SELECT agent_id, skill_id, rowid AS position FROM agent_skills ORDER BY agent_id, rowid",
      ).all();
      for (const item of legacy) {
        const owner = this.db.query<{ owner_id: string }, [string]>("SELECT owner_id FROM agents WHERE id = ?").get(item.agent_id);
        if (owner === null) continue;
        this.db.run(
          "INSERT OR IGNORE INTO skills (id, owner_id, name, description, instructions, enabled, created_at, updated_at) VALUES (?, ?, ?, '', '', 0, ?, ?)",
          [item.skill_id, owner.owner_id, `Legacy skill ${item.skill_id.slice(0, 12)}`, now(), now()],
        );
      }
      this.db.run("DROP INDEX IF EXISTS idx_agent_skills_skill");
      this.db.exec("ALTER TABLE agent_skills RENAME TO agent_skills_legacy");
      this.db.exec(`
        CREATE TABLE agent_skills (
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (agent_id, skill_id)
        );
        CREATE INDEX idx_agent_skills_skill ON agent_skills(skill_id);
      `);
      for (const item of legacy) {
        this.db.run("INSERT OR IGNORE INTO agent_skills (agent_id, skill_id, position) VALUES (?, ?, ?)", [item.agent_id, item.skill_id, item.position]);
      }
      this.db.exec("DROP TABLE agent_skills_legacy");
      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  private assertProviderSchema(): void {
    const columns = new Set(this.db.query<{ name: string }, []>("PRAGMA table_info(provider_connections)").all().map(row => row.name));
    const required = ["id", "provider", "base_url", "credential_ciphertext", "model", "updated_at"];
    if (columns.has("api_key") || !required.every(column => columns.has(column))) {
      throw new Error("unsupported provider credential schema");
    }
  }

  private key(createIfMissing = false): Buffer {
    return this.credentialKey ??= providerCredentialKey(this.credentialKeyPath, createIfMissing);
  }

  private integrationFromRow(row: IntegrationRow, includeSecrets = false): IntegrationRecord | IntegrationRuntimeConfig {
    const capabilities = this.db.query<{ capability_id: string; name: string; description: string; source: string; capabilities_json: string; native_name: string | null; display_name: string | null; input_schema_json: string | null; discovered_at: string | null; expires_at: string | null }, [string]>(
      "SELECT capability_id, name, description, source, capabilities_json, native_name, display_name, input_schema_json, discovered_at, expires_at FROM integration_capabilities WHERE integration_id = ? ORDER BY capability_id",
    ).all(row.id).map(item => ({
      capabilityId: item.capability_id,
      name: item.name,
      description: item.description,
      source: item.source,
      capabilities: JSON.parse(item.capabilities_json) as readonly string[] | Record<string, unknown>,
      integrationId: row.id,
      ...(item.native_name === null ? {} : { nativeName: item.native_name }),
      ...(item.display_name === null ? {} : { displayName: item.display_name }),
      ...(item.input_schema_json === null ? {} : { inputSchema: JSON.parse(item.input_schema_json) as Record<string, unknown> | boolean }),
      ...(item.discovered_at === null ? {} : { discoveredAt: item.discovered_at }),
      ...(item.expires_at === null ? {} : { expiresAt: item.expires_at }),
    }));
    const integration: IntegrationRecord = {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      type: row.type,
      enabled: row.enabled === 1,
      status: integrationStatus(row.status),
      ...(row.protocol === "modern" || row.protocol === "legacy" ? { protocol: row.protocol } : {}),
      config: jsonRecord(row.config_json, "integration config"),
      capabilities,
      ...(row.last_successful_discovery === null ? {} : { lastSuccessfulDiscovery: row.last_successful_discovery }),
      ...(row.last_error === null ? {} : { lastError: row.last_error }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!includeSecrets) return integration;
    return { integration, secrets: decryptIntegrationSecrets(row.secrets_ciphertext, this.key()) };
  }

  private integrationRow(userId: string, integrationId: string): IntegrationRow | null {
    return this.db.query<IntegrationRow, [string, string]>("SELECT id, owner_id, name, type, config_json, secrets_ciphertext, enabled, status, protocol, last_successful_discovery, last_error, created_at, updated_at FROM integrations WHERE id = ? AND owner_id = ?").get(integrationId, userId);
  }

  listIntegrations(userId: string): readonly IntegrationRecord[] {
    return this.db.query<IntegrationRow, [string]>("SELECT id, owner_id, name, type, config_json, secrets_ciphertext, enabled, status, protocol, last_successful_discovery, last_error, created_at, updated_at FROM integrations WHERE owner_id = ? ORDER BY created_at, id").all(userId).map(row => this.integrationFromRow(row) as IntegrationRecord);
  }

  getIntegration(userId: string, integrationId: string): IntegrationRecord | null {
    const row = this.integrationRow(userId, integrationId);
    return row === null ? null : this.integrationFromRow(row) as IntegrationRecord;
  }

  getIntegrationRuntimeConfig(userId: string, integrationId: string): IntegrationRuntimeConfig | null {
    const row = this.integrationRow(userId, integrationId);
    return row === null ? null : this.integrationFromRow(row, true) as IntegrationRuntimeConfig;
  }

  createIntegration(userId: string, input: IntegrationInput): IntegrationRecord {
    if (!input.name.trim() || input.name.length > 128 || !input.type.trim() || typeof input.config !== "object" || input.config === null || Array.isArray(input.config)) throw new Error("integration is invalid");
    if (!this.tableExists("users") || this.db.query<{ id: string }, [string]>("SELECT id FROM users WHERE id = ?").get(userId) === null) throw new OwnershipError();
    const id = randomUUID();
    const at = now();
    const safeConfig = this.safeIntegrationConfig(input.config, input.secrets ?? {});
    this.db.run("INSERT INTO integrations (id, owner_id, name, type, config_json, secrets_ciphertext, enabled, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?)", [id, userId, input.name.trim(), input.type.trim(), JSON.stringify(safeConfig), encryptIntegrationSecrets(input.secrets ?? {}, this.key(true)), input.enabled === false ? 0 : 1, at, at]);
    return this.getIntegration(userId, id) as IntegrationRecord;
  }

  updateIntegration(userId: string, integrationId: string, input: Partial<IntegrationInput>): IntegrationRecord {
    const existing = this.getIntegrationRuntimeConfig(userId, integrationId);
    if (existing === null) throw new OwnershipError();
    const name = input.name === undefined ? existing.integration.name : input.name.trim();
    if (!name || name.length > 128) throw new Error("integration name is invalid");
    const secrets = input.secrets === undefined ? existing.secrets : { ...existing.secrets, ...input.secrets };
    const config = input.config === undefined ? existing.integration.config : this.safeIntegrationConfig(input.config, secrets);
    this.migrateLegacyIntegrationCapabilityIds(existing.integration);
    this.db.run("UPDATE integrations SET name = ?, type = ?, config_json = ?, secrets_ciphertext = ?, enabled = ?, updated_at = ?, status = 'unknown', last_error = NULL WHERE id = ? AND owner_id = ?", [name, input.type?.trim() ?? existing.integration.type, JSON.stringify(config), encryptIntegrationSecrets(secrets, this.key(true)), input.enabled === undefined ? (existing.integration.enabled ? 1 : 0) : input.enabled ? 1 : 0, now(), integrationId, userId]);
    return this.getIntegration(userId, integrationId) as IntegrationRecord;
  }

  private migrateLegacyIntegrationCapabilityIds(integration: IntegrationRecord): void {
    for (const capability of integration.capabilities) {
      const match = /^(mcp|openapi):([^:]+):(.+)$/.exec(capability.capabilityId);
      if (match === null || match[2] !== integration.name) continue;
      const canonical = `integration:${integration.id}:${match[1]}:${match[3]}`;
      this.db.run("UPDATE agent_capabilities SET capability_id = ? WHERE capability_id = ?", [canonical, capability.capabilityId]);
      this.db.run("UPDATE agent_permissions SET capability_id = ? WHERE capability_id = ?", [canonical, capability.capabilityId]);
      const overrides = this.db.query<{ project_id: string; agent_id: string; capabilities_json: string | null; permissions_json: string | null }, []>("SELECT project_id, agent_id, capabilities_json, permissions_json FROM agent_project_overrides").all();
      for (const override of overrides) {
        const replace = (json: string | null): string | null => json === null ? null : JSON.stringify((JSON.parse(json) as readonly { capabilityId: string; enabled?: boolean; policy?: string }[]).map(item => item.capabilityId === capability.capabilityId ? { ...item, capabilityId: canonical } : item));
        const capabilities = replace(override.capabilities_json); const permissions = replace(override.permissions_json);
        if (capabilities !== override.capabilities_json || permissions !== override.permissions_json) this.db.run("UPDATE agent_project_overrides SET capabilities_json = ?, permissions_json = ? WHERE project_id = ? AND agent_id = ?", [capabilities, permissions, override.project_id, override.agent_id]);
      }
      this.db.run("UPDATE integration_capabilities SET capability_id = ? WHERE integration_id = ? AND capability_id = ?", [canonical, integration.id, capability.capabilityId]);
    }
  }

  deleteIntegration(userId: string, integrationId: string): void {
    const result = this.db.run("DELETE FROM integrations WHERE id = ? AND owner_id = ?", [integrationId, userId]);
    if (result.changes === 0) throw new OwnershipError();
  }

  private safeIntegrationConfig(config: Record<string, unknown>, secrets: Record<string, unknown>): Record<string, unknown> {
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact);
      if (typeof value !== "object" || value === null) return value;
      const sensitiveKeys = new Set(["token", "accesstoken", "refreshtoken", "secret", "clientsecret", "password", "apikey", "api_key", "authorization", "privatekey", "private_key", "headers", "customheaders", "staticheaders", "credentials", "secrets", "environment", "environmentvariables", "env"]);
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !sensitiveKeys.has(key.toLowerCase().replaceAll("_", "").replaceAll("-", ""))).map(([key, item]) => [key, redact(item)]));
    };
    const safe = redact(config) as Record<string, unknown>;
    const headers = secrets.headers;
    const environment = secrets.environment ?? secrets.env;
    if (typeof headers === "object" && headers !== null && !Array.isArray(headers)) safe.headerNames = Object.keys(headers);
    if (typeof environment === "object" && environment !== null && !Array.isArray(environment)) safe.environmentVariableNames = Object.keys(environment);
    if (typeof secrets.token === "string" || typeof secrets.apiKey === "string" || typeof secrets.accessToken === "string") safe.authConfigured = true;
    return safe;
  }

  setIntegrationDiscovery(userId: string, integrationId: string, status: IntegrationStatus, capabilities: readonly Omit<IntegrationCapabilityRecord, "integrationId">[], error?: string, protocol?: "modern" | "legacy"): IntegrationRecord {
    const row = this.integrationRow(userId, integrationId);
    if (row === null) throw new OwnershipError();
    const at = now();
    this.db.run("BEGIN IMMEDIATE");
    try {
      this.db.run("DELETE FROM integration_capabilities WHERE integration_id = ?", [integrationId]);
      for (const capability of capabilities) this.db.run("INSERT INTO integration_capabilities (integration_id, capability_id, name, description, source, capabilities_json, native_name, display_name, input_schema_json, discovered_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [integrationId, capability.capabilityId, capability.name, capability.description, capability.source, JSON.stringify(capability.capabilities), capability.nativeName ?? null, capability.displayName ?? null, capability.inputSchema === undefined ? null : JSON.stringify(capability.inputSchema), capability.discoveredAt ?? at, capability.expiresAt ?? null]);
      this.db.run("UPDATE integrations SET status = ?, protocol = ?, last_successful_discovery = ?, last_error = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [status, protocol ?? row.protocol, status === "connected" ? at : row.last_successful_discovery, error ?? null, at, integrationId, userId]);
      this.db.run("COMMIT");
    } catch (error) { this.db.run("ROLLBACK"); throw error; }
    return this.getIntegration(userId, integrationId) as IntegrationRecord;
  }

  updateIntegrationStatus(userId: string, integrationId: string, status: IntegrationStatus, error?: string): IntegrationRecord {
    const row = this.integrationRow(userId, integrationId);
    if (row === null) throw new OwnershipError();
    this.db.run("UPDATE integrations SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [status, error ?? null, now(), integrationId, userId]);
    return this.getIntegration(userId, integrationId) as IntegrationRecord;
  }

  beginIntegrationOAuth(userId: string, integrationId: string, redirectUri: string): { readonly state: string; readonly authorizationUrl: string; readonly expiresAt: string } {
    const runtime = this.getIntegrationRuntimeConfig(userId, integrationId);
    if (runtime === null) throw new OwnershipError();
    const auth = runtime.integration.config.auth;
    if (typeof auth !== "object" || auth === null || Array.isArray(auth) || typeof (auth as Record<string, unknown>).authorizationUrl !== "string" || typeof (auth as Record<string, unknown>).clientId !== "string") throw new Error("OAuth configuration is invalid");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    this.db.run("INSERT INTO integration_oauth_states (state_hash, integration_id, owner_id, redirect_uri, code_verifier_ciphertext, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [hashToken(state), integrationId, userId, redirectUri, encryptJson({ verifier }, this.key(true), INTEGRATION_CREDENTIAL_AAD), expiresAt, now()]);
    const url = new URL((auth as Record<string, unknown>).authorizationUrl as string);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", (auth as Record<string, unknown>).clientId as string);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const scopes = (auth as Record<string, unknown>).scopes;
    if (Array.isArray(scopes)) url.searchParams.set("scope", scopes.filter((item: unknown): item is string => typeof item === "string").join(" "));
    return { state, authorizationUrl: url.toString(), expiresAt };
  }

  consumeIntegrationOAuthState(userId: string, state: string): IntegrationOAuthState {
    const row = this.db.query<{ integration_id: string; owner_id: string; redirect_uri: string; code_verifier_ciphertext: string; expires_at: string }, [string]>("SELECT integration_id, owner_id, redirect_uri, code_verifier_ciphertext, expires_at FROM integration_oauth_states WHERE state_hash = ?").get(hashToken(state));
    if (row === null || row.owner_id !== userId || Date.parse(row.expires_at) <= Date.now()) throw new AuthenticationError("OAuth state is invalid");
    this.db.run("DELETE FROM integration_oauth_states WHERE state_hash = ?", [hashToken(state)]);
    return { integrationId: row.integration_id, ownerId: row.owner_id, redirectUri: row.redirect_uri, codeVerifier: String(decryptJson(row.code_verifier_ciphertext, this.key(), INTEGRATION_CREDENTIAL_AAD).verifier ?? "") };
  }

  saveIntegrationOAuthCredentials(userId: string, integrationId: string, credentials: Record<string, unknown>): IntegrationRecord {
    const runtime = this.getIntegrationRuntimeConfig(userId, integrationId);
    if (runtime === null) throw new OwnershipError();
    this.db.run("UPDATE integrations SET secrets_ciphertext = ?, status = 'unknown', last_error = NULL, updated_at = ? WHERE id = ? AND owner_id = ?", [encryptIntegrationSecrets({ ...runtime.secrets, ...credentials }, this.key(true)), now(), integrationId, userId]);
    return this.getIntegration(userId, integrationId) as IntegrationRecord;
  }

  revokeIntegrationOAuth(userId: string, integrationId: string): IntegrationRecord {
    const runtime = this.getIntegrationRuntimeConfig(userId, integrationId);
    if (runtime === null) throw new OwnershipError();
    const secrets = { ...runtime.secrets };
    for (const key of ["accessToken", "refreshToken", "token", "tokenType", "expiresAt"]) delete secrets[key];
    // Revoke is a replacement operation. updateIntegration intentionally merges
    // secret patches so blank edit forms retain credentials, but that would keep
    // the OAuth tokens we just removed.
    this.db.run("UPDATE integrations SET secrets_ciphertext = ?, status = 'unknown', last_error = NULL, updated_at = ? WHERE id = ? AND owner_id = ?", [encryptIntegrationSecrets(secrets, this.key(true)), now(), integrationId, userId]);
    return this.getIntegration(userId, integrationId) as IntegrationRecord;
  }

  private user(row: Row): IdentityUser {
    return { id: required(row.id, "user id"), username: required(row.username, "username") };
  }

  private async issue(user: IdentityUser): Promise<AuthSession> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = expires();
    this.db.run(
      "INSERT INTO auth_sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      [hashToken(token), user.id, csrfToken, expiresAt, now()],
    );
    return { principal: user, token, csrfToken, expiresAt };
  }

  async bootstrap(username: string, password: string): Promise<AuthSession> {
    if (username.trim().length < 3 || password.length < 8) throw new Error("username or password is invalid");
    const user: IdentityUser = { id: randomUUID(), username: username.trim() };
    const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
    this.db.run("BEGIN IMMEDIATE");
    try {
      const count = this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM users").get()?.count ?? 0;
      if (count !== 0) throw new Error("administrator is already configured");
      this.db.run("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)", [user.id, user.username, passwordHash, now()]);
      const session = await this.issue(user);
      this.db.run("COMMIT");
      return session;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const row = this.db.query<Row, string>("SELECT id, username, password_hash FROM users WHERE username = ?").get(username.trim());
    if (row === null || row.password_hash === undefined || !(await Bun.password.verify(password, row.password_hash))) {
      throw new AuthenticationError("Invalid credentials");
    }
    return this.issue(this.user(row));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthSession> {
    if (newPassword.length < 8) throw new Error("password is invalid");
    const row = this.db.query<Row, [string]>("SELECT id, username, password_hash FROM users WHERE id = ?").get(userId);
    if (row === null || row.password_hash === undefined || !(await Bun.password.verify(currentPassword, row.password_hash))) throw new AuthenticationError("Invalid credentials");
    const passwordHash = await Bun.password.hash(newPassword, { algorithm: "argon2id" });
    this.db.run("BEGIN IMMEDIATE");
    try {
      this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
      this.db.run("UPDATE auth_sessions SET revoked = 1 WHERE user_id = ?", [userId]);
      const session = await this.issue(this.user(row));
      this.db.run("COMMIT");
      return session;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  bootstrapRequired(): boolean {
    return (this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM users").get()?.count ?? 0) === 0;
  }

  authenticate(token: string | undefined): AuthenticatedPrincipal | null {
    if (token === undefined || token.length === 0) return null;
    const row = this.db.query<Row, [string, string]>(
      "SELECT u.id, u.username FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked = 0 AND s.expires_at > ?",
    ).get(hashToken(token), now());
    return row === null ? null : this.user(row);
  }

  csrfToken(token: string | undefined): string | null {
    if (token === undefined || token.length === 0) return null;
    return this.db.query<{ csrf_token: string }, [string]>("SELECT csrf_token FROM auth_sessions WHERE token_hash = ? AND revoked = 0").get(hashToken(token))?.csrf_token ?? null;
  }

  revoke(token: string | undefined): void {
    if (token !== undefined) this.db.run("UPDATE auth_sessions SET revoked = 1 WHERE token_hash = ?", [hashToken(token)]);
  }

  private project(row: { id: string; owner_id: string; name: string; description: string; workspace: string; instructions: string; repository_json: string | null; default_agent_id: string | null; settings_json: string; created_at: string }): ProjectRecord {
    let repository: ProjectRepositoryConfig | undefined;
    try { repository = row.repository_json === null ? undefined : JSON.parse(row.repository_json) as ProjectRepositoryConfig; } catch { throw new Error("project repository is invalid"); }
    let settings: Record<string, unknown>;
    try { settings = JSON.parse(row.settings_json) as Record<string, unknown>; } catch { settings = {}; }
    return {
      id: row.id, ownerId: row.owner_id, name: row.name, description: row.description ?? "",
      workspace: row.workspace ?? "", instructions: row.instructions ?? "",
      ...(repository === undefined ? {} : { repository }),
      ...(row.default_agent_id === null ? {} : { defaultAgentId: row.default_agent_id }),
      settings, createdAt: row.created_at,
    };
  }

  private projectRow(userId: string, projectId?: string) {
    const query = "SELECT id, owner_id, name, description, workspace, instructions, repository_json, default_agent_id, settings_json, created_at FROM projects WHERE owner_id = ?" + (projectId === undefined ? "" : " AND id = ?");
    return projectId === undefined
      ? this.db.query<ProjectDbRow, [string]>(query).all(userId)
      : this.db.query<ProjectDbRow, [string, string]>(query).all(userId, projectId);
  }

  listProjects(userId: string): readonly ProjectRecord[] {
    return this.projectRow(userId).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(row => this.project(row));
  }

  getProject(userId: string, projectId: string): ProjectRecord | null {
    const rows = this.projectRow(userId, projectId);
    return rows.length === 0 ? null : this.project(rows[0]!);
  }

  createProject(userId: string, nameOrInput: string | ProjectInput): ProjectRecord {
    const input: ProjectInput = typeof nameOrInput === "string" ? { name: nameOrInput } : nameOrInput;
    const name = input.name.trim();
    const description = input.description ?? "";
    const instructions = input.instructions ?? "";
    if (!name || name.length > 128 || description.length > 10_000 || instructions.length > 100_000) throw new Error("project is invalid");
    if (input.workspace !== undefined && input.workspace.length > 4096) throw new Error("project workspace is invalid");
    if (input.repository !== undefined) this.validateRepository(input.repository);
    if (input.repository?.credentialId !== undefined && this.db.query<{ id: string }, [string, string]>("SELECT id FROM git_credentials WHERE id = ? AND owner_id = ?").get(input.repository.credentialId, userId) === null) throw new OwnershipError("Git credential is not owned by the authenticated user");
    if (input.defaultAgentId !== undefined && this.db.query<{ id: string }, [string, string, string]>("SELECT id FROM agents WHERE id = ? AND owner_id = ? AND project_id = ?").get(input.defaultAgentId, userId, input.id ?? "") === null && input.id !== undefined) throw new OwnershipError("Default Agent is not assigned to this project");
    if (input.settings !== undefined && (typeof input.settings !== "object" || input.settings === null || Array.isArray(input.settings))) throw new Error("project settings are invalid");
    const project = { id: input.id ?? randomUUID(), ownerId: userId, name, description, workspace: input.workspace ?? "", instructions, repository: input.repository, defaultAgentId: input.defaultAgentId, settings: input.settings ?? {}, createdAt: now() };
    this.db.run("INSERT INTO projects (id, owner_id, name, description, workspace, instructions, repository_json, default_agent_id, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [project.id, project.ownerId, project.name, project.description, project.workspace, project.instructions, project.repository === undefined ? null : JSON.stringify(project.repository), project.defaultAgentId ?? null, JSON.stringify(project.settings), project.createdAt]);
    return this.getProject(userId, project.id) as ProjectRecord;
  }

  updateProject(userId: string, projectId: string, input: Partial<ProjectInput>): ProjectRecord {
    const existing = this.getProject(userId, projectId);
    if (existing === null) throw new OwnershipError("Project is not owned by the authenticated user");
    const next: ProjectInput = { ...existing, ...input, id: projectId, name: input.name ?? existing.name };
    this.validateRepository(next.repository);
    if (next.repository?.credentialId !== undefined && this.db.query<{ id: string }, [string, string]>("SELECT id FROM git_credentials WHERE id = ? AND owner_id = ?").get(next.repository.credentialId, userId) === null) throw new OwnershipError("Git credential is not owned by the authenticated user");
    if (next.defaultAgentId !== undefined && this.db.query<{ id: string }, [string, string, string]>("SELECT id FROM agents WHERE id = ? AND owner_id = ? AND project_id = ?").get(next.defaultAgentId, userId, projectId) === null) throw new OwnershipError("Default Agent is not assigned to this project");
    if (next.description !== undefined && next.description.length > 10_000 || next.instructions !== undefined && next.instructions.length > 100_000) throw new Error("project is invalid");
    this.db.run("UPDATE projects SET name = ?, description = ?, workspace = ?, instructions = ?, repository_json = ?, default_agent_id = ?, settings_json = ? WHERE id = ? AND owner_id = ?", [next.name.trim(), next.description ?? "", next.workspace ?? "", next.instructions ?? "", next.repository === undefined ? null : JSON.stringify(next.repository), next.defaultAgentId ?? null, JSON.stringify(next.settings ?? {}), projectId, userId]);
    return this.getProject(userId, projectId) as ProjectRecord;
  }

  deleteProject(userId: string, projectId: string): void {
    const result = this.db.run("DELETE FROM projects WHERE id = ? AND owner_id = ?", [projectId, userId]);
    if (result.changes === 0) throw new OwnershipError("Project is not owned by the authenticated user");
  }

  private validateRepository(repository: ProjectRepositoryConfig | undefined): void {
    if (repository === undefined) return;
    if (!repository.url.trim() || repository.url.length > 4096 || /[\r\n]/.test(repository.url) || repository.remoteName.length > 128 || !/^[A-Za-z0-9._-]+$/.test(repository.remoteName)) throw new Error("project repository is invalid");
    if (repository.credentialId !== undefined && (!repository.credentialId || repository.credentialId.length > 128)) throw new Error("project credential is invalid");
    if (repository.defaultBranch !== undefined && (!repository.defaultBranch.trim() || repository.defaultBranch.length > 256 || /[\r\n]/.test(repository.defaultBranch))) throw new Error("project branch is invalid");
  }

  private gitCredentialSecrets(userId: string, credentialId: string): Record<string, unknown> {
    const row = this.db.query<{ secrets_ciphertext: string }, [string, string]>("SELECT secrets_ciphertext FROM git_credentials WHERE id = ? AND owner_id = ?").get(credentialId, userId);
    if (row === null) throw new OwnershipError("Git credential is not owned by the authenticated user");
    return decryptIntegrationSecrets(row.secrets_ciphertext, this.key());
  }

  getGitCredentialRuntime(userId: string, credentialId: string): GitCredentialInput {
    const row = this.db.query<{ id: string; owner_id: string; name: string; provider: GitCredentialRecord["provider"]; username: string | null; secrets_ciphertext: string }, [string, string]>("SELECT id, owner_id, name, provider, username, secrets_ciphertext FROM git_credentials WHERE id = ? AND owner_id = ?").get(credentialId, userId);
    if (row === null) throw new OwnershipError("Git credential is not owned by the authenticated user");
    return { name: row.name, provider: row.provider, ...(row.username === null ? {} : { username: row.username }), ...this.gitCredentialSecrets(userId, credentialId) } as GitCredentialInput;
  }

  listGitCredentials(userId: string): readonly GitCredentialRecord[] {
    return this.db.query<{ id: string; owner_id: string; name: string; provider: GitCredentialRecord["provider"]; username: string | null; created_at: string; updated_at: string }, [string]>("SELECT id, owner_id, name, provider, username, created_at, updated_at FROM git_credentials WHERE owner_id = ? ORDER BY created_at, id").all(userId).map(row => ({ id: row.id, ownerId: row.owner_id, name: row.name, provider: row.provider, ...(row.username === null ? {} : { username: row.username }), createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  createGitCredential(userId: string, input: GitCredentialInput): GitCredentialRecord {
    const name = input.name.trim();
    if (!name || name.length > 128 || !["github", "gitlab", "gitea", "generic"].includes(input.provider)) throw new Error("git credential is invalid");
    const secrets = Object.fromEntries(Object.entries(input).filter(([key]) => !["name", "provider", "username"].includes(key)));
    if (!Object.values(secrets).some(value => typeof value === "string" && value.length > 0)) throw new Error("git credential secret is required");
    const id = randomUUID(); const at = now();
    this.db.run("INSERT INTO git_credentials (id, owner_id, name, provider, username, secrets_ciphertext, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, userId, name, input.provider, input.username?.trim() || null, encryptIntegrationSecrets(secrets, this.key(true)), at, at]);
    return this.listGitCredentials(userId).find(item => item.id === id)!;
  }

  deleteGitCredential(userId: string, credentialId: string): void {
    if (this.db.query<{ id: string }, [string, string]>("SELECT id FROM projects WHERE owner_id = ? AND json_extract(repository_json, '$.credentialId') = ? LIMIT 1").get(userId, credentialId) !== null) throw new Error("git credential is in use");
    const result = this.db.run("DELETE FROM git_credentials WHERE id = ? AND owner_id = ?", [credentialId, userId]);
    if (result.changes === 0) throw new OwnershipError("Git credential is not owned by the authenticated user");
  }

  private skill(row: { id: string; owner_id: string; name: string; description: string; instructions: string; enabled: number; created_at: string; updated_at: string }): SkillRecord {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listSkills(userId: string): readonly SkillRecord[] {
    return this.db.query<{ id: string; owner_id: string; name: string; description: string; instructions: string; enabled: number; created_at: string; updated_at: string }, [string]>(
      "SELECT id, owner_id, name, description, instructions, enabled, created_at, updated_at FROM skills WHERE owner_id = ? ORDER BY created_at, id",
    ).all(userId).map(row => this.skill(row));
  }

  getSkill(userId: string, skillId: string): SkillRecord | null {
    const row = this.db.query<{ id: string; owner_id: string; name: string; description: string; instructions: string; enabled: number; created_at: string; updated_at: string }, [string, string]>(
      "SELECT id, owner_id, name, description, instructions, enabled, created_at, updated_at FROM skills WHERE id = ? AND owner_id = ?",
    ).get(skillId, userId);
    return row === null ? null : this.skill(row);
  }

  createSkill(userId: string, input: SkillInput): SkillRecord {
    const name = input.name.trim();
    const description = input.description ?? "";
    if (!name || name.length > 128 || description.length > 10_000 || typeof input.instructions !== "string" || input.instructions.length > 100_000) throw new Error("skill is invalid");
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("skill is invalid");
    const timestamp = now();
    const skill = { id: randomUUID(), ownerId: userId, name, description, instructions: input.instructions, enabled: input.enabled ?? true, createdAt: timestamp, updatedAt: timestamp };
    this.db.run("INSERT INTO skills (id, owner_id, name, description, instructions, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [skill.id, skill.ownerId, skill.name, skill.description, skill.instructions, skill.enabled ? 1 : 0, skill.createdAt, skill.updatedAt]);
    return skill;
  }

  updateSkill(userId: string, skillId: string, input: Partial<SkillInput>): SkillRecord {
    const existing = this.getSkill(userId, skillId);
    if (existing === null) throw new OwnershipError("Skill is not owned by the authenticated user");
    const name = input.name === undefined ? existing.name : input.name.trim();
    const description = input.description ?? existing.description;
    const instructions = input.instructions ?? existing.instructions;
    const enabled = input.enabled ?? existing.enabled;
    if (!name || name.length > 128 || description.length > 10_000 || instructions.length > 100_000 || typeof enabled !== "boolean") throw new Error("skill is invalid");
    const updatedAt = now();
    this.db.run("UPDATE skills SET name = ?, description = ?, instructions = ?, enabled = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [name, description, instructions, enabled ? 1 : 0, updatedAt, skillId, userId]);
    return this.getSkill(userId, skillId) as SkillRecord;
  }

  deleteSkill(userId: string, skillId: string): void {
    const result = this.db.run("DELETE FROM skills WHERE id = ? AND owner_id = ?", [skillId, userId]);
    if (result.changes === 0) throw new OwnershipError("Skill is not owned by the authenticated user");
  }

  skillAssignmentCount(userId: string, skillId: string): number {
    return this.db.query<{ count: number }, [string, string]>("SELECT COUNT(*) AS count FROM agent_skills s JOIN agents a ON a.id = s.agent_id WHERE s.skill_id = ? AND a.owner_id = ?").get(skillId, userId)?.count ?? 0;
  }

  skillAssignmentCounts(userId: string): ReadonlyMap<string, number> {
    return new Map(this.db.query<{ skill_id: string; count: number }, [string]>("SELECT s.skill_id, COUNT(*) AS count FROM agent_skills s JOIN agents a ON a.id = s.agent_id WHERE a.owner_id = ? GROUP BY s.skill_id").all(userId).map(row => [row.skill_id, row.count] as const));
  }

  effectiveAgentSkills(userId: string, agentId: string): readonly SkillRecord[] {
    return this.db.query<{ id: string; owner_id: string; name: string; description: string; instructions: string; enabled: number; created_at: string; updated_at: string }, [string, string]>(
      "SELECT s.id, s.owner_id, s.name, s.description, s.instructions, s.enabled, s.created_at, s.updated_at FROM agent_skills a JOIN agents agent ON agent.id = a.agent_id JOIN skills s ON s.id = a.skill_id WHERE agent.id = ? AND agent.owner_id = ? AND s.owner_id = agent.owner_id AND s.enabled = 1 ORDER BY a.position, a.skill_id",
    ).all(agentId, userId).map(row => this.skill(row));
  }

  private promptCommand(row: { id: string; owner_id: string; name: string; description: string; prompt: string; enabled: number; created_at: string; updated_at: string }): PromptCommandRecord {
    return { id: row.id, ownerId: row.owner_id, name: row.name, description: row.description, prompt: row.prompt, enabled: row.enabled === 1, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  listPromptCommands(userId: string): readonly PromptCommandRecord[] {
    return this.db.query<{ id: string; owner_id: string; name: string; description: string; prompt: string; enabled: number; created_at: string; updated_at: string }, [string]>(
      "SELECT id, owner_id, name, description, prompt, enabled, created_at, updated_at FROM prompt_commands WHERE owner_id = ? ORDER BY created_at, id",
    ).all(userId).map(row => this.promptCommand(row));
  }

  getPromptCommand(userId: string, commandId: string): PromptCommandRecord | null {
    const row = this.db.query<{ id: string; owner_id: string; name: string; description: string; prompt: string; enabled: number; created_at: string; updated_at: string }, [string, string]>(
      "SELECT id, owner_id, name, description, prompt, enabled, created_at, updated_at FROM prompt_commands WHERE id = ? AND owner_id = ?",
    ).get(commandId, userId);
    return row === null ? null : this.promptCommand(row);
  }

  createPromptCommand(userId: string, input: PromptCommandInput): PromptCommandRecord {
    const name = input.name.trim().toLowerCase();
    const description = input.description ?? "";
    if (!/^[a-z0-9_-]+$/.test(name) || name.length > 64 || description.length > 10_000 || typeof input.prompt !== "string" || input.prompt.length > 100_000 || input.prompt.trim().length === 0) throw new Error("prompt command is invalid");
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("prompt command is invalid");
    const timestamp = now();
    const command = { id: randomUUID(), ownerId: userId, name, description, prompt: input.prompt, enabled: input.enabled ?? true, createdAt: timestamp, updatedAt: timestamp };
    this.db.run("INSERT INTO prompt_commands (id, owner_id, name, description, prompt, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [command.id, command.ownerId, command.name, command.description, command.prompt, command.enabled ? 1 : 0, command.createdAt, command.updatedAt]);
    return command;
  }

  updatePromptCommand(userId: string, commandId: string, input: Partial<PromptCommandInput>): PromptCommandRecord {
    const existing = this.getPromptCommand(userId, commandId);
    if (existing === null) throw new OwnershipError("Prompt Command is not owned by the authenticated user");
    const name = input.name === undefined ? existing.name : input.name.trim().toLowerCase();
    const description = input.description ?? existing.description;
    const prompt = input.prompt ?? existing.prompt;
    const enabled = input.enabled ?? existing.enabled;
    if (!/^[a-z0-9_-]+$/.test(name) || name.length > 64 || description.length > 10_000 || prompt.length > 100_000 || prompt.trim().length === 0 || typeof enabled !== "boolean") throw new Error("prompt command is invalid");
    const updatedAt = now();
    this.db.run("UPDATE prompt_commands SET name = ?, description = ?, prompt = ?, enabled = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [name, description, prompt, enabled ? 1 : 0, updatedAt, commandId, userId]);
    return this.getPromptCommand(userId, commandId) as PromptCommandRecord;
  }

  deletePromptCommand(userId: string, commandId: string): void {
    const result = this.db.run("DELETE FROM prompt_commands WHERE id = ? AND owner_id = ?", [commandId, userId]);
    if (result.changes === 0) throw new OwnershipError("Prompt Command is not owned by the authenticated user");
  }

  private agent(row: Row): AgentRecord {
    const id = required(row.id, "agent id");
    const model = this.db.query<{ model: string | null; reasoning_effort: string | null }, [string]>("SELECT model, reasoning_effort FROM agent_model_config WHERE agent_id = ?").get(id);
    return {
      id, ownerId: required(row.owner_id, "agent owner"), projectId: required(row.project_id, "agent project"), name: required(row.name, "agent name"),
      description: row.description ?? "", icon: row.icon ?? "bot", instructions: row.instructions ?? "",
      ...(model?.model ? { model: model.model } : {}), ...(model?.reasoning_effort ? { reasoningEffort: model.reasoning_effort } : {}),
      capabilities: this.db.query<{ capability_id: string; enabled: number }, [string]>("SELECT capability_id, enabled FROM agent_capabilities WHERE agent_id = ? ORDER BY capability_id").all(id).map(item => ({ capabilityId: item.capability_id, enabled: item.enabled === 1 })),
      permissions: this.db.query<{ capability_id: string; policy: AgentPermission }, [string]>("SELECT capability_id, policy FROM agent_permissions WHERE agent_id = ? ORDER BY capability_id").all(id).map(item => ({ capabilityId: item.capability_id, policy: item.policy })),
      skillIds: this.db.query<{ skill_id: string }, [string]>("SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY position, skill_id").all(id).map(item => item.skill_id),
      createdAt: required(row.created_at, "agent createdAt"),
      capabilityMode: row.capability_mode === "explicit" ? "explicit" : "legacy",
    };
  }

  private agentRows(userId: string, projectId?: string): readonly Row[] {
    const query = projectId === undefined
      ? "SELECT id, owner_id, project_id, name, description, icon, instructions, capability_mode, created_at FROM agents WHERE owner_id = ? ORDER BY created_at, id"
      : "SELECT id, owner_id, project_id, name, description, icon, instructions, capability_mode, created_at FROM agents WHERE owner_id = ? AND project_id = ? ORDER BY created_at, id";
    return projectId === undefined ? this.db.query<Row, [string]>(query).all(userId) : this.db.query<Row, [string, string]>(query).all(userId, projectId);
  }

  listAgents(userId: string, projectId?: string): readonly AgentRecord[] { return this.agentRows(userId, projectId).map(row => this.agent(row)); }

  createAgent(userId: string, projectId: string, name: string, instructions: string, icon = "bot"): AgentRecord {
    const project = this.db.query<{ id: string }, [string, string]>("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(projectId, userId);
    if (project === null) throw new OwnershipError("Project is not owned by the authenticated user");
    if (name.trim().length === 0 || name.length > 128 || instructions.length > 100_000 || !/^[a-z-]{2,32}$/.test(icon)) throw new Error("agent is invalid");
    const agent = { id: randomUUID(), ownerId: userId, projectId, name: name.trim(), icon, instructions, createdAt: now() };
    this.db.run("INSERT INTO agents (id, owner_id, project_id, name, icon, instructions, capability_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, 'explicit', ?)", [agent.id, agent.ownerId, agent.projectId, agent.name, agent.icon, agent.instructions, agent.createdAt]);
    this.db.run("UPDATE projects SET default_agent_id = ? WHERE id = ? AND owner_id = ? AND default_agent_id IS NULL", [agent.id, projectId, userId]);
    return this.getAgent(userId, agent.id) as AgentRecord;
  }

  getAgent(userId: string, agentId: string): AgentRecord | null {
    const row = this.db.query<Row, [string, string]>("SELECT id, owner_id, project_id, name, description, icon, instructions, capability_mode, created_at FROM agents WHERE id = ? AND owner_id = ?").get(agentId, userId);
    return row === null ? null : this.agent(row);
  }

  deleteAgent(userId: string, agentId: string): void {
    const result = this.db.run("DELETE FROM agents WHERE id = ? AND owner_id = ?", [agentId, userId]);
    if (result.changes === 0) throw new OwnershipError("Agent is not owned by the authenticated user");
  }

  getAgentProjectOverride(userId: string, projectId: string, agentId: string): AgentProjectOverride | null {
    const row = this.db.query<{ project_id: string; agent_id: string; capabilities_json: string | null; permissions_json: string | null; model: string | null; reasoning_effort: string | null }, [string, string, string]>("SELECT o.project_id, o.agent_id, o.capabilities_json, o.permissions_json, o.model, o.reasoning_effort FROM agent_project_overrides o JOIN projects p ON p.id = o.project_id JOIN agents a ON a.id = o.agent_id WHERE p.owner_id = ? AND o.project_id = ? AND o.agent_id = ?").get(userId, projectId, agentId);
    if (row === null) return null;
    const parse = <T>(value: string | null): T | undefined => value === null ? undefined : JSON.parse(value) as T;
    const capabilities = parse<readonly AgentCapabilityAssignment[]>(row.capabilities_json);
    const permissions = parse<readonly AgentPermissionPolicy[]>(row.permissions_json);
    return { projectId: row.project_id, agentId: row.agent_id, ...(capabilities === undefined ? {} : { capabilities }), ...(permissions === undefined ? {} : { permissions }), ...(row.model === null ? {} : { model: row.model }), ...(row.reasoning_effort === null ? {} : { reasoningEffort: row.reasoning_effort }) };
  }

  setAgentProjectOverride(userId: string, override: AgentProjectOverride): AgentProjectOverride {
    if (this.db.query<{ id: string }, [string, string, string]>("SELECT p.id FROM projects p JOIN agents a ON a.project_id = p.id WHERE p.id = ? AND a.id = ? AND p.owner_id = ?").get(override.projectId, override.agentId, userId) === null) throw new OwnershipError();
    if (override.capabilities !== undefined) this.validateCapabilities(override.capabilities);
    if (override.permissions !== undefined) this.validatePermissions(override.permissions);
    this.db.run("INSERT INTO agent_project_overrides (project_id, agent_id, capabilities_json, permissions_json, model, reasoning_effort) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, agent_id) DO UPDATE SET capabilities_json = excluded.capabilities_json, permissions_json = excluded.permissions_json, model = excluded.model, reasoning_effort = excluded.reasoning_effort", [override.projectId, override.agentId, override.capabilities === undefined ? null : JSON.stringify(override.capabilities), override.permissions === undefined ? null : JSON.stringify(override.permissions), override.model ?? null, override.reasoningEffort ?? null]);
    return this.getAgentProjectOverride(userId, override.projectId, override.agentId) as AgentProjectOverride;
  }

  updateAgent(userId: string, agentId: string, input: AgentConfigurationInput): AgentRecord {
    const existing = this.getAgent(userId, agentId);
    if (existing === null) throw new OwnershipError("Agent is not owned by the authenticated user");
    const name = input.name === undefined ? existing.name : input.name.trim();
    const instructions = input.instructions ?? existing.instructions;
    const description = input.description ?? existing.description;
    const icon = input.icon === undefined ? existing.icon : input.icon;
    if (!name || name.length > 128 || instructions.length > 100_000 || description.length > 10_000 || !/^[a-z-]{2,32}$/.test(icon)) throw new Error("agent is invalid");
    this.db.run("BEGIN IMMEDIATE");
    try {
      this.db.run("UPDATE agents SET name = ?, description = ?, icon = ?, instructions = ?, capability_mode = 'explicit' WHERE id = ?", [name, description, icon, instructions, agentId]);
      if (input.model !== undefined || input.reasoningEffort !== undefined) this.db.run("INSERT INTO agent_model_config (agent_id, model, reasoning_effort) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET model = excluded.model, reasoning_effort = excluded.reasoning_effort", [agentId, input.model === null ? null : input.model ?? existing.model ?? null, input.reasoningEffort === null ? null : input.reasoningEffort ?? existing.reasoningEffort ?? null]);
      if (input.capabilities !== undefined) { this.validateCapabilities(input.capabilities); this.db.run("DELETE FROM agent_capabilities WHERE agent_id = ?", [agentId]); for (const item of input.capabilities) this.db.run("INSERT INTO agent_capabilities (agent_id, capability_id, enabled) VALUES (?, ?, ?)", [agentId, item.capabilityId, item.enabled ? 1 : 0]); }
      if (input.permissions !== undefined) { this.validatePermissions(input.permissions); this.db.run("DELETE FROM agent_permissions WHERE agent_id = ?", [agentId]); for (const item of input.permissions) this.db.run("INSERT INTO agent_permissions (agent_id, capability_id, policy) VALUES (?, ?, ?)", [agentId, item.capabilityId, item.policy]); }
      if (input.skillIds !== undefined) { this.validateSkills(input.skillIds, userId); this.db.run("DELETE FROM agent_skills WHERE agent_id = ?", [agentId]); input.skillIds.forEach((skillId, position) => this.db.run("INSERT INTO agent_skills (agent_id, skill_id, position) VALUES (?, ?, ?)", [agentId, skillId, position])); }
      this.db.run("COMMIT"); return this.getAgent(userId, agentId) as AgentRecord;
    } catch (error) { this.db.run("ROLLBACK"); throw error; }
  }

  private validateCapabilities(items: readonly AgentCapabilityAssignment[]): void { if (new Set(items.map(item => item.capabilityId)).size !== items.length || items.some(item => !item.capabilityId || item.capabilityId.length > 512)) throw new Error("agent capabilities are invalid"); }
  private validatePermissions(items: readonly AgentPermissionPolicy[]): void { if (new Set(items.map(item => item.capabilityId)).size !== items.length || items.some(item => !item.capabilityId || !["allow", "ask", "deny"].includes(item.policy))) throw new Error("agent permissions are invalid"); }
  private validateSkills(items: readonly string[], userId: string): void {
    if (new Set(items).size !== items.length || items.some(item => !item || item.length > 512)) throw new Error("agent skills are invalid");
    const owned = new Set(this.db.query<{ id: string }, [string]>("SELECT id FROM skills WHERE owner_id = ?").all(userId).map(item => item.id));
    if (items.some(item => !owned.has(item))) throw new OwnershipError("Skill is not owned by the authenticated user");
  }

  claimSession(userId: string, sessionId: string, projectId?: string, agentId?: string): void {
    if (projectId !== undefined && this.db.query<{ id: string }, [string, string]>("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(projectId, userId) === null) throw new OwnershipError();
    if (agentId !== undefined) {
      const agent = this.db.query<{ id: string; project_id: string }, [string, string]>("SELECT id, project_id FROM agents WHERE id = ? AND owner_id = ?").get(agentId, userId);
      if (agent === null || (projectId !== undefined && agent.project_id !== projectId)) throw new OwnershipError();
    }
    const existing = this.db.query<{ owner_id: string }, [string]>("SELECT owner_id FROM session_owners WHERE session_id = ?").get(sessionId);
    if (existing !== null && existing.owner_id !== userId) throw new OwnershipError();
    this.db.run("INSERT OR IGNORE INTO session_owners (session_id, owner_id, project_id, agent_id, created_at) VALUES (?, ?, ?, ?, ?)", [sessionId, userId, projectId ?? null, agentId ?? null, now()]);
  }

  assertSessionOwner(userId: string, sessionId: string): void {
    if (this.db.query<{ session_id: string }, [string, string]>("SELECT session_id FROM session_owners WHERE session_id = ? AND owner_id = ?").get(sessionId, userId) === null) throw new OwnershipError("Session is not owned by the authenticated user");
  }

  listSessions(userId: string): readonly OwnedSessionRecord[] {
    const rows = this.db.query<Row & { session_id: string; project_id: string | null; agent_id: string | null }, [string]>(
      "SELECT session_id, owner_id, project_id, agent_id, created_at FROM session_owners WHERE owner_id = ? ORDER BY created_at, session_id",
    ).all(userId);
    return rows.map(row => ({
      sessionId: row.session_id,
      ownerId: required(row.owner_id, "session owner"),
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      ...(row.agent_id === null ? {} : { agentId: row.agent_id }),
      createdAt: required(row.created_at, "session createdAt"),
    }));
  }

  getUser(userId: string): IdentityUser | null {
    const row = this.db.query<{ id: string; username: string }, [string]>("SELECT id, username FROM users WHERE id = ?").get(userId);
    return row === null ? null : { id: row.id, username: row.username };
  }

  private automation(row: AutomationDbRow): AutomationRecord {
    const schedule = JSON.parse(row.schedule_json) as AutomationSchedule;
    const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      enabled: row.enabled === 1,
      schedule,
      prompt: row.prompt,
      agentId: row.agent_id,
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      ...(row.model === null ? {} : { model: row.model }),
      permissionMode: row.permission_mode as AutomationPermissionMode,
      metadata,
      ...(row.last_run_at === null ? {} : { lastRunAt: row.last_run_at }),
      ...(row.next_run_at === null ? {} : { nextRunAt: row.next_run_at }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private automationRun(row: AutomationRunDbRow): AutomationRunRecord {
    return {
      id: row.id,
      automationId: row.automation_id,
      ownerId: row.owner_id,
      status: row.status as AutomationRunStatus,
      scheduledFor: row.scheduled_for,
      ...(row.started_at === null ? {} : { startedAt: row.started_at }),
      ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
      sessionId: row.session_id,
      ...(row.error === null ? {} : { error: row.error }),
      triggerMetadata: JSON.parse(row.trigger_metadata_json) as Record<string, unknown>,
    };
  }

  private automationRow(userId: string, automationId: string): AutomationDbRow | null {
    return this.db.query<AutomationDbRow, [string, string]>(
      "SELECT id, owner_id, name, enabled, schedule_json, prompt, agent_id, project_id, model, permission_mode, metadata_json, last_run_at, next_run_at, created_at, updated_at FROM automations WHERE id = ? AND owner_id = ?",
    ).get(automationId, userId);
  }

  private validateAutomationInput(userId: string, input: AutomationInput, existing?: AutomationRecord): void {
    if (!input.name.trim() || input.name.length > 128 || input.prompt.trim().length === 0 || input.prompt.length > 100_000) throw new Error("automation is invalid");
    if (!input.agentId || this.getAgent(userId, input.agentId) === null) throw new OwnershipError("Agent is not owned by the authenticated user");
    if (input.projectId !== undefined && input.projectId !== null) {
      if (this.getProject(userId, input.projectId) === null) throw new OwnershipError("Project is not owned by the authenticated user");
      const agent = this.getAgent(userId, input.agentId);
      if (agent === null || agent.projectId !== input.projectId) throw new OwnershipError("Agent is not assigned to this project");
    }
    if (input.model !== undefined && input.model !== null && (!input.model.trim() || input.model.length > 256)) throw new Error("automation model is invalid");
    if (!['read-only', 'pre-approved', 'fail'].includes(input.permissionMode)) throw new Error("automation permission mode is invalid");
    if (input.schedule.kind === "cron") {
      if (!input.schedule.expression.trim() || input.schedule.expression.trim().split(/\s+/).length !== 5) throw new Error("automation schedule is invalid");
      try { new Intl.DateTimeFormat("en-US", { timeZone: input.schedule.timezone }).format(); } catch { throw new Error("automation timezone is invalid"); }
    } else if (input.schedule.kind === "once") {
      if (Number.isNaN(Date.parse(input.schedule.at))) throw new Error("automation schedule is invalid");
      try { new Intl.DateTimeFormat("en-US", { timeZone: input.schedule.timezone }).format(); } catch { throw new Error("automation timezone is invalid"); }
    } else throw new Error("automation schedule is invalid");
    if (existing !== undefined && existing.ownerId !== userId) throw new OwnershipError();
  }

  listAutomations(userId: string, projectId?: string): readonly AutomationRecord[] {
    const query = projectId === undefined
      ? "SELECT id, owner_id, name, enabled, schedule_json, prompt, agent_id, project_id, model, permission_mode, metadata_json, last_run_at, next_run_at, created_at, updated_at FROM automations WHERE owner_id = ? ORDER BY created_at, id"
      : "SELECT id, owner_id, name, enabled, schedule_json, prompt, agent_id, project_id, model, permission_mode, metadata_json, last_run_at, next_run_at, created_at, updated_at FROM automations WHERE owner_id = ? AND project_id = ? ORDER BY created_at, id";
    return (projectId === undefined
      ? this.db.query<AutomationDbRow, [string]>(query).all(userId)
      : this.db.query<AutomationDbRow, [string, string]>(query).all(userId, projectId)).map(row => this.automation(row));
  }

  getAutomation(userId: string, automationId: string): AutomationRecord | null {
    const row = this.automationRow(userId, automationId);
    return row === null ? null : this.automation(row);
  }

  createAutomation(userId: string, input: AutomationInput): AutomationRecord {
    this.validateAutomationInput(userId, input);
    const at = now();
    const automation = { id: randomUUID(), ownerId: userId, name: input.name.trim(), enabled: input.enabled !== false, schedule: input.schedule, prompt: input.prompt, agentId: input.agentId, ...(input.projectId === undefined || input.projectId === null ? {} : { projectId: input.projectId }), ...(input.model?.trim() ? { model: input.model.trim() } : {}), permissionMode: input.permissionMode, metadata: input.metadata ?? {}, ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}), createdAt: at, updatedAt: at };
    this.db.run("INSERT INTO automations (id, owner_id, name, enabled, schedule_json, prompt, agent_id, project_id, model, permission_mode, metadata_json, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [automation.id, userId, automation.name, automation.enabled ? 1 : 0, JSON.stringify(automation.schedule), automation.prompt, automation.agentId, automation.projectId ?? null, automation.model ?? null, automation.permissionMode, JSON.stringify(automation.metadata), automation.enabled ? automation.nextRunAt ?? null : null, at, at]);
    return this.getAutomation(userId, automation.id) as AutomationRecord;
  }

  updateAutomation(userId: string, automationId: string, input: Partial<AutomationInput>): AutomationRecord {
    const existing = this.getAutomation(userId, automationId);
    if (existing === null) throw new OwnershipError("Automation is not owned by the authenticated user");
    const next: AutomationInput = {
      name: input.name ?? existing.name,
      enabled: input.enabled ?? existing.enabled,
      schedule: input.schedule ?? existing.schedule,
      prompt: input.prompt ?? existing.prompt,
      agentId: input.agentId ?? existing.agentId,
      ...(input.projectId === undefined ? (existing.projectId === undefined ? {} : { projectId: existing.projectId }) : input.projectId === null ? { projectId: null } : { projectId: input.projectId }),
      model: input.model === undefined ? existing.model ?? null : input.model,
      permissionMode: input.permissionMode ?? existing.permissionMode,
      metadata: input.metadata ?? existing.metadata,
      nextRunAt: input.nextRunAt === undefined ? existing.nextRunAt ?? null : input.nextRunAt,
    };
    this.validateAutomationInput(userId, next, existing);
    const at = now();
    this.db.run("UPDATE automations SET name = ?, enabled = ?, schedule_json = ?, prompt = ?, agent_id = ?, project_id = ?, model = ?, permission_mode = ?, metadata_json = ?, next_run_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?", [next.name.trim(), next.enabled === false ? 0 : 1, JSON.stringify(next.schedule), next.prompt, next.agentId, next.projectId ?? null, next.model?.trim() || null, next.permissionMode, JSON.stringify(next.metadata ?? {}), next.enabled === false ? null : next.nextRunAt ?? null, at, automationId, userId]);
    return this.getAutomation(userId, automationId) as AutomationRecord;
  }

  deleteAutomation(userId: string, automationId: string): void {
    const result = this.db.run("DELETE FROM automations WHERE id = ? AND owner_id = ?", [automationId, userId]);
    if (result.changes === 0) throw new OwnershipError("Automation is not owned by the authenticated user");
  }

  listDueAutomations(at: string): readonly AutomationRecord[] {
    return this.db.query<AutomationDbRow, [string]>("SELECT id, owner_id, name, enabled, schedule_json, prompt, agent_id, project_id, model, permission_mode, metadata_json, last_run_at, next_run_at, created_at, updated_at FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at, id").all(at).map(row => this.automation(row));
  }

  claimDueAutomationRun(automationId: string, scheduledFor: string, nextRunAt: string | null, triggerMetadata: Record<string, unknown> = {}): AutomationRunRecord | null {
    const at = now();
    const run = { id: randomUUID(), sessionId: randomUUID() };
    this.db.run("BEGIN IMMEDIATE");
    try {
      const row = this.db.query<{ owner_id: string; enabled: number; next_run_at: string | null }, [string]>("SELECT owner_id, enabled, next_run_at FROM automations WHERE id = ?").get(automationId);
      if (row === null || row.enabled !== 1 || row.next_run_at !== scheduledFor) { this.db.run("COMMIT"); return null; }
      const inserted = this.db.run("INSERT OR IGNORE INTO automation_runs (id, automation_id, owner_id, status, scheduled_for, session_id, trigger_metadata_json) VALUES (?, ?, ?, 'queued', ?, ?, ?)", [run.id, automationId, row.owner_id, scheduledFor, run.sessionId, JSON.stringify(triggerMetadata)]);
      if (inserted.changes === 0) { this.db.run("COMMIT"); return null; }
      this.db.run("UPDATE automations SET next_run_at = ?, enabled = ?, updated_at = ? WHERE id = ? AND next_run_at = ?", [nextRunAt, nextRunAt === null ? 0 : 1, at, automationId, scheduledFor]);
      this.db.run("COMMIT");
      return this.getAutomationRun(row.owner_id, automationId, run.id);
    } catch (error) { this.db.run("ROLLBACK"); throw error; }
  }

  triggerAutomation(userId: string, automationId: string, triggerMetadata: Record<string, unknown> = {}): AutomationRunRecord {
    const automation = this.getAutomation(userId, automationId);
    if (automation === null) throw new OwnershipError("Automation is not owned by the authenticated user");
    const scheduledFor = now();
    const run = { id: randomUUID(), sessionId: randomUUID() };
    this.db.run("INSERT INTO automation_runs (id, automation_id, owner_id, status, scheduled_for, session_id, trigger_metadata_json) VALUES (?, ?, ?, 'queued', ?, ?, ?)", [run.id, automationId, userId, scheduledFor, run.sessionId, JSON.stringify({ ...triggerMetadata, manual: true })]);
    return this.getAutomationRun(userId, automationId, run.id) as AutomationRunRecord;
  }

  getAutomationRun(userId: string, automationId: string, runId: string): AutomationRunRecord | null {
    const row = this.db.query<AutomationRunDbRow, [string, string, string]>("SELECT id, automation_id, owner_id, status, scheduled_for, started_at, completed_at, session_id, error, trigger_metadata_json FROM automation_runs WHERE id = ? AND automation_id = ? AND owner_id = ?").get(runId, automationId, userId);
    return row === null ? null : this.automationRun(row);
  }

  listAutomationRuns(userId: string, automationId: string): readonly AutomationRunRecord[] {
    return this.db.query<AutomationRunDbRow, [string, string]>("SELECT id, automation_id, owner_id, status, scheduled_for, started_at, completed_at, session_id, error, trigger_metadata_json FROM automation_runs WHERE automation_id = ? AND owner_id = ? ORDER BY scheduled_for DESC, id DESC").all(automationId, userId).map(row => this.automationRun(row));
  }

  updateAutomationRun(runId: string, status: AutomationRunStatus, error?: string): AutomationRunRecord | null {
    const at = now();
    const run = this.db.query<AutomationRunDbRow, [string]>("SELECT id, automation_id, owner_id, status, scheduled_for, started_at, completed_at, session_id, error, trigger_metadata_json FROM automation_runs WHERE id = ?").get(runId);
    if (run === null) return null;
    const startedAt = run.started_at ?? (status === "running" ? at : null);
    const terminal = ["completed", "failed", "cancelled", "needs_attention"].includes(status);
    this.db.run("UPDATE automation_runs SET status = ?, started_at = ?, completed_at = ?, error = ? WHERE id = ?", [status, startedAt, terminal ? at : run.completed_at, error ?? (terminal ? null : run.error), runId]);
    if (terminal) this.db.run("UPDATE automations SET last_run_at = ?, updated_at = ? WHERE id = ?", [at, at, run.automation_id]);
    const updated = this.db.query<AutomationRunDbRow, [string]>("SELECT id, automation_id, owner_id, status, scheduled_for, started_at, completed_at, session_id, error, trigger_metadata_json FROM automation_runs WHERE id = ?").get(runId);
    return updated === null ? null : this.automationRun(updated);
  }

  recoverAutomationRuns(): void {
    const at = now();
    this.db.run("UPDATE automation_runs SET status = 'failed', completed_at = ?, error = 'Server restarted before the automation run completed' WHERE status IN ('queued', 'running')", [at]);
  }

  setupStatus(userId: string): SetupStatus {
    const providerConfigured = this.providerConnection() !== null;
    const complete = providerConfigured && this.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM agents WHERE owner_id = ? AND name = 'master'",
    ).get(userId)?.count === 1;
    return { complete, providerConfigured };
  }

  providerConnection(): ProviderConnection | null {
    const row = this.db.query<ProviderRow, []>(
      "SELECT provider, base_url, credential_ciphertext, model FROM provider_connections WHERE id = 1",
    ).get();
    if (row === null) return null;
    const provider = providerSlug(row.provider);
    decryptCredential(row.credential_ciphertext, this.key());
    return { providerId: provider, baseUrl: row.base_url, credentialHandle: `${provider}:default`, model: row.model };
  }

  modelDefaults(userId: string): ModelDefaults {
    const connection = this.providerConnection();
    const fallback = connection?.model ?? "default";
    const row = this.db.query<{ conversation: string; internal: string; voice: string; image: string }, [string]>(
      "SELECT conversation, internal, voice, image FROM user_model_defaults WHERE user_id = ?",
    ).get(userId);
    return row === null ? { conversation: fallback, internal: fallback, voice: fallback, image: fallback } : row;
  }

  setModelDefaults(userId: string, value: Record<keyof ModelDefaults, unknown>): ModelDefaults {
    const defaults = modelDefaults(value);
    this.db.run(
      "INSERT INTO user_model_defaults (user_id, conversation, internal, voice, image, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET conversation = excluded.conversation, internal = excluded.internal, voice = excluded.voice, image = excluded.image, updated_at = excluded.updated_at",
      [userId, defaults.conversation, defaults.internal, defaults.voice, defaults.image, now()],
    );
    return defaults;
  }

  voiceSettings(userId: string): VoiceSettings {
    const row = this.db.query<{ stt_json: string; tts_json: string }, [string]>(
      "SELECT stt_json, tts_json FROM user_voice_settings WHERE user_id = ?",
    ).get(userId);
    if (row === null) return {
      stt: { provider: "none", model: "default", language: "auto", endpoint: "https://example.invalid/stt", configured: false },
      tts: { provider: "none", model: "default", voice: "default", speed: 1, endpoint: "https://example.invalid/tts", autoPlay: false, configured: false },
    };
    try {
      return voiceSettings({ stt: JSON.parse(row.stt_json) as Record<string, unknown>, tts: JSON.parse(row.tts_json) as Record<string, unknown> }).settings;
    } catch {
      throw new Error("voice settings are unavailable");
    }
  }

  voiceProviderRuntime(userId: string): VoiceProviderRuntime {
    const row = this.db.query<{ stt_json: string; tts_json: string; secrets_ciphertext: string }, [string]>(
      "SELECT stt_json, tts_json, secrets_ciphertext FROM user_voice_settings WHERE user_id = ?",
    ).get(userId);
    if (row === null) throw new Error("voice provider is not configured");
    let normalized: { readonly settings: VoiceSettings; readonly secrets: Record<string, unknown> };
    try {
      normalized = voiceSettings({ stt: JSON.parse(row.stt_json) as Record<string, unknown>, tts: JSON.parse(row.tts_json) as Record<string, unknown>, secrets: decryptVoiceSecrets(row.secrets_ciphertext, this.key()) });
    } catch {
      throw new Error("voice settings are unavailable");
    }
    const sttApiKey = normalized.secrets.sttApiKey;
    const ttsApiKey = normalized.secrets.ttsApiKey;
    return {
      settings: normalized.settings,
      ...(typeof sttApiKey === "string" ? { sttApiKey } : {}),
      ...(typeof ttsApiKey === "string" ? { ttsApiKey } : {}),
    };
  }

  setVoiceSettings(userId: string, value: VoiceSettingsInput): VoiceSettings {
    const existing = this.db.query<{ secrets_ciphertext: string }, [string]>(
      "SELECT secrets_ciphertext FROM user_voice_settings WHERE user_id = ?",
    ).get(userId);
    const existingSecrets = existing === null ? {} : decryptVoiceSecrets(existing.secrets_ciphertext, this.key());
    const normalized = voiceSettings({
      stt: value.stt as Record<string, unknown>,
      tts: value.tts as Record<string, unknown>,
      secrets: {
        ...existingSecrets,
        ...(value.stt.apiKey === undefined || value.stt.apiKey === "" ? {} : { sttApiKey: value.stt.apiKey }),
        ...(value.tts.apiKey === undefined || value.tts.apiKey === "" ? {} : { ttsApiKey: value.tts.apiKey }),
      },
    });
    this.db.run(
      "INSERT INTO user_voice_settings (user_id, stt_json, tts_json, secrets_ciphertext, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET stt_json = excluded.stt_json, tts_json = excluded.tts_json, secrets_ciphertext = excluded.secrets_ciphertext, updated_at = excluded.updated_at",
      [userId, JSON.stringify(normalized.settings.stt), JSON.stringify(normalized.settings.tts), encryptVoiceSecrets(normalized.secrets, this.key(true)), now()],
    );
    return normalized.settings;
  }

  configureProvider(provider: string, baseUrl: string, apiKey: string, model: string): void {
    const normalizedProvider = providerSlug(provider);
    const normalizedBaseUrl = providerBaseUrl(baseUrl);
    const credential = validCredentials(providerCredential(apiKey));
    const normalizedModel = providerModel(model);
    this.configureProviderCredentials(normalizedProvider, normalizedBaseUrl, credential, normalizedModel);
  }

  configureProviderCredentials(provider: string, baseUrl: string, credentials: ProviderCredentials, model: string): void {
    const normalizedProvider = providerSlug(provider);
    const normalizedBaseUrl = providerBaseUrl(baseUrl);
    const credential = validCredentials(credentials);
    const normalizedModel = providerModel(model);
    const ciphertext = encryptCredential(credential, this.key(true));
    this.db.run(
      "INSERT INTO provider_connections (id, provider, base_url, credential_ciphertext, model, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, credential_ciphertext = excluded.credential_ciphertext, model = excluded.model, updated_at = excluded.updated_at",
      [normalizedProvider, normalizedBaseUrl, ciphertext, normalizedModel, now()],
    );
  }

  beginProviderOAuth(ownerId: string, provider: string, baseUrl: string, model: string, redirectUri: string, codeVerifier: string): ProviderOAuthState {
    const normalizedProvider = providerSlug(provider);
    const normalizedBaseUrl = providerBaseUrl(baseUrl);
    const normalizedModel = providerModel(model);
    if (redirectUri.trim().length === 0 || codeVerifier.trim().length < 43) throw new Error("provider OAuth state is invalid");
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    this.db.run("DELETE FROM provider_oauth_states WHERE expires_at <= ?", [now()]);
    this.db.run(
      "INSERT INTO provider_oauth_states (state_hash, owner_id, provider, base_url, model, redirect_uri, code_verifier_ciphertext, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [hashToken(state), ownerId, normalizedProvider, normalizedBaseUrl, normalizedModel, redirectUri, encryptCredential({ apiKey: codeVerifier }, this.key(true)), expiresAt, now()]
    );
    return { state, ownerId, providerId: normalizedProvider, baseUrl: normalizedBaseUrl, model: normalizedModel, redirectUri, codeVerifier, expiresAt };
  }

  consumeProviderOAuthState(ownerId: string, provider: string, state: string): ProviderOAuthState {
    const normalizedProvider = providerSlug(provider);
    const row = this.db.query<{ owner_id: string; provider: string; base_url: string; model: string; redirect_uri: string; code_verifier_ciphertext: string; expires_at: string }, [string]>(
      "SELECT owner_id, provider, base_url, model, redirect_uri, code_verifier_ciphertext, expires_at FROM provider_oauth_states WHERE state_hash = ?"
    ).get(hashToken(state));
    if (row === null || row.owner_id !== ownerId || row.provider !== normalizedProvider || Date.parse(row.expires_at) <= Date.now()) throw new Error("provider OAuth state is invalid");
    this.db.run("DELETE FROM provider_oauth_states WHERE state_hash = ?", [hashToken(state)]);
    const credentials = decryptCredential(row.code_verifier_ciphertext, this.key());
    if (credentials.apiKey === undefined) throw new Error("provider OAuth state is invalid");
    return { state, ownerId, providerId: normalizedProvider, baseUrl: row.base_url, model: row.model, redirectUri: row.redirect_uri, codeVerifier: credentials.apiKey, expiresAt: row.expires_at };
  }

  saveProviderCredential(handle: string, credentials: ProviderCredentials): void {
    if (typeof handle !== "string" || !/^[-a-z0-9]+:default$/.test(handle)) throw new Error("credential handle is invalid");
    const provider = handle.slice(0, -":default".length);
    if (this.db.query<{ provider: string }, []>("SELECT provider FROM provider_connections WHERE id = 1").get()?.provider !== provider) throw new Error("provider credential is unavailable");
    this.db.run("UPDATE provider_connections SET credential_ciphertext = ?, updated_at = ? WHERE id = 1", [encryptCredential(validCredentials(credentials), this.key(true)), now()]);
  }

  resolveCredentialHandle(handle: string): ProviderCredentials {
    if (typeof handle !== "string" || !/^[-a-z0-9]+:default$/.test(handle)) throw new Error("credential handle is invalid");
    const provider = handle.slice(0, -":default".length);
    const row = this.db.query<{ provider: string; credential_ciphertext: string }, []>(
      "SELECT provider, credential_ciphertext FROM provider_connections WHERE id = 1",
    ).get();
    if (row === null || row.provider !== provider) throw new Error("provider credential is unavailable");
    return decryptCredential(row.credential_ciphertext, this.key());
  }

  createInitialAgents(userId: string, templates: readonly string[], workspace = ""): { project: ProjectRecord; agents: readonly AgentRecord[] } {
    const allowed = new Set(["research"]);
    if (templates.some(template => !allowed.has(template))) throw new Error("agent template is invalid");
    this.db.run("BEGIN IMMEDIATE");
    try {
      let project = this.listProjects(userId)[0];
      if (project === undefined) project = this.createProject(userId, { name: "My workspace", workspace });
      const existing = this.listAgents(userId, project.id);
      const created: AgentRecord[] = [];
      if (!existing.some(agent => agent.name === "master")) created.push(this.createAgent(userId, project.id, "master", "You are the primary Subpolar agent. Coordinate the selected specialist agents when useful."));
      if (templates.includes("research") && !existing.some(agent => agent.name === "research")) created.push(this.createAgent(userId, project.id, "research", "Research thoroughly, cite uncertainty, and return concise findings to the master agent."));
      this.db.run("COMMIT");
      return { project, agents: created };
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }
}
