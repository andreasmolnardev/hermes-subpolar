import type { Credential, CredentialInfo, CredentialStore, ProviderEnv } from "@earendil-works/pi-ai";

export type SubpolarPiCredentialMode = "api_key" | "oauth" | "aws_sdk" | "gcp" | "external_process" | "copilot";

/**
 * Provider credential fields owned by Subpolar's setup flow. The native Pi
 * seam only consumes the fields it can represent in Pi's Credential union;
 * the remaining modes are rejected explicitly instead of being discarded.
 */
export interface SubpolarProviderCredential {
	readonly type?: SubpolarPiCredentialMode;
	readonly mode?: SubpolarPiCredentialMode;
	readonly key?: string;
	readonly apiKey?: string;
	readonly env?: ProviderEnv;
	readonly access?: string;
	readonly accessToken?: string;
	readonly refresh?: string;
	readonly refreshToken?: string;
	readonly expires?: number;
	readonly expiresAt?: number;
	readonly copilotToken?: string;
	readonly accessKeyId?: string;
	readonly secretAccessKey?: string;
	readonly sessionToken?: string;
	readonly profile?: string;
	readonly projectId?: string;
	readonly clientEmail?: string;
	readonly privateKey?: string;
	readonly credentialsPath?: string;
	readonly executable?: string;
	readonly arguments?: readonly string[];
}

export type SubpolarPiCredentialErrorCode = "unsupported_credential_mode" | "invalid_credential";

export class SubpolarPiCredentialError extends Error {
	readonly code: SubpolarPiCredentialErrorCode;
	readonly providerId: string;
	readonly mode: string | undefined;

