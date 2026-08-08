/**
 * Provider catalog shared by setup and provider settings.
 *
 * This is metadata only; credentials never live in browser code.
 */
export type ModelProviderAuthType = "api_key";

export type ModelProviderSlug = "openai-api";

export type ModelProviderDefinition = {
  readonly slug: ModelProviderSlug;
  readonly label: string;
  readonly description: string;
  readonly authType: ModelProviderAuthType;
  readonly baseUrl?: string;
};

export const MODEL_PROVIDER_CATALOG: readonly ModelProviderDefinition[] = [
  { slug: "openai-api", label: "OpenAI-compatible", description: "OpenAI-compatible chat completions", authType: "api_key", baseUrl: "https://api.openai.com/v1" },
] as const;

export function modelProvider(slug: string): ModelProviderDefinition | undefined {
  return MODEL_PROVIDER_CATALOG.find((provider) => provider.slug === slug);
}
