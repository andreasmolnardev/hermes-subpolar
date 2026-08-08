import { createHash, createSign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderCredentials, ProviderOAuthState, SQLiteIdentityRepository } from "data-layer";
import { modelProvider, type ProviderOAuthProfile, type ProviderProfile } from "@hermes/shared/model-providers";

type OAuthTokenPayload = {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly token_type?: unknown;
  readonly expires_in?: unknown;
  readonly expires_at?: unknown;
};

export type OAuthStart = {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt: string;
};

export type DeviceStart = {
  readonly deviceCode: string;
  readonly userCode?: string;
  readonly verificationUri?: string;
  readonly verificationUriComplete?: string;
  readonly expiresIn?: number;
  readonly interval?: number;
};

function env(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function oauthConfig(profile: ProviderProfile): ProviderOAuthProfile {
  if (profile.oauth === undefined) throw new Error("provider_oauth_not_supported");
  const authorizationUrl = env(profile.oauth.authorizationUrlEnv) ?? profile.oauth.authorizationUrl;
  const tokenUrl = env(profile.oauth.tokenUrlEnv) ?? profile.oauth.tokenUrl;
  if (authorizationUrl === undefined || tokenUrl === undefined) throw new Error("provider_oauth_not_configured");
  return { ...profile.oauth, authorizationUrl, tokenUrl };
}

function providerProfile(providerId: string): ProviderProfile {
  const profile = modelProvider(providerId);
  if (profile === undefined) throw new Error("provider_not_found");
  return profile;
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function callbackUrl(origin: string, providerId: string): string {
  const url = new URL(origin);
  url.pathname = `/v1/providers/${encodeURIComponent(providerId)}/auth/callback`;
  url.search = "";
  return url.toString();
}

export function beginProviderOAuth(
  identity: SQLiteIdentityRepository,
  providerId: string,
  baseUrl: string,
  model: string,
  origin: string,
  ownerId: string
): OAuthStart {
  const profile = providerProfile(providerId);
  const config = oauthConfig(profile);
  const clientId = env(config.clientIdEnv);
  if (clientId === undefined) throw new Error("provider_oauth_client_not_configured");
  const redirectUri = callbackUrl(origin, profile.id);
  const verifier = randomBytes(32).toString("base64url");
  const state = identity.beginProviderOAuth(ownerId, profile.id, baseUrl, model, redirectUri, verifier);
  const url = new URL(config.authorizationUrl as string);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state.state);
  if (config.scopes !== undefined && config.scopes.length > 0) url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("code_challenge", challenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return { authorizationUrl: url.toString(), state: state.state, expiresAt: state.expiresAt };
}

function tokenCredentials(payload: OAuthTokenPayload): ProviderCredentials {
  if (typeof payload.access_token !== "string" || payload.access_token.trim().length === 0) throw new Error("provider_oauth_token_invalid");
  const expiresAt = typeof payload.expires_at === "number"
    ? payload.expires_at * 1000
    : typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : undefined;
  return {
    accessToken: payload.access_token,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.token_type === "string" ? { tokenType: payload.token_type } : {}),
    ...(expiresAt === undefined ? {} : { expiresAt })
  };
}

async function tokenRequest(config: ProviderOAuthProfile, fields: Record<string, string>, fetcher: typeof fetch): Promise<ProviderCredentials> {
  const clientId = env(config.clientIdEnv);
  if (clientId === undefined) throw new Error("provider_oauth_client_not_configured");
  const body = new URLSearchParams({ ...fields, client_id: clientId });
  const clientSecret = env(config.clientSecretEnv);
  if (clientSecret !== undefined) body.set("client_secret", clientSecret);
  const response = await fetcher(config.tokenUrl as string, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: body.toString() });
  const payload = await response.json() as OAuthTokenPayload;
  if (!response.ok) throw new Error("provider_oauth_exchange_failed");
  return tokenCredentials(payload);
}

export async function completeProviderOAuth(
  identity: SQLiteIdentityRepository,
  providerId: string,
  stateValue: string,
  code: string,
  ownerId: string,
  fetcher: typeof fetch = fetch
): Promise<ProviderOAuthState> {
  const profile = providerProfile(providerId);
  const config = oauthConfig(profile);
  const state = identity.consumeProviderOAuthState(ownerId, profile.id, stateValue);
  const credentials = await tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: state.redirectUri, code_verifier: state.codeVerifier }, fetcher);
  identity.configureProviderCredentials(profile.id, state.baseUrl, credentials, state.model);
  return state;
}