	constructor(code: SubpolarPiCredentialErrorCode, providerId: string, mode?: string, detail?: string) {
		super(detail ?? (code === "unsupported_credential_mode"
			? `Credential mode ${mode ?? "unknown"} is not supported by native Pi for ${providerId}`
			: `Credential for ${providerId} is invalid`));
		this.name = "SubpolarPiCredentialError";
		this.code = code;
		this.providerId = providerId;
		this.mode = mode;
	}
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function providerEnv(value: unknown): ProviderEnv | undefined {
	if (!record(value)) return undefined;
	const entries = Object.entries(value);
	if (!entries.every(([key, item]) => key.length > 0 && typeof item === "string" && item.length > 0)) return undefined;
	return Object.fromEntries(entries) as ProviderEnv;
}

function invalid(providerId: string, detail: string): never {
	throw new SubpolarPiCredentialError("invalid_credential", providerId, undefined, detail);
}

function unsupported(providerId: string, mode: string, detail?: string): never {
	throw new SubpolarPiCredentialError("unsupported_credential_mode", providerId, mode, detail);
}

/**
 * Convert a Subpolar-owned provider credential into Pi's canonical shape.
 *
 * This function intentionally accepts `unknown`: older setup records contain
 * provider-specific fields that are not part of Pi's Credential type. Such
 * records must either be mapped deliberately or produce a stable error.
 */
export function toSubpolarPiCredential(providerId: string, value: unknown): Credential | undefined {
	if (value === undefined) return undefined;
	if (!record(value)) invalid(providerId, "Credential must be an object");

	const mode = typeof value.type === "string" ? value.type : typeof value.mode === "string" ? value.mode : undefined;
	if (mode === "api_key" && (value.key !== undefined || value.apiKey !== undefined || value.env !== undefined)) {
		const key = value.key ?? value.apiKey;
		if (key !== undefined && typeof key !== "string") invalid(providerId, "API key credential key must be a string");
		const env = value.env === undefined ? undefined : providerEnv(value.env);
		if (value.env !== undefined && env === undefined) invalid(providerId, "API key credential environment is invalid");
		return { type: "api_key", ...(key === undefined ? {} : { key: key as string }), ...(env === undefined ? {} : { env }) };
	}

	const access = value.access ?? value.accessToken;
	const refresh = value.refresh ?? value.refreshToken;
	const expires = value.expires ?? value.expiresAt;
	if (mode === "oauth" || (mode === undefined && value.type === "oauth")) {
		if (typeof access !== "string" || access.length === 0 || typeof refresh !== "string" || refresh.length === 0 || typeof expires !== "number" || !Number.isFinite(expires)) {
			invalid(providerId, "OAuth credential requires access, refresh, and finite expires values");
		}
		return { type: "oauth", access, refresh, expires };
	}

	if (mode === "copilot" || value.copilotToken !== undefined) {
		const token = nonEmptyString(value.copilotToken) ?? nonEmptyString(access);
		if (token === undefined) invalid(providerId, "Copilot credential token is missing");
		// Pi's Copilot provider accepts the exchanged token through its API-key
		// auth path. This is deliberate; it avoids pretending a short-lived
		// Copilot token is refreshable OAuth.
		return { type: "api_key", key: token };
	}

	if (mode === "aws_sdk" || value.accessKeyId !== undefined || value.secretAccessKey !== undefined || value.profile !== undefined) {
		const apiKey = nonEmptyString(value.apiKey);
		if (apiKey !== undefined && apiKey !== "env") return { type: "api_key", key: apiKey };
		const credentialEnv = record(value.env) ? value.env : undefined;
		const region = credentialEnv === undefined ? undefined : nonEmptyString(credentialEnv.AWS_REGION);
		const env: ProviderEnv = {
			...(nonEmptyString(value.profile) === undefined ? {} : { AWS_PROFILE: value.profile as string }),
			...(region === undefined ? {} : { AWS_REGION: region }),
		};
		if (Object.keys(env).length > 0 && value.accessKeyId === undefined && value.secretAccessKey === undefined) return { type: "api_key", env };
		unsupported(providerId, "aws_sdk", "AWS access-key credentials require the Subpolar AWS runtime adapter");
	}

	if (mode === "gcp" || value.clientEmail !== undefined || value.privateKey !== undefined || value.credentialsPath !== undefined) {
		const apiKey = nonEmptyString(value.apiKey);
		if (apiKey !== undefined) return { type: "api_key", key: apiKey };
		unsupported(providerId, "gcp", "GCP service-account credentials require the Subpolar GCP runtime adapter");
	}

	if (mode === "external_process" || value.executable !== undefined || value.arguments !== undefined) {
		unsupported(providerId, "external_process", "External-process credentials require the Subpolar process provider");
	}

	if (mode !== undefined) unsupported(providerId, mode);
	if (value.type === "api_key") {
		const key = value.key;
		if (key !== undefined && typeof key !== "string") invalid(providerId, "API key credential key must be a string");
		return { type: "api_key", ...(key === undefined ? {} : { key }) };
	}
	if (value.type === "oauth") invalid(providerId, "OAuth credential is incomplete");
	invalid(providerId, "Credential mode is missing");
}

/** Application-owned credential operations used by Pi's model runtime. */
export interface SubpolarCredentialBackend {
	read(providerId: string): Promise<Credential | undefined>;
	list(): Promise<readonly CredentialInfo[]>;
	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined>;
	delete(providerId: string): Promise<void>;
}

/**
 * CredentialStore implementation that makes persistence an explicit Subpolar
 * dependency. It has no filesystem fallback and therefore cannot silently
 * create ~/.pi/agent/auth.json on a server.
 */
export class SubpolarPiCredentialStore implements CredentialStore {
	constructor(
		private readonly backend: SubpolarCredentialBackend,
		private readonly options: { readonly providerId?: string } = {},
	) {}

	async read(providerId: string): Promise<Credential | undefined> {
		if (this.options.providerId !== undefined && this.options.providerId !== providerId) return undefined;
		return toSubpolarPiCredential(providerId, await this.backend.read(providerId));
	}

	async list(): Promise<readonly CredentialInfo[]> {
		const entries = await this.backend.list();
		return entries
			.filter(entry => this.options.providerId === undefined || entry.providerId === this.options.providerId)
			.map(entry => ({ providerId: entry.providerId, type: entry.type }));
	}

	async modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		if (this.options.providerId !== undefined && this.options.providerId !== providerId) return fn(undefined);
		const result = await this.backend.modify(providerId, async current => {
			const normalized = toSubpolarPiCredential(providerId, current);
			const next = await fn(normalized);
			return toSubpolarPiCredential(providerId, next);
		});
		return toSubpolarPiCredential(providerId, result);
	}

	delete(providerId: string): Promise<void> {
		if (this.options.providerId !== undefined && this.options.providerId !== providerId) return Promise.resolve();
		return this.backend.delete(providerId);
	}
}
