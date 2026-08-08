/**
 * Browser-safe provider profiles. Credentials and provider-specific runtime
 * code never belong in this catalog.
 */
export type ProviderApiMode =
  | "chat_completions"
  | "anthropic_messages"
  | "codex_responses"
  | "bedrock_converse";

export type ProviderAuthType =
  | "api_key"
  | "oauth"
  | "copilot"
  | "aws_sdk"
  | "external_process";

/** Compatibility name for callers that only need the auth discriminator. */
export type ModelProviderAuthType = ProviderAuthType;

export type ProviderRequestBehavior = {
  readonly fixedTemperature?: number;
  readonly omitTemperature?: boolean;
  readonly defaultMaxTokens?: number;
  readonly extraBody?: Readonly<Record<string, ProviderJsonValue>>;
  readonly reasoningMode?: "reasoning_effort" | "openrouter_reasoning" | "gemini_thinking";
  readonly promptCacheMode?: "none" | "openai" | "anthropic";
};

export type ProviderCapabilities = {
  readonly vision?: boolean;
  readonly toolCalling?: boolean;
  readonly reasoning?: boolean;
};

export type ProviderJsonPrimitive = string | number | boolean | null;
export type ProviderJsonValue =
  | ProviderJsonPrimitive
  | readonly ProviderJsonValue[]
  | { readonly [key: string]: ProviderJsonValue };

export type ProviderProfile = {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly label: string;
  readonly description: string;
  readonly signupUrl?: string;
  readonly apiMode: ProviderApiMode;
  readonly authType: ProviderAuthType;
  readonly baseUrl?: string;
  readonly modelsUrl?: string;
  readonly fallbackModels?: readonly string[];
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly capabilities?: ProviderCapabilities;
  readonly request?: ProviderRequestBehavior;
};

export type ModelProviderDefinition = ProviderProfile;

const OPENAI_CAPABILITIES = { vision: true, toolCalling: true, reasoning: true } as const;
const CHAT_FALLBACKS = ["gpt-4.1-mini"] as const;

/** Shared provider registry consumed by setup, settings, and runtime lookup. */
export const MODEL_PROVIDER_CATALOG: readonly ProviderProfile[] = [
  {
    id: "openai-api",
    aliases: ["openai"],
    label: "OpenAI",
    description: "OpenAI Chat Completions",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.openai.com/v1",
    fallbackModels: CHAT_FALLBACKS,
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Unified access to hosted open and commercial models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://openrouter.ai/api/v1",
    fallbackModels: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4"],
    capabilities: OPENAI_CAPABILITIES,
    request: { reasoningMode: "openrouter_reasoning" }
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek Chat Completions",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.deepseek.com/v1",
    fallbackModels: ["deepseek-chat", "deepseek-reasoner"],
    capabilities: { toolCalling: true, reasoning: true }
  },
  {
    id: "xai",
    aliases: ["xai-api"],
    label: "xAI",
    description: "Grok Chat Completions",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.x.ai/v1",
    fallbackModels: ["grok-4-1-fast-reasoning", "grok-3-mini"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    description: "NVIDIA-hosted OpenAI-compatible models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    fallbackModels: ["meta/llama-3.3-70b-instruct"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    description: "Fireworks hosted inference",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    fallbackModels: ["accounts/fireworks/models/llama-v3p1-70b-instruct"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "groq",
    label: "Groq",
    description: "Fast hosted inference",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.groq.com/openai/v1",
    fallbackModels: ["llama-3.3-70b-versatile"],
    capabilities: { toolCalling: true, reasoning: true }
  },
  {
    id: "together",
    label: "Together AI",
    description: "Together hosted open models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.together.xyz/v1",
    fallbackModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "mistral",
    label: "Mistral AI",
    description: "Mistral native OpenAI-compatible endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.mistral.ai/v1",
    fallbackModels: ["mistral-large-latest", "codestral-latest"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "perplexity",
    label: "Perplexity",
    description: "Perplexity online models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.perplexity.ai",
    fallbackModels: ["sonar-pro"],
    capabilities: { toolCalling: true, reasoning: true }
  },
  {
    id: "moonshot",
    aliases: ["kimi"],
    label: "Moonshot / Kimi",
    description: "Kimi Chat Completions",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.moonshot.ai/v1",
    fallbackModels: ["kimi-k2-0711-preview"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Native Anthropic Messages API",
    apiMode: "anthropic_messages",
    authType: "api_key",
    baseUrl: "https://api.anthropic.com",
    fallbackModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
    capabilities: { vision: true, toolCalling: true, reasoning: true },
    request: { promptCacheMode: "anthropic" }
  },
  {
    id: "openai-responses",
    aliases: ["openai-codex", "codex-responses"],
    label: "OpenAI Responses",
    description: "OpenAI Responses API transport",
    apiMode: "codex_responses",
    authType: "api_key",
    baseUrl: "https://api.openai.com/v1",
    fallbackModels: ["gpt-5", "gpt-4.1"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "bedrock",
    label: "Amazon Bedrock",
    description: "AWS Bedrock Converse API using server-side AWS credentials",
    apiMode: "bedrock_converse",
    authType: "aws_sdk",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    fallbackModels: ["anthropic.claude-3-5-sonnet-20241022-v2:0"],
    capabilities: { vision: true, toolCalling: true, reasoning: true }
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    description: "A self-hosted or third-party Chat Completions endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    fallbackModels: CHAT_FALLBACKS,
    capabilities: OPENAI_CAPABILITIES
  }
] as const;

export function modelProvider(idOrAlias: string): ProviderProfile | undefined {
  const normalized = idOrAlias.trim().toLowerCase();

  return MODEL_PROVIDER_CATALOG.find((provider) =>
    provider.id === normalized || provider.aliases?.includes(normalized)
  );
}
