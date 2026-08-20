/**
 * Provider catalog shared by setup and provider settings.
 *
 * Keep membership aligned with providers implemented by this runtime. This is
 * metadata only; credentials never live in browser code.
 */
export type ModelProviderAuthType = "api_key";

export type ModelProviderDefinition = {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly authType: ModelProviderAuthType;
  readonly baseUrl?: string;
};

export const MODEL_PROVIDER_CATALOG: readonly ModelProviderDefinition[] = [
  { slug: "openai-api", label: "OpenAI API", description: "OpenAI API", authType: "api_key", baseUrl: "https://api.openai.com/v1" },
] as const;

export function modelProvider(slug: string): ModelProviderDefinition | undefined {
  return MODEL_PROVIDER_CATALOG.find((provider) => provider.slug === slug);
}
