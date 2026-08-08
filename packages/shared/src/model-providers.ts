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
  | "gcp"
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

export type ProviderOAuthProfile = {
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
  readonly scopes?: readonly string[];
  readonly clientIdEnv: string;
  readonly clientSecretEnv?: string;
  readonly authorizationUrlEnv?: string;
  readonly tokenUrlEnv?: string;
  readonly deviceUrl?: string;
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
  readonly requiresCredential?: boolean;
  readonly baseUrl?: string;
  readonly modelsUrl?: string;
  readonly fallbackModels?: readonly string[];
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly credentialHeader?: "authorization" | "x-api-key" | "x-goog-api-key";
  readonly oauth?: ProviderOAuthProfile;
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
    description: "Grok Responses API",
    apiMode: "codex_responses",
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
    label: "Moonshot",
    description: "Moonshot Chat Completions",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.moonshot.ai/v1",
    fallbackModels: ["kimi-k2-0711-preview"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "kimi-coding",
    label: "Kimi for Coding",
    description: "Kimi Coding endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.kimi.com/coding/v1",
    fallbackModels: ["kimi-for-coding"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true }
  },
  {
    id: "kimi-coding-cn",
    label: "Kimi for Coding China",
    description: "Kimi Coding China endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.moonshot.cn/v1",
    fallbackModels: ["kimi-for-coding"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true }
  },
  {
    id: "ai-gateway",
    label: "Vercel AI Gateway",
    description: "Vercel AI Gateway models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    fallbackModels: ["openai/gpt-4.1-mini"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "novita",
    label: "NovitaAI",
    description: "Novita hosted open models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.novita.ai/openai",
    fallbackModels: ["meta-llama/llama-3.1-70b-instruct"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "zai",
    aliases: ["glm"],
    label: "Z.AI / GLM",
    description: "Z.AI GLM models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.z.ai/api/paas/v4",
    fallbackModels: ["glm-4.5"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true }
  },
  {
    id: "arcee",
    label: "Arcee AI",
    description: "Arcee hosted models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://inference.arcee.ai/v1",
    fallbackModels: ["arcee-ai/trinity-large-preview"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "gmi",
    aliases: ["gmi-cloud"],
    label: "GMI Cloud",
    description: "GMI Cloud inference",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.gmi-serving.com/v1",
    fallbackModels: ["meta-llama/llama-3.1-70b-instruct"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "actual-computer",
    label: "Actual Computer",
    description: "Local Actual Computer model service",
    apiMode: "chat_completions",
    authType: "api_key",
    requiresCredential: false,
    baseUrl: "http://127.0.0.1:8045/v1",
    fallbackModels: ["actual-computer"],
    capabilities: { toolCalling: true, vision: true }
  },
  {
    id: "minimax",
    label: "MiniMax",
    description: "MiniMax international endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.minimax.io/v1",
    fallbackModels: ["MiniMax-M1"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "minimax-cn",
    label: "MiniMax China",
    description: "MiniMax China endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.minimaxi.com/v1",
    fallbackModels: ["MiniMax-M1"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "minimax-oauth",
    label: "MiniMax OAuth",
    description: "MiniMax subscription OAuth",
    apiMode: "chat_completions",
    authType: "oauth",
    baseUrl: "https://api.minimax.io/v1",
    fallbackModels: ["MiniMax-M1"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "alibaba-dashscope",
    aliases: ["dashscope", "qwen"],
    label: "Alibaba / DashScope",
    description: "Alibaba DashScope compatible endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    fallbackModels: ["qwen-plus"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "alibaba-coding-plan",
    label: "Alibaba Coding Plan",
    description: "Alibaba Coding Plan endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
    fallbackModels: ["qwen3-coder-plus"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true }
  },
  {
    id: "kilo-code",
    label: "Kilo Code",
    description: "Kilo Code gateway",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.kilo.ai/api/gateway/v1",
    fallbackModels: ["kilo/auto"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "xiaomi-mimo",
    label: "Xiaomi MiMo",
    description: "Xiaomi MiMo models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.xiaomimimo.com/v1",
    fallbackModels: ["mimo-v2-flash"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true }
  },
  {
    id: "tencent-tokenhub",
    label: "Tencent TokenHub",
    description: "Tencent TokenHub gateway",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.token-ai.cn/v1",
    fallbackModels: ["hunyuan-turbos-latest"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "opencode-zen",
    label: "OpenCode Zen",
    description: "OpenCode Zen models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://opencode.ai/zen/v1",
    fallbackModels: ["opencode/gpt-5"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    description: "OpenCode Go models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://opencode.ai/zen/go/v1",
    fallbackModels: ["opencode-go/auto"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    description: "Hugging Face routed inference",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://router.huggingface.co/v1",
    fallbackModels: ["meta-llama/Llama-3.3-70B-Instruct"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini OpenAI-compatible endpoint",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    credentialHeader: "x-goog-api-key",
    fallbackModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    capabilities: OPENAI_CAPABILITIES,
    request: { reasoningMode: "gemini_thinking" }
  },
  {
    id: "vertex-ai",
    label: "Google Vertex AI",
    description: "Vertex AI OpenAI-compatible endpoint; configure the project endpoint",
    apiMode: "chat_completions",
    authType: "gcp",
    baseUrl: "https://us-central1-aiplatform.googleapis.com/v1",
    fallbackModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    description: "Ollama hosted models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://ollama.com/v1",
    fallbackModels: ["qwen3:32b"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "stepfun",
    label: "StepFun",
    description: "StepFun models",
    apiMode: "chat_completions",
    authType: "api_key",
    baseUrl: "https://api.stepfun.com/v1",
    fallbackModels: ["step-3.5-flash"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "lm-studio",
    aliases: ["lmstudio"],
    label: "LM Studio",
    description: "Local LM Studio server",
    apiMode: "chat_completions",
    authType: "api_key",
    requiresCredential: false,
    baseUrl: "http://127.0.0.1:1234/v1",
    fallbackModels: ["local-model"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Native Anthropic Messages API",
    apiMode: "anthropic_messages",
    authType: "api_key",
    baseUrl: "https://api.anthropic.com",
    credentialHeader: "x-api-key",
    fallbackModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
    capabilities: { vision: true, toolCalling: true, reasoning: true },
    request: { promptCacheMode: "anthropic" }
  },
  {
    id: "anthropic-oauth",
    label: "Anthropic Claude OAuth",
    description: "Claude subscription OAuth credentials",
    apiMode: "anthropic_messages",
    authType: "oauth",
    baseUrl: "https://api.anthropic.com",
    credentialHeader: "authorization",
    fallbackModels: ["claude-sonnet-4-20250514"],
    capabilities: { vision: true, toolCalling: true, reasoning: true },
    request: { promptCacheMode: "anthropic" },
    oauth: { clientIdEnv: "SUBPOLAR_ANTHROPIC_OAUTH_CLIENT_ID", authorizationUrlEnv: "SUBPOLAR_ANTHROPIC_OAUTH_AUTH_URL", tokenUrlEnv: "SUBPOLAR_ANTHROPIC_OAUTH_TOKEN_URL" }
  },
  {
    id: "nous-portal",
    label: "Nous Portal",
    description: "Nous subscription OAuth",
    apiMode: "chat_completions",
    authType: "oauth",
    baseUrl: "https://inference-api.nousresearch.com/v1",
    fallbackModels: ["Hermes-4-70B"],
    capabilities: OPENAI_CAPABILITIES,
    oauth: { clientIdEnv: "SUBPOLAR_NOUS_OAUTH_CLIENT_ID", authorizationUrlEnv: "SUBPOLAR_NOUS_OAUTH_AUTH_URL", tokenUrlEnv: "SUBPOLAR_NOUS_OAUTH_TOKEN_URL" }
  },
  {
    id: "qwen-oauth",
    label: "Qwen OAuth",
    description: "Qwen subscription OAuth",
    apiMode: "chat_completions",
    authType: "oauth",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    fallbackModels: ["qwen3-coder-plus"],
    capabilities: OPENAI_CAPABILITIES,
    request: { omitTemperature: true },
    oauth: { clientIdEnv: "SUBPOLAR_QWEN_OAUTH_CLIENT_ID", authorizationUrlEnv: "SUBPOLAR_QWEN_OAUTH_AUTH_URL", tokenUrlEnv: "SUBPOLAR_QWEN_OAUTH_TOKEN_URL" }
  },
  {
    id: "xai-oauth",
    label: "xAI OAuth",
    description: "xAI subscription OAuth",
    apiMode: "codex_responses",
    authType: "oauth",
    baseUrl: "https://api.x.ai/v1",
    fallbackModels: ["grok-4-1-fast-reasoning"],
    capabilities: OPENAI_CAPABILITIES,
    oauth: { clientIdEnv: "SUBPOLAR_XAI_OAUTH_CLIENT_ID", authorizationUrlEnv: "SUBPOLAR_XAI_OAUTH_AUTH_URL", tokenUrlEnv: "SUBPOLAR_XAI_OAUTH_TOKEN_URL" }
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    description: "GitHub Copilot token exchange",
    apiMode: "chat_completions",
    authType: "copilot",
    baseUrl: "https://api.githubcopilot.com",
    fallbackModels: ["gpt-4o"],
    capabilities: OPENAI_CAPABILITIES,
    oauth: { clientIdEnv: "SUBPOLAR_COPILOT_CLIENT_ID", tokenUrl: "https://github.com/login/oauth/access_token", deviceUrl: "https://github.com/login/device/code", scopes: ["read:user"] }
  },
  {
    id: "copilot-acp",
    label: "GitHub Copilot ACP",
    description: "GitHub Copilot ACP stdio integration",
    apiMode: "chat_completions",
    authType: "external_process",
    baseUrl: "http://127.0.0.1",
    fallbackModels: ["copilot"],
    capabilities: { toolCalling: true }
  },
  {
    id: "relay",
    label: "Provider Relay",
    description: "Server-configured provider relay process",
    apiMode: "chat_completions",
    authType: "external_process",
    baseUrl: "http://127.0.0.1",
    fallbackModels: ["relay"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "moa",
    label: "Mixture of Agents",
    description: "Server-configured mixture-of-agents process",
    apiMode: "chat_completions",
    authType: "external_process",
    baseUrl: "http://127.0.0.1",
    fallbackModels: ["moa"],
    capabilities: { toolCalling: true, reasoning: true }
  },
  {
    id: "openai-responses",
    aliases: ["codex-responses"],
    label: "OpenAI Responses",
    description: "OpenAI Responses API transport",
    apiMode: "codex_responses",
    authType: "api_key",
    baseUrl: "https://api.openai.com/v1",
    fallbackModels: ["gpt-5", "gpt-4.1"],
    capabilities: OPENAI_CAPABILITIES
  },
  {
    id: "openai-codex",
    label: "OpenAI Codex",
    description: "OpenAI Responses API using ChatGPT OAuth",
    apiMode: "codex_responses",
    authType: "oauth",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    defaultHeaders: { originator: "codex_cli_rs" },
    fallbackModels: ["gpt-5-codex", "o4-mini"],
    capabilities: OPENAI_CAPABILITIES,
    oauth: { authorizationUrl: "https://auth.openai.com/oauth/authorize", tokenUrl: "https://auth.openai.com/oauth/token", scopes: ["openid", "profile", "email", "offline_access"], clientIdEnv: "SUBPOLAR_OPENAI_CODEX_CLIENT_ID" }
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
