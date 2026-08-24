import type { Model, Api } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { SubpolarPiCredentialStore, type SubpolarCredentialBackend } from "./pi-credentials";

/**
 * Provider IDs supported by this bounded native Pi seam.
 *
 * The null entries are intentional: a Hermes provider must be listed here
 * before it can use native Pi resolution. Unknown IDs and explicitly
 * unsupported IDs never fall through to a same-name provider.
 */
export const HERMES_TO_PI_PROVIDER_ID = {
	"openai-api": "openai",
	openrouter: "openrouter",
	deepseek: "deepseek",
	xai: "xai",
	nvidia: "nvidia",
	fireworks: "fireworks",
	groq: "groq",
	together: "together",
	mistral: "mistral",
	moonshot: "moonshotai",
	"kimi-coding": "kimi-coding",
	"kimi-coding-cn": null,
	"ai-gateway": null,
	novita: null,
	zai: "zai",
	arcee: null,
	gmi: null,
	"actual-computer": null,
	minimax: "minimax",
	"minimax-cn": "minimax-cn",
	"minimax-oauth": null,
	"alibaba-dashscope": null,
	"alibaba-coding-plan": null,
	"kilo-code": null,
	"xiaomi-mimo": "xiaomi",
	"tencent-tokenhub": null,
	"opencode-zen": "opencode",
	"opencode-go": "opencode-go",
	huggingface: "huggingface",
	gemini: "google",
	"vertex-ai": "google-vertex",
	"ollama-cloud": null,
	stepfun: null,
	"lm-studio": null,
	anthropic: "anthropic",
	"anthropic-oauth": "anthropic",
	"nous-portal": null,
	"qwen-oauth": null,
	"xai-oauth": null,
	copilot: "github-copilot",
	"copilot-acp": null,
	relay: null,
	moa: null,
	"openai-responses": "openai",
	"openai-codex": "openai-codex",
	bedrock: "amazon-bedrock",
	custom: null,
} as const satisfies Readonly<Record<string, string | null>>;

export type SubpolarPiModelResolutionErrorCode = "unsupported_provider" | "model_not_found";

export class SubpolarPiModelResolutionError extends Error {
	readonly code: SubpolarPiModelResolutionErrorCode;
	readonly hermesProviderId: string;
	readonly piProviderId: string | undefined;
	readonly modelId: string;

	constructor(
		code: SubpolarPiModelResolutionErrorCode,
		hermesProviderId: string,
		modelId: string,
		piProviderId?: string,
	) {
		const message = code === "unsupported_provider"
			? `Hermes provider ${hermesProviderId} has no native Pi provider mapping`
			: `Pi model ${piProviderId ?? hermesProviderId}/${modelId} was not found`;
		super(message);
		this.name = "SubpolarPiModelResolutionError";
		this.code = code;
		this.hermesProviderId = hermesProviderId;
		this.piProviderId = piProviderId;
		this.modelId = modelId;
	}
}

export interface CreateSubpolarPiModelRuntimeOptions {
	readonly credentials: SubpolarCredentialBackend;
	readonly providerId?: string;
	readonly signal?: AbortSignal;
}

export interface ResolveSubpolarPiModelOptions extends CreateSubpolarPiModelRuntimeOptions {
	readonly hermesProviderId: string;
	readonly modelId: string;
	readonly baseUrl?: string;
}

export interface SubpolarPiModelResolution {
	readonly model: Model<Api>;
	readonly modelRuntime: ModelRuntime;
	readonly hermesProviderId: string;
	readonly piProviderId: string;
}

const HERMES_NATIVE_API: Readonly<Record<string, Api>> = {
	"openai-api": "openai-completions",
};

function modelDefinition(
	model: Model<Api>,
	modelId: string,
	baseUrl: string | undefined,
	api: Api | undefined,
): NonNullable<Parameters<ModelRuntime["registerProvider"]>[1]["models"]>[number] {
	return {
		id: modelId,
		name: modelId,
		api: api ?? model.api,
		baseUrl: baseUrl ?? model.baseUrl,
		reasoning: model.reasoning,
		...(model.thinkingLevelMap === undefined ? {} : { thinkingLevelMap: model.thinkingLevelMap }),
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		...(model.samplingParams === undefined ? {} : { samplingParams: model.samplingParams }),
		...(model.compat === undefined ? {} : { compat: model.compat }),
	};
}

function resolveConfiguredModel(
	runtime: ModelRuntime,
	providerId: string,
	modelId: string,
	baseUrl: string | undefined,
	api: Api | undefined,
): Model<Api> | undefined {
	const current = runtime.getModel(providerId, modelId);
	const provider = runtime.getProvider(providerId);
	if (provider === undefined) return current;
	const endpoint = baseUrl?.trim() || undefined;
	if (current !== undefined && endpoint === undefined && api === undefined) return current;
	const template = current ?? provider.getModels()[0];
	if (template === undefined) return undefined;
	const definition = modelDefinition(template, modelId, endpoint, api);
	runtime.registerProvider(providerId, {
		models: [definition],
	});
	return runtime.getModel(providerId, modelId);
}

/** Resolve the explicit Hermes provider mapping without same-name fallback. */
export function mapHermesProviderToPi(hermesProviderId: string): string | undefined {
	const normalized = hermesProviderId.trim().toLowerCase();
	const mapped = (HERMES_TO_PI_PROVIDER_ID as Readonly<Record<string, string | null>>)[normalized];
	return mapped ?? undefined;
}

/**
 * Create a network-disabled Pi model runtime backed only by Subpolar's
 * credential store. No Pi auth file or model catalog is consulted.
 */
export function createSubpolarPiModelRuntime(
	options: CreateSubpolarPiModelRuntimeOptions,
): Promise<ModelRuntime> {
	return ModelRuntime.create({
		credentials: new SubpolarPiCredentialStore(options.credentials, options.providerId === undefined ? {} : { providerId: options.providerId }),
		modelsPath: null,
		allowModelNetwork: false,
		refreshOnCreate: false,
		...(options.signal ? { signal: options.signal } : {}),
	});
}

/** Resolve a native Pi catalog model for a Hermes provider/model pair. */
export async function resolveSubpolarPiModel(
	options: ResolveSubpolarPiModelOptions,
): Promise<SubpolarPiModelResolution> {
	const hermesProviderId = options.hermesProviderId.trim().toLowerCase();
	const piProviderId = mapHermesProviderToPi(hermesProviderId);
	if (!piProviderId) {
		throw new SubpolarPiModelResolutionError("unsupported_provider", hermesProviderId, options.modelId);
	}

	const modelRuntime = await createSubpolarPiModelRuntime({ ...options, providerId: piProviderId });
	const model = resolveConfiguredModel(modelRuntime, piProviderId, options.modelId, options.baseUrl, HERMES_NATIVE_API[hermesProviderId]);
	if (!model) {
		throw new SubpolarPiModelResolutionError("model_not_found", hermesProviderId, options.modelId, piProviderId);
	}
	return { model, modelRuntime, hermesProviderId, piProviderId };
}
