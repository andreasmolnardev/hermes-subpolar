import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

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
	constructor(private readonly backend: SubpolarCredentialBackend) {}

	read(providerId: string): Promise<Credential | undefined> {
		return this.backend.read(providerId);
	}

	list(): Promise<readonly CredentialInfo[]> {
		return this.backend.list();
	}

	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		return this.backend.modify(providerId, fn);
	}

	delete(providerId: string): Promise<void> {
		return this.backend.delete(providerId);
	}
}
