import type { ChatMessage } from "data-layer/contracts";
import type { ChatProvider } from "chat-provider-interface";
import { execute, type HarnessResult } from "harness";
import { resolveTools, type ResolvedTool } from "tool-resolver";

export type GatewayExecutionRequest = {
  model: string;
  messages: readonly ChatMessage[];
  toolPolicies: Parameters<typeof resolveTools>[0];
};

export async function executeRequest(
  request: GatewayExecutionRequest,
  provider: ChatProvider
): Promise<HarnessResult> {
  return execute({
    model: request.model,
    messages: request.messages,
    tools: resolveTools(request.toolPolicies) as readonly ResolvedTool[]
  }, provider);
}
