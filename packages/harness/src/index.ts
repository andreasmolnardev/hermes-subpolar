import type { ChatProvider, ProviderMessage, ProviderResult } from "chat-provider-interface";
import type { ResolvedTool } from "tool-resolver";

export type HarnessRequest = {
  model: string;
  messages: readonly ProviderMessage[];
  tools: readonly ResolvedTool[];
};

export type HarnessResult = ProviderResult;

export async function execute(request: HarnessRequest, provider: ChatProvider): Promise<HarnessResult> {
  return provider.complete({ model: request.model, messages: request.messages, tools: request.tools });
}
