import { describe, expect, test } from "bun:test";
import {
	createSubpolarPiModelRuntime,
	HERMES_TO_PI_PROVIDER_ID,
	mapHermesProviderToPi,
	resolveSubpolarPiModel,
	SubpolarPiModelResolutionError,
} from "../src/index";

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

	test("fails closed for unsupported providers and missing models", async () => {
		await expect(resolveSubpolarPiModel({ hermesProviderId: "custom", modelId: "gpt-4.1-mini", credentials: credentials() })).rejects.toMatchObject<Partial<SubpolarPiModelResolutionError>>({
			code: "unsupported_provider",
		});
		await expect(resolveSubpolarPiModel({ hermesProviderId: "openai-api", modelId: "not-a-catalog-model", credentials: credentials() })).rejects.toMatchObject<Partial<SubpolarPiModelResolutionError>>({
			code: "model_not_found",
			piProviderId: "openai",
		});
	});
});
