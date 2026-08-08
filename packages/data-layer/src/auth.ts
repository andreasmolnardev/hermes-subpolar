import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
  readonly createdAt: string;
};

export type AgentRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly name: string;
  readonly icon: string;
  readonly instructions: string;
  readonly createdAt: string;
};

export type OwnedSessionRecord = {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly createdAt: string;
};

export type ProviderConnection = {
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
};

export type SetupStatus = {
  readonly complete: boolean;
  readonly providerConfigured: boolean;
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
  icon?: string;
  instructions?: string;
  created_at?: string;
};

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
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'bot',
  instructions TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, project_id, name)
);
CREATE TABLE IF NOT EXISTS session_owners (
  session_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_owners_user ON session_owners(owner_id, created_at);
CREATE TABLE IF NOT EXISTS provider_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai-api',
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

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

export class SQLiteIdentityRepository {
  private readonly db: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec(AUTH_SCHEMA);
    try {
      this.db.exec("ALTER TABLE provider_connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'openai-api'");
    } catch {
      // Existing databases already have provider column.
    }
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN icon TEXT NOT NULL DEFAULT 'bot'");
    } catch {
      // Existing databases already have icon column.
    }
  }

  close(): void {
    this.db.close();
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

  listProjects(userId: string): readonly ProjectRecord[] {
    return this.db.query<ProjectRecord, [string]>("SELECT id, owner_id AS ownerId, name, created_at AS createdAt FROM projects WHERE owner_id = ? ORDER BY created_at, id").all(userId);
  }

  createProject(userId: string, name: string): ProjectRecord {
    if (name.trim().length === 0 || name.length > 128) throw new Error("project name is invalid");
    const project = { id: randomUUID(), ownerId: userId, name: name.trim(), createdAt: now() };
    this.db.run("INSERT INTO projects (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)", [project.id, project.ownerId, project.name, project.createdAt]);
    return project;
  }

  listAgents(userId: string, projectId?: string): readonly AgentRecord[] {
    const query = projectId === undefined
      ? "SELECT id, owner_id AS ownerId, project_id AS projectId, name, icon, instructions, created_at AS createdAt FROM agents WHERE owner_id = ? ORDER BY created_at, id"
      : "SELECT id, owner_id AS ownerId, project_id AS projectId, name, icon, instructions, created_at AS createdAt FROM agents WHERE owner_id = ? AND project_id = ? ORDER BY created_at, id";
    return projectId === undefined ? this.db.query<AgentRecord, [string]>(query).all(userId) : this.db.query<AgentRecord, [string, string]>(query).all(userId, projectId);
  }

  createAgent(userId: string, projectId: string, name: string, instructions: string, icon = "bot"): AgentRecord {
    const project = this.db.query<{ id: string }, [string, string]>("SELECT id FROM projects WHERE id = ? AND owner_id = ?").get(projectId, userId);
    if (project === null) throw new OwnershipError("Project is not owned by the authenticated user");
    if (name.trim().length === 0 || name.length > 128 || instructions.length > 100_000 || !/^[a-z-]{2,32}$/.test(icon)) throw new Error("agent is invalid");
    const agent = { id: randomUUID(), ownerId: userId, projectId, name: name.trim(), icon, instructions, createdAt: now() };
    this.db.run("INSERT INTO agents (id, owner_id, project_id, name, icon, instructions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [agent.id, agent.ownerId, agent.projectId, agent.name, agent.icon, agent.instructions, agent.createdAt]);
    return agent;
  }

  getAgent(userId: string, agentId: string): AgentRecord | null {
    return this.db.query<AgentRecord, [string, string]>(
      "SELECT id, owner_id AS ownerId, project_id AS projectId, name, icon, instructions, created_at AS createdAt FROM agents WHERE id = ? AND owner_id = ?",
    ).get(agentId, userId);
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

  setupStatus(userId: string): SetupStatus {
    const providerConfigured = this.providerConnection() !== null;
    const complete = providerConfigured && this.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM agents WHERE owner_id = ? AND name = 'master'",
    ).get(userId)?.count === 1;
    return { complete, providerConfigured };
  }

  providerConnection(): ProviderConnection | null {
    const row = this.db.query<{ provider: string; base_url: string; api_key: string; model: string }, []>(
      "SELECT provider, base_url, api_key, model FROM provider_connections WHERE id = 1",
    ).get();
    return row === null ? null : { provider: row.provider, baseUrl: row.base_url, apiKey: row.api_key, model: row.model };
  }

  configureProvider(provider: string, baseUrl: string, apiKey: string, model: string): void {
    if (!provider.trim() || provider.length > 128) throw new Error("provider is invalid");
    let parsed: URL;
    try { parsed = new URL(baseUrl); } catch { throw new Error("provider URL is invalid"); }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) throw new Error("provider URL must use HTTPS");
    if (!apiKey.trim() || !model.trim() || model.length > 256) throw new Error("provider configuration is invalid");
    this.db.run(
      "INSERT INTO provider_connections (id, provider, base_url, api_key, model, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, api_key = excluded.api_key, model = excluded.model, updated_at = excluded.updated_at",
      [provider.trim(), parsed.toString().replace(/\/$/, ""), apiKey, model.trim(), now()],
    );
  }

  createInitialAgents(userId: string, templates: readonly string[]): { project: ProjectRecord; agents: readonly AgentRecord[] } {
    const allowed = new Set(["research"]);
    if (templates.some(template => !allowed.has(template))) throw new Error("agent template is invalid");
    this.db.run("BEGIN IMMEDIATE");
    try {
      let project = this.listProjects(userId)[0];
      if (project === undefined) project = this.createProject(userId, "My workspace");
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
