/**
 * Provider catalog shared by setup and provider settings.
 *
 * Keep membership aligned with Hermes' canonical model-provider list. This is
 * metadata only; credentials never live in browser code.
 */
export type ModelProviderAuthType =
  | "api_key"
  | "oauth"
  | "external_process"
  | "virtual";

export type ModelProviderDefinition = {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly authType: ModelProviderAuthType;
  readonly baseUrl?: string;
};

export const MODEL_PROVIDER_CATALOG: readonly ModelProviderDefinition[] = [
  { slug: "nous", label: "Nous Portal", description: "Nous Portal", authType: "oauth", baseUrl: "https://inference-api.nousresearch.com/v1" },
  { slug: "fireworks", label: "Fireworks AI", description: "Fireworks AI", authType: "api_key", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { slug: "openrouter", label: "OpenRouter", description: "OpenRouter", authType: "api_key", baseUrl: "https://openrouter.ai/api/v1" },
  { slug: "moa", label: "Mixture of Agents", description: "Mixture of Agents", authType: "virtual" },
  { slug: "novita", label: "NovitaAI", description: "NovitaAI", authType: "api_key", baseUrl: "https://api.novita.ai/openai/v1" },
  { slug: "lmstudio", label: "LM Studio", description: "LM Studio", authType: "api_key", baseUrl: "http://127.0.0.1:1234/v1" },
  { slug: "anthropic", label: "Anthropic", description: "Anthropic", authType: "api_key", baseUrl: "https://api.anthropic.com" },
  { slug: "openai-codex", label: "OpenAI Codex", description: "OpenAI Codex", authType: "oauth", baseUrl: "https://chatgpt.com/backend-api/codex" },
  { slug: "openai-api", label: "OpenAI API", description: "OpenAI API", authType: "api_key", baseUrl: "https://api.openai.com/v1" },
  { slug: "alibaba", label: "Qwen Cloud", description: "Qwen Cloud / DashScope", authType: "api_key", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { slug: "xai-oauth", label: "xAI Grok OAuth", description: "xAI Grok OAuth", authType: "oauth" },
  { slug: "xiaomi", label: "Xiaomi MiMo", description: "Xiaomi MiMo", authType: "api_key", baseUrl: "https://api.xiaomimimo.com/v1" },
  { slug: "tencent-tokenhub", label: "Tencent TokenHub", description: "Tencent TokenHub", authType: "api_key", baseUrl: "https://tokenhub.tencentmaas.com/v1" },
  { slug: "nvidia", label: "NVIDIA NIM", description: "NVIDIA NIM", authType: "api_key", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { slug: "copilot", label: "GitHub Copilot", description: "GitHub Copilot", authType: "api_key", baseUrl: "https://api.githubcopilot.com" },
  { slug: "copilot-acp", label: "GitHub Copilot ACP", description: "GitHub Copilot ACP", authType: "external_process" },
  { slug: "huggingface", label: "Hugging Face", description: "Hugging Face Inference Providers", authType: "api_key", baseUrl: "https://router.huggingface.co/v1" },
  { slug: "gemini", label: "Google AI Studio", description: "Google AI Studio", authType: "api_key", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { slug: "vertex", label: "Google Vertex AI", description: "Google Vertex AI", authType: "oauth", baseUrl: "https://aiplatform.googleapis.com" },
  { slug: "deepseek", label: "DeepSeek", description: "DeepSeek", authType: "api_key", baseUrl: "https://api.deepseek.com/v1" },
  { slug: "xai", label: "xAI", description: "xAI Grok", authType: "api_key", baseUrl: "https://api.x.ai/v1" },
  { slug: "zai", label: "Z.AI / GLM", description: "Z.AI / GLM", authType: "api_key", baseUrl: "https://api.z.ai/api/paas/v4" },
  { slug: "kimi-coding", label: "Kimi / Kimi Coding Plan", description: "Kimi Coding Plan", authType: "api_key", baseUrl: "https://api.moonshot.ai/v1" },
  { slug: "kimi-coding-cn", label: "Kimi / Moonshot (China)", description: "Kimi / Moonshot China", authType: "api_key", baseUrl: "https://api.moonshot.cn/v1" },
  { slug: "stepfun", label: "StepFun Step Plan", description: "StepFun Step Plan", authType: "api_key", baseUrl: "https://api.stepfun.com/v1" },
  { slug: "minimax", label: "MiniMax", description: "MiniMax", authType: "api_key", baseUrl: "https://api.minimax.io/v1" },
  { slug: "minimax-oauth", label: "MiniMax (OAuth)", description: "MiniMax OAuth", authType: "oauth", baseUrl: "https://api.minimax.io/v1" },
  { slug: "minimax-cn", label: "MiniMax (China)", description: "MiniMax China", authType: "api_key", baseUrl: "https://api.minimaxi.com/v1" },
  { slug: "ollama-cloud", label: "Ollama Cloud", description: "Ollama Cloud", authType: "api_key", baseUrl: "https://ollama.com/v1" },
  { slug: "arcee", label: "Arcee AI", description: "Arcee AI", authType: "api_key", baseUrl: "https://api.arcee.ai/api/v1" },
  { slug: "gmi", label: "GMI Cloud", description: "GMI Cloud", authType: "api_key", baseUrl: "https://api.gmi-serving.com/v1" },
  { slug: "kilocode", label: "Kilo Code", description: "Kilo Code", authType: "api_key", baseUrl: "https://api.kilo.ai/api/gateway" },
  { slug: "opencode-zen", label: "OpenCode Zen", description: "OpenCode Zen", authType: "api_key", baseUrl: "https://opencode.ai/zen/v1" },
  { slug: "opencode-go", label: "OpenCode Go", description: "OpenCode Go", authType: "api_key", baseUrl: "https://opencode.ai/zen/go/v1" },
  { slug: "bedrock", label: "AWS Bedrock", description: "AWS Bedrock", authType: "api_key", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com" },
  { slug: "azure-foundry", label: "Azure Foundry", description: "Azure Foundry", authType: "api_key" },
  { slug: "ai-gateway", label: "Vercel AI Gateway", description: "Vercel AI Gateway", authType: "api_key", baseUrl: "https://ai-gateway.vercel.sh/v1" },
  { slug: "qwen-oauth", label: "Qwen OAuth (Portal)", description: "Qwen OAuth", authType: "oauth", baseUrl: "https://portal.qwen.ai/v1" },
] as const;

export function modelProvider(slug: string): ModelProviderDefinition | undefined {
  return MODEL_PROVIDER_CATALOG.find((provider) => provider.slug === slug);
}
