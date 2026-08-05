import type { GatewayClientRequest } from "api-gateway/client";
import type { WorkspaceSummary } from "data-layer/contracts";

export function createMessageRequest(workspace: WorkspaceSummary, message: string): GatewayClientRequest {
  return { workspaceId: workspace.id, message };
}
