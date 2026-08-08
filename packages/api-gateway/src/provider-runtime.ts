import { createHash, createHmac } from "node:crypto";
import {
  createAnthropicProvider,
  createBedrockConverseProvider,
  createOpenAICompatibleProvider,
  createResponsesProvider,
  type ChatProvider,
  type ProviderModelOptions,
  type ProviderRequest
} from "chat-provider-interface";
import {
  MODEL_PROVIDER_CATALOG,
  modelProvider,
  type ProviderApiMode,
  type ProviderProfile
} from "@hermes/shared/model-providers";
import type { ProviderConnection, ProviderCredentials } from "data-layer";
import { providerBehavior } from "./provider-behaviors";
import { createExternalProcessProvider } from "./process-provider";

export type ResolvedProvider = {
  readonly providerId: string;
  readonly model: string;
  readonly apiMode: ProviderApiMode;
  readonly baseUrl: string;
  readonly credential: ProviderCredentials;
  readonly profile: ProviderProfile;
};

export type ProviderRuntimeOptions = {
  readonly fetch?: typeof fetch;
  readonly resolveCredential: (handle: string) => ProviderCredentials | Promise<ProviderCredentials>;
};

export type ProviderModel = { readonly id: string; readonly label: string };

function requiredApiKey(credentials: ProviderCredentials, allowAnonymous = false): { readonly apiKey: string } {
  const apiKey = credentials.apiKey ?? credentials.copilotToken ?? credentials.accessToken;
  if (allowAnonymous && (apiKey === undefined || apiKey.trim().length === 0)) return { apiKey: "" };
  if (apiKey === undefined || apiKey.trim().length === 0) throw new Error("provider credential is unavailable");
  return { apiKey };
}

function requiredAwsCredentials(credentials: ProviderCredentials, baseUrl: string): { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string } {
  if (credentials.accessKeyId === undefined || credentials.secretAccessKey === undefined) throw new Error("bedrock_credentials_require_aws_sdk_runtime");
  const region = credentials.region ?? /bedrock-runtime\.([^.]+)\./.exec(new URL(baseUrl).hostname)?.[1] ?? "us-east-1";
  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }),
    region
  };
}

function hex(value: Uint8Array): string { return Buffer.from(value).toString("hex"); }
function hmac(key: Uint8Array | string, value: string): Uint8Array { return createHmac("sha256", key).update(value).digest(); }

function signBedrockRequest(request: Parameters<NonNullable<Parameters<typeof createBedrockConverseProvider>[0]["signRequest"]>>[0]): Headers {
  const url = new URL(request.url);
  const payloadHash = createHash("sha256").update(request.body).digest("hex");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const service = "bedrock";
  const host = url.host;
  const headers = new Headers(request.headers);
  headers.set("host", host);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);
  if (request.credentials.sessionToken !== undefined) headers.set("x-amz-security-token", request.credentials.sessionToken);
  const canonicalHeaders = [...headers.entries()]
    .filter(([name]) => name === name.toLowerCase())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = [...headers.keys()].filter(name => name === name.toLowerCase()).sort().join(";");
  const canonicalRequest = [request.method, url.pathname, url.search.slice(1), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${request.credentials.region}/${service}/aws4_request`;
  const canonicalHash = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${canonicalHash}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${request.credentials.secretAccessKey}`, date), request.credentials.region), service), "aws4_request");
  const signature = hex(hmac(signingKey, stringToSign));
  headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${request.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  return headers;
}

export async function resolveProvider(
  connection: ProviderConnection,
  resolveCredential: ProviderRuntimeOptions["resolveCredential"]
): Promise<ResolvedProvider> {
  const profile = modelProvider(connection.providerId);
  if (profile === undefined) throw new Error("provider_not_configured");
  const credential = await resolveCredential(connection.credentialHandle);
  return {
    providerId: profile.id,
    model: connection.model,
    apiMode: profile.apiMode,
    baseUrl: connection.baseUrl,
    credential,
    profile
  };
}

function requestForProfile(request: ProviderRequest, runtime: ResolvedProvider): ProviderRequest {
  const behavior = providerBehavior(runtime.providerId);
  const messagePrepared = behavior?.prepareMessages?.(request.messages, runtime);
  const withMessages = messagePrepared === undefined ? request : { ...request, messages: messagePrepared };
  const prepared = behavior?.prepareRequest?.(withMessages, runtime) ?? withMessages;
  const profile = runtime.profile;
  const profileBehavior = profile.request;
  if (profileBehavior === undefined) return prepared;
  const current = prepared.options ?? {};
  const { temperature: _temperature, ...withoutTemperature } = current;
  const options: ProviderModelOptions = {
    ...withoutTemperature,
    ...(profileBehavior.omitTemperature ? {} : profileBehavior.fixedTemperature === undefined ? (current.temperature === undefined ? {} : { temperature: current.temperature }) : { temperature: profileBehavior.fixedTemperature }),
    ...(profileBehavior.defaultMaxTokens !== undefined && current.maxTokens === undefined && current.maxOutputTokens === undefined ? { maxTokens: profileBehavior.defaultMaxTokens } : {})
  };
  return { ...prepared, options };
}