export async function refreshProviderCredential(
  identity: SQLiteIdentityRepository,
  providerId: string,
  handle: string,
  credentials: ProviderCredentials,
  fetcher: typeof fetch = fetch
): Promise<ProviderCredentials> {
  if (credentials.refreshToken === undefined || credentials.expiresAt === undefined || credentials.expiresAt > Date.now() + 60_000) return credentials;
  const config = oauthConfig(providerProfile(providerId));
  const refreshed = await tokenRequest(config, { grant_type: "refresh_token", refresh_token: credentials.refreshToken }, fetcher);
  const merged = { ...credentials, ...refreshed, refreshToken: refreshed.refreshToken ?? credentials.refreshToken };
  identity.saveProviderCredential(handle, merged);
  return merged;
}

export async function resolveGcpCredential(credentials: ProviderCredentials, fetcher: typeof fetch = fetch): Promise<ProviderCredentials> {
  if (credentials.accessToken !== undefined && credentials.accessToken.trim().length > 0) return credentials;
  if (credentials.clientEmail === undefined || credentials.privateKey === undefined) throw new Error("gcp_credentials_unavailable");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: credentials.clientEmail, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(credentials.privateKey, "base64url")}`;
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof payload.access_token !== "string") throw new Error("gcp_token_exchange_failed");
  return { ...credentials, accessToken: payload.access_token, ...(typeof payload.expires_in === "number" ? { expiresAt: Date.now() + payload.expires_in * 1000 } : {}) };
}

export function resolveAwsCredential(credentials: ProviderCredentials): ProviderCredentials {
  if (credentials.accessKeyId !== undefined && credentials.secretAccessKey !== undefined) return credentials;
  if (credentials.apiKey !== "env") throw new Error("aws_credentials_unavailable");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId !== undefined && secretAccessKey !== undefined) return {
    accessKeyId,
    secretAccessKey,
    ...(process.env.AWS_SESSION_TOKEN === undefined ? {} : { sessionToken: process.env.AWS_SESSION_TOKEN }),
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1"
  };
  const file = process.env.AWS_SHARED_CREDENTIALS_FILE ?? join(process.env.HOME ?? ".", ".aws", "credentials");
  try {
    const profile = process.env.AWS_PROFILE ?? "default";
    const section = new RegExp(`\\[${profile.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(readFileSync(file, "utf8"))?.[1];
    const value = (name: string) => section?.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"))?.[1]?.trim();
    const profileAccessKey = value("aws_access_key_id");
    const profileSecret = value("aws_secret_access_key");
    const profileSession = value("aws_session_token");
    if (profileAccessKey === undefined || profileSecret === undefined) throw new Error("aws profile is incomplete");
    return { accessKeyId: profileAccessKey, secretAccessKey: profileSecret, ...(profileSession === undefined ? {} : { sessionToken: profileSession }), region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" };
  } catch {
    throw new Error("aws_credentials_unavailable");
  }
}

export async function beginDeviceOAuth(providerId: string, fetcher: typeof fetch = fetch): Promise<DeviceStart> {
  const profile = providerProfile(providerId);
  const config = oauthConfig(profile);
  if (config.deviceUrl === undefined) throw new Error("provider_device_flow_not_supported");
  const clientId = env(config.clientIdEnv);
  if (clientId === undefined) throw new Error("provider_oauth_client_not_configured");
  const response = await fetcher(config.deviceUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ client_id: clientId, ...(config.scopes === undefined ? {} : { scope: config.scopes.join(" ") }) }).toString() });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof payload.device_code !== "string") throw new Error("provider_device_flow_failed");
  return {
    deviceCode: payload.device_code,
    ...(typeof payload.user_code === "string" ? { userCode: payload.user_code } : {}),
    ...(typeof payload.verification_uri === "string" ? { verificationUri: payload.verification_uri } : {}),
    ...(typeof payload.verification_uri_complete === "string" ? { verificationUriComplete: payload.verification_uri_complete } : {}),
    ...(typeof payload.expires_in === "number" ? { expiresIn: payload.expires_in } : {}),
    ...(typeof payload.interval === "number" ? { interval: payload.interval } : {})
  };
}

export async function completeDeviceOAuth(providerId: string, deviceCode: string, fetcher: typeof fetch = fetch): Promise<ProviderCredentials> {
  const config = oauthConfig(providerProfile(providerId));
  const credentials = await tokenRequest(config, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode }, fetcher);
  if (providerId !== "copilot" || credentials.accessToken === undefined) return credentials;
  const response = await fetcher("https://api.github.com/copilot_internal/v2/token", { headers: { accept: "application/json", authorization: `token ${credentials.accessToken}`, "user-agent": "hermes-subpolar" } });
  const payload = await response.json() as { token?: unknown; expires_at?: unknown };
  if (!response.ok || typeof payload.token !== "string") throw new Error("copilot_token_exchange_failed");
  return {
    accessToken: payload.token,
    subject: "copilot",
    ...(typeof payload.expires_at === "number" ? { expiresAt: payload.expires_at * 1000 } : {})
  };
}
