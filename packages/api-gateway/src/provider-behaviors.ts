import type {
  ProviderJsonObject,
  ProviderMessage,
  ProviderRequest
} from "chat-provider-interface";
import type { ProviderProfile } from "@hermes/shared/model-providers";

export type ProviderBehaviorRuntime = {
  readonly providerId: string;
  readonly model: string;
  readonly profile: ProviderProfile;
};

export type ProviderBehavior = {
  readonly prepareRequest?: (request: ProviderRequest, runtime: ProviderBehaviorRuntime) => ProviderRequest;
  readonly prepareMessages?: (messages: readonly ProviderMessage[], runtime: ProviderBehaviorRuntime) => readonly ProviderMessage[];
  readonly discoverModels?: (runtime: ProviderBehaviorRuntime, fetcher: typeof fetch) => Promise<readonly { readonly id: string; readonly label: string }[]>;
};

const behaviors = new Map<string, ProviderBehavior>();

export function registerProviderBehavior(providerId: string, behavior: ProviderBehavior): void {
  if (!/^[a-z0-9-]+$/.test(providerId)) throw new TypeError("provider behavior id is invalid");
  if (behaviors.has(providerId)) throw new Error(`Provider behavior is already registered: ${providerId}`);
  behaviors.set(providerId, behavior);
}

export function providerBehavior(providerId: string): ProviderBehavior | undefined {
  return behaviors.get(providerId);
}

function withProviderOptions(request: ProviderRequest, options: ProviderJsonObject): ProviderRequest {
  return {
    ...request,
    providerOptions: {
      ...(request.providerOptions ?? {}),
      ...options
    }
  };
}

registerProviderBehavior("openrouter", {
  prepareRequest(request) {
    const effort = request.options?.reasoningEffort;
    return effort === undefined ? request : withProviderOptions(request, { reasoning: { effort } });
  }
});

registerProviderBehavior("gemini", {
  prepareRequest(request) {
    const effort = request.options?.reasoningEffort;
    if (effort === undefined) return request;
    const budgetTokens = effort === "high" ? 16_384 : effort === "medium" ? 8_192 : 4_096;
    return withProviderOptions(request, { thinking: { type: "enabled", budget_tokens: budgetTokens } });
  }
});

registerProviderBehavior("anthropic", {
  prepareRequest(request) {
    return request.cacheHints?.write === true
      ? withProviderOptions(request, { anthropic_cache: true })
      : request;
  }
});

registerProviderBehavior("anthropic-oauth", {
  prepareRequest(request) {
    return request.cacheHints?.write === true
      ? withProviderOptions(request, { anthropic_cache: true })
      : request;
  }
});

registerProviderBehavior("zai", {
  prepareRequest(request) {
    return request.options?.reasoningEffort === undefined
      ? request
      : withProviderOptions(request, { thinking: { type: "enabled" } });
  }
});