function wrapProfile(provider: ChatProvider, runtime: ResolvedProvider): ChatProvider {
  const adapt = (request: ProviderRequest): ProviderRequest => requestForProfile(request, runtime);
  if (provider.stream === undefined) return { complete: request => provider.complete(adapt(request)) };
  return { complete: request => provider.complete(adapt(request)), stream: request => provider.stream!(adapt(request)) };
}

export function createProvider(runtime: ResolvedProvider, options: ProviderRuntimeOptions): ChatProvider {
  const fetcher = options.fetch ?? fetch;
  if (runtime.profile.authType === "external_process") return createExternalProcessProvider(runtime.credential);
  switch (runtime.apiMode) {
    case "chat_completions":
      return wrapProfile(createOpenAICompatibleProvider({
        baseUrl: runtime.baseUrl,
        credentials: requiredApiKey(runtime.credential, runtime.profile.requiresCredential === false),
        fetch: fetcher,
        ...(runtime.profile.credentialHeader === undefined ? {} : { credentialHeader: runtime.profile.credentialHeader }),
        ...(runtime.profile.requiresCredential === false ? { omitCredential: true } : {}),
        ...(runtime.profile.defaultHeaders === undefined ? {} : { headers: runtime.profile.defaultHeaders }),
        ...(runtime.profile.request?.extraBody === undefined ? {} : { extraBody: runtime.profile.request.extraBody })
      }), runtime);
    case "anthropic_messages":
      return wrapProfile(createAnthropicProvider({
        baseUrl: runtime.baseUrl,
        credentials: requiredApiKey(runtime.credential),
        fetch: fetcher,
        ...(runtime.profile.credentialHeader === undefined ? {} : { credentialHeader: runtime.profile.credentialHeader === "x-goog-api-key" ? "x-api-key" : runtime.profile.credentialHeader }),
        ...(runtime.profile.defaultHeaders === undefined ? {} : { headers: runtime.profile.defaultHeaders })
      }), runtime);
    case "codex_responses":
      return wrapProfile(createResponsesProvider({
        baseUrl: runtime.baseUrl,
        credentials: requiredApiKey(runtime.credential),
        fetch: fetcher,
        ...(runtime.profile.credentialHeader === undefined ? {} : { credentialHeader: runtime.profile.credentialHeader === "x-goog-api-key" ? "x-api-key" : runtime.profile.credentialHeader }),
        ...(runtime.profile.defaultHeaders === undefined ? {} : { headers: runtime.profile.defaultHeaders })
      }), runtime);
    case "bedrock_converse":
      {
        const credentials = requiredAwsCredentials(runtime.credential, runtime.baseUrl);
        const endpoint = new URL(runtime.baseUrl);
        endpoint.hostname = endpoint.hostname.replace(/bedrock-runtime\.[^.]+\./, `bedrock-runtime.${credentials.region}.`);
      return createBedrockConverseProvider({
        baseUrl: endpoint.toString().replace(/\/$/, ""),
        credentials,
        fetch: fetcher,
        signRequest: signBedrockRequest
      });
      }
  }
}

function modelsEndpoint(profile: ProviderProfile, baseUrl: string): string | undefined {
  if (profile.modelsUrl !== undefined) return profile.modelsUrl;
  if (profile.apiMode !== "chat_completions" && profile.apiMode !== "codex_responses") return undefined;
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/models`.replace("/v1/v1/", "/v1/");
  return url.toString();
}

export async function listProviderModels(
  runtime: ResolvedProvider,
  options: Pick<ProviderRuntimeOptions, "fetch"> = {}
): Promise<readonly ProviderModel[]> {
  const fallback = [...new Set([runtime.model, ...(runtime.profile.fallbackModels ?? [])])].map(id => ({ id, label: id }));
  const behaviorModels = await providerBehavior(runtime.providerId)?.discoverModels?.(runtime, options.fetch ?? fetch);
  if (behaviorModels !== undefined && behaviorModels.length > 0) return behaviorModels;
  const endpoint = modelsEndpoint(runtime.profile, runtime.baseUrl);
  if (endpoint === undefined) return fallback;
  const apiKey = runtime.credential.apiKey ?? runtime.credential.copilotToken ?? runtime.credential.accessToken;
  if (apiKey === undefined || apiKey.trim().length === 0) return fallback;
  try {
    const credentialHeader = runtime.profile.credentialHeader ?? "authorization";
    const authorization = runtime.profile.requiresCredential === false
      ? {}
      : credentialHeader === "authorization" ? { authorization: `Bearer ${apiKey}` } : { [credentialHeader]: apiKey };
    const response = await (options.fetch ?? fetch)(endpoint, {
      headers: { ...runtime.profile.defaultHeaders, ...authorization },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return fallback;
    const payload: unknown = await response.json();
    const root = typeof payload === "object" && payload !== null ? payload as { data?: unknown; models?: unknown } : {};
    const values = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
    const models = [...new Set(values.map(value => {
      if (typeof value === "string") return value;
      if (typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
      return "";
    }).filter(Boolean))].sort().map(id => ({ id, label: id }));
    return models.length > 0 ? models : fallback;
  } catch {
    return fallback;
  }
}

export function listProviderProfiles(): readonly ProviderProfile[] {
  return MODEL_PROVIDER_CATALOG;
}
