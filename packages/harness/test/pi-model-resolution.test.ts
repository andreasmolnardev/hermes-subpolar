import { describe, expect, test } from "bun:test";
import {
	createSubpolarPiModelRuntime,
	HERMES_TO_PI_PROVIDER_ID,
	mapHermesProviderToPi,
	resolveSubpolarPiModel,
	SubpolarPiModelRuntimePool,
	SubpolarPiModelResolutionError,
} from "../src/index";
import {
	SubpolarPiCredentialError,
	SubpolarPiCredentialStore,
	toSubpolarPiCredential,
} from "../src/pi-credentials";

function credentials() {
	return {
		read: async () => undefined,
		list: async () => [],
		modify: async (_providerId: string, fn: (current: undefined) => Promise<undefined>) => fn(undefined),
		delete: async () => {},
	};
}

describe("native Pi model resolution", () => {
	test("uses explicit Hermes-to-Pi provider mappings", () => {
		expect(mapHermesProviderToPi("openai-api")).toBe("openai");
		expect(mapHermesProviderToPi("gemini")).toBe("google");
		expect(mapHermesProviderToPi("vertex-ai")).toBe("google-vertex");
		expect(mapHermesProviderToPi("copilot")).toBe("github-copilot");
		expect(mapHermesProviderToPi("bedrock")).toBe("amazon-bedrock");
		expect(mapHermesProviderToPi("unknown-provider")).toBeUndefined();
		expect(HERMES_TO_PI_PROVIDER_ID.custom).toBeNull();
	});

	test("maps API-key, OAuth, and Copilot credentials without exposing extra fields", () => {
		expect(toSubpolarPiCredential("openai-api", { type: "api_key", apiKey: "api-secret" })).toEqual({ type: "api_key", key: "api-secret" });
		expect(toSubpolarPiCredential("anthropic-oauth", { type: "oauth", accessToken: "access", refreshToken: "refresh", expiresAt: 123 })).toEqual({ type: "oauth", access: "access", refresh: "refresh", expires: 123 });
		expect(toSubpolarPiCredential("copilot", { mode: "copilot", copilotToken: "copilot-token", subject: "private" })).toEqual({ type: "api_key", key: "copilot-token" });
	});

	test("rejects non-API credential modes with stable errors instead of dropping them", () => {
		for (const [providerId, value, mode] of [
			["bedrock", { mode: "aws_sdk", accessKeyId: "access", secretAccessKey: "secret" }, "aws_sdk"],
			["vertex-ai", { mode: "gcp", clientEmail: "service@example.test", privateKey: "private" }, "gcp"],
			["custom", { mode: "external_process", executable: "/bin/provider", arguments: [] }, "external_process"],
		] as const) {
			expect(() => toSubpolarPiCredential(providerId, value)).toThrow(SubpolarPiCredentialError);
			try {
				toSubpolarPiCredential(providerId, value);
				throw new Error("expected credential mapping to fail");
			} catch (error) {
				expect(error).toMatchObject({ code: "unsupported_credential_mode", providerId, mode });
			}
		}
		expect(() => toSubpolarPiCredential("anthropic-oauth", { type: "oauth", accessToken: "access" })).toThrow("OAuth credential requires access, refresh, and finite expires values");
	});

	test("scopes credential reads, writes, and metadata to the resolved Pi provider", async () => {
		const calls: string[] = [];
		const store = new SubpolarPiCredentialStore({
			read: async providerId => { calls.push(`read:${providerId}`); return { type: "api_key", key: "secret" }; },
			list: async () => [{ providerId: "openai", type: "api_key" }, { providerId: "anthropic", type: "oauth" }],
			modify: async (providerId, fn) => { calls.push(`modify:${providerId}`); return fn({ type: "api_key", key: "secret" }); },
			delete: async providerId => { calls.push(`delete:${providerId}`); },
		}, { providerId: "openai" });

		expect(await store.read("anthropic")).toBeUndefined();
		expect(await store.read("openai")).toEqual({ type: "api_key", key: "secret" });
		expect(await store.list()).toEqual([{ providerId: "openai", type: "api_key" }]);
		expect(await store.modify("anthropic", async current => current)).toBeUndefined();
		expect(await store.modify("openai", async current => current)).toEqual({ type: "api_key", key: "secret" });
		await store.delete("anthropic");
		await store.delete("openai");
		expect(calls).toEqual(["read:openai", "modify:openai", "delete:openai"]);
	});

	test("resolves a catalog model through a Subpolar-backed ModelRuntime", async () => {
		const result = await resolveSubpolarPiModel({
			hermesProviderId: "OPENAI-API",
			modelId: "gpt-4.1-mini",
			credentials: credentials(),
		});

		expect(result.hermesProviderId).toBe("openai-api");
		expect(result.piProviderId).toBe("openai");
		expect(result.model.provider).toBe("openai");
		expect(result.model.id).toBe("gpt-4.1-mini");
	});

	test("creates a network-disabled runtime with the supplied credential backend", async () => {
		let reads = 0;
		const backend = {
			read: async () => {
				reads += 1;
				return { type: "api_key" as const, key: "test-key" };
			},
			list: async () => [],
			modify: async (_providerId: string, fn: (current: { type: "api_key"; key: string }) => Promise<unknown>) => fn({ type: "api_key", key: "test-key" }),
			delete: async () => {},
		};
		const runtime = await createSubpolarPiModelRuntime({ credentials: backend });

		expect(runtime.getModel("openai", "gpt-4.1-mini")).toBeDefined();
		await runtime.getAuth("openai");
		expect(reads).toBe(1);
	});

	test("reuses one provider catalog through the server-level runtime pool", async () => {
		const pool = new SubpolarPiModelRuntimePool(credentials());
		const [first, second] = await Promise.all([
			resolveSubpolarPiModel({ hermesProviderId: "openai-api", modelId: "gpt-4.1-mini", credentials: credentials(), runtimePool: pool }),
			resolveSubpolarPiModel({ hermesProviderId: "openai-api", modelId: "local-model", credentials: credentials(), runtimePool: pool }),
		]);

		expect(first.modelRuntime).toBe(second.modelRuntime);
		expect(second.model.id).toBe("local-model");
	});

	test("materializes configured model IDs and endpoints through the Pi provider seam", async () => {
		const result = await resolveSubpolarPiModel({
			hermesProviderId: "openai-api",
			modelId: "local-model",
			baseUrl: "https://local-provider.example/v1",
			credentials: credentials(),
		});

		expect(result.model.id).toBe("local-model");
		expect(result.model.provider).toBe("openai");
		expect(result.model.api).toBe("openai-completions");
		expect(result.model.baseUrl).toBe("https://local-provider.example/v1");
	});

	test("fails closed for unsupported providers while accepting configured model IDs", async () => {
		await expect(resolveSubpolarPiModel({ hermesProviderId: "custom", modelId: "gpt-4.1-mini", credentials: credentials() })).rejects.toMatchObject<Partial<SubpolarPiModelResolutionError>>({
			code: "unsupported_provider",
		});
		const configured = await resolveSubpolarPiModel({ hermesProviderId: "openai-api", modelId: "not-a-catalog-model", credentials: credentials() });
		expect(configured.model.id).toBe("not-a-catalog-model");
	});
});
