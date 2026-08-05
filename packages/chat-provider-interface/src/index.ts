export type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ProviderTool = {
  name: string;
  policy: "allow" | "ask" | "auto";
};

export type ProviderRequest = {
  model: string;
  messages: readonly ProviderMessage[];
  tools: readonly ProviderTool[];
  cancellation?: AbortSignal;
};

export type ProviderDelta = {
  text: string;
  done: boolean;
};

export type ProviderResult = {
  message: ProviderMessage;
  usage: { inputTokens: number; outputTokens: number };
};

export interface ChatProvider {
  complete(request: ProviderRequest): Promise<ProviderResult>;
}
